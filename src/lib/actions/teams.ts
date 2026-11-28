"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export interface TeamRow { id: string; name: string; role: string; members: number }
export interface MemberRow { userId: string; email: string; role: string; joinedAt: string }
export interface InviteRow { id: string; email: string; role: string; expiresAt: string }
export interface ScanRow { id: string; title: string; label: string }
export type TeamResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function authenticatedClient() {
  const client = await supabaseServer();
  if (!client) return null;
  const { data: userData, error } = await client.auth.getUser();
  return error || !userData.user ? null : { client, user: userData.user };
}

export async function listTeams(): Promise<TeamRow[]> {
  const auth = await authenticatedClient();
  if (!auth) return [];
  const { data: mine } = await auth.client.from("team_members").select("team_id,role");
  if (!mine?.length) return [];
  const ids = mine.map((member) => member.team_id);
  const { data: teams } = await auth.client.from("teams").select("id,name").in("id", ids);
  const { data: all } = await auth.client.from("team_members").select("team_id").in("team_id", ids);
  return (teams ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    role: mine.find((member) => member.team_id === team.id)?.role ?? "member",
    members: (all ?? []).filter((member) => member.team_id === team.id).length,
  }));
}

export async function createTeam(name: string): Promise<TeamResult<{ id: string }>> {
  const auth = await authenticatedClient();
  if (!auth) return { ok: false, error: "Sign in to create a team." };
  const clean = name.trim().slice(0, 60);
  if (clean.length < 2) return { ok: false, error: "Team name must be at least 2 characters." };
  const { data, error } = await auth.client.from("teams").insert({ name: clean, owner_id: auth.user.id }).select("id").single();
  if (error || !data) return { ok: false, error: "Team could not be created." };
  revalidatePath("/team");
  return { ok: true, data: { id: data.id } };
}

export async function listMembers(teamId: string): Promise<MemberRow[]> {
  const auth = await authenticatedClient();
  if (!auth) return [];
  const { data } = await auth.client.from("team_members").select("user_id,role,created_at").eq("team_id", teamId);
  if (!data) return [];
  const { data: users } = await auth.client.from("users").select("id,email").in("id", data.map((member) => member.user_id));
  return data.map((member) => ({
    userId: member.user_id,
    email: users?.find((user) => user.id === member.user_id)?.email ?? "unknown",
    role: member.role,
    joinedAt: member.created_at,
  }));
}

export async function listInvites(teamId: string): Promise<InviteRow[]> {
  const auth = await authenticatedClient();
  if (!auth) return [];
  const { data } = await auth.client.from("team_invites").select("id,email,role,expires_at")
    .eq("team_id", teamId).is("accepted_at", null).gt("expires_at", new Date().toISOString());
  return (data ?? []).map((invite) => ({
    id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expires_at,
  }));
}

export async function inviteMember(teamId: string, email: string, role: string): Promise<TeamResult<{ token: string }>> {
  const auth = await authenticatedClient();
  if (!auth) return { ok: false, error: "Sign in to invite people." };
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]{1,64}@[^@\s]{1,120}\.[^@\s]{2,20}$/.test(clean)) return { ok: false, error: "Enter a valid email address." };
  if (role !== "admin" && role !== "member") return { ok: false, error: "Unknown role." };
  const token = randomBytes(24).toString("base64url");
  const { error } = await auth.client.from("team_invites").insert({
    team_id: teamId,
    email: clean,
    role,
    token_hash: createHash("sha256").update(token).digest("hex"),
    expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
  });
  if (error) return { ok: false, error: "Invite could not be created." };
  return { ok: true, data: { token } };
}

export async function acceptInvite(token: string): Promise<TeamResult> {
  const auth = await authenticatedClient();
  if (!auth) return { ok: false, error: "Sign in first, then open the invite link again." };
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(token)) {
    return { ok: false, error: "That invite link is not valid." };
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await auth.client.rpc("accept_team_invite", { invite_token_hash: tokenHash });
  if (error || data !== true) return { ok: false, error: "That invite is invalid, expired, already used, or belongs to another email." };
  revalidatePath("/team");
  return { ok: true };
}

export async function changeRole(teamId: string, userId: string, role: string): Promise<TeamResult> {
  const auth = await authenticatedClient();
  if (!auth) return { ok: false, error: "Sign in to manage team roles." };
  if (role !== "admin" && role !== "member") return { ok: false, error: "Unknown role." };
  const { error } = await auth.client.from("team_members").update({ role }).eq("team_id", teamId).eq("user_id", userId);
  return error ? { ok: false, error: "Role change failed." } : { ok: true };
}

export async function removeMembers(teamId: string, userIds: string[]): Promise<TeamResult> {
  const auth = await authenticatedClient();
  if (!auth || !userIds.length) return { ok: false, error: "Nothing to remove." };
  const { error } = await auth.client.from("team_members").delete()
    .eq("team_id", teamId).in("user_id", userIds.slice(0, 100));
  return error ? { ok: false, error: "Removal failed." } : { ok: true };
}

export async function revokeInvite(id: string): Promise<TeamResult> {
  const auth = await authenticatedClient();
  if (!auth) return { ok: false, error: "Sign in to revoke invites." };
  const { error } = await auth.client.from("team_invites").delete().eq("id", id);
  return error ? { ok: false, error: "Could not revoke the invite." } : { ok: true };
}

export async function listTeamScans(teamId: string): Promise<ScanRow[]> {
  const auth = await authenticatedClient();
  if (!auth) return [];
  const { data } = await auth.client.from("scans").select("id,title,label")
    .eq("team_id", teamId).order("created_at", { ascending: false }).limit(50);
  return (data ?? []).map((scan) => ({ id: scan.id, title: scan.title, label: scan.label ?? "No findings" }));
}

export async function listMyScans(): Promise<ScanRow[]> {
  const auth = await authenticatedClient();
  if (!auth) return [];
  const { data } = await auth.client.from("scans").select("id,title,label").is("team_id", null)
    .order("created_at", { ascending: false }).limit(50);
  return (data ?? []).map((scan) => ({ id: scan.id, title: scan.title, label: scan.label ?? "No findings" }));
}

export async function setScanTeam(scanId: string, teamId: string | null): Promise<TeamResult> {
  const auth = await authenticatedClient();
  if (!auth) return { ok: false, error: "Sign in to share reports with a team." };
  const { error } = await auth.client.from("scans").update({ team_id: teamId }).eq("id", scanId);
  return error ? { ok: false, error: "Could not update sharing." } : { ok: true };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import {
  acceptInvite, changeRole, createTeam, inviteMember, listInvites, listMembers, listMyScans,
  listTeamScans, listTeams, removeMembers, revokeInvite, setScanTeam,
  type InviteRow, type MemberRow, type ScanRow, type TeamRow,
} from "@/lib/actions/teams";
import { ACCOUNTS_ENABLED } from "@/lib/env/public";

const ROLE_COLOR: Record<string, string> = { owner: "#08745d", admin: "#58656b", member: "#246b96" };
const LABEL_COLOR: Record<string, string> = {
  "Critical risk": "#b42332", "High risk": "#b54708", "Needs review": "#946200",
  "Minor notes": "#246b96", "No findings": "#08745d",
};

export default function TeamPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [active, setActive] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [shared, setShared] = useState<ScanRow[]>([]);
  const [mine, setMine] = useState<ScanRow[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [teamName, setTeamName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [pick, setPick] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [undo, setUndo] = useState<MemberRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = useCallback((tone: "ok" | "warn", text: string) => {
    setNote({ tone, text });
    setTimeout(() => setNote(null), 6000);
  }, []);

  const refresh = useCallback(async () => {
    const rows = await listTeams();
    setTeams(rows);
    setActive((prev) => prev || rows[0]?.id || "");
  }, []);

  useEffect(() => {
    if (!ACCOUNTS_ENABLED) return;
    let activeEffect = true;
    void listTeams().then((rows) => {
      if (!activeEffect) return;
      setTeams(rows);
      setActive((previous) => previous || rows[0]?.id || "");
    });
    const token = new URLSearchParams(location.search).get("invite");
    if (token) {
      void acceptInvite(token).then(async (result) => {
        if (!activeEffect) return;
        flash(result.ok ? "ok" : "warn", result.ok ? "You joined the team." : result.error);
        if (result.ok) {
          const rows = await listTeams();
          if (activeEffect) {
            setTeams(rows);
            setActive((previous) => previous || rows[0]?.id || "");
          }
        }
      });
    }
    return () => { activeEffect = false; };
  }, [flash]);

  useEffect(() => {
    if (!active) return;
    void listMembers(active).then(setMembers);
    void listInvites(active).then(setInvites);
    void listTeamScans(active).then(setShared);
    void listMyScans().then(setMine);
  }, [active]);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 9000);
    return () => clearTimeout(timer);
  }, [undo]);

  const current = teams.find((team) => team.id === active);
  const canManage = current?.role === "owner" || current?.role === "admin";

  const onCreate = async () => {
    if (busy) return;
    setBusy(true);
    const result = await createTeam(teamName);
    if (result.ok && result.data) {
      setTeamName("");
      setSelected(new Set());
      setActive(result.data.id);
      await refresh();
      flash("ok", "Team created.");
    } else if (!result.ok) {
      flash("warn", result.error);
    }
    setBusy(false);
  };

  const onInvite = async () => {
    if (busy || !active) return;
    setBusy(true);
    const result = await inviteMember(active, email, role);
    if (result.ok && result.data) {
      setEmail("");
      setInvites(await listInvites(active));
      flash("ok", `Invite link — ${location.origin}/team?invite=${result.data.token}`);
    } else if (!result.ok) {
      flash("warn", result.error);
    }
    setBusy(false);
  };

  const onRemove = async (ids: string[]) => {
    const snapshot = members.filter((member) => ids.includes(member.userId));
    setMembers((previous) => previous.filter((member) => !ids.includes(member.userId)));
    setSelected(new Set());
    setUndo(snapshot);
    const result = await removeMembers(active, ids);
    if (!result.ok) {
      setMembers((previous) => [...previous, ...snapshot]);
      setUndo(null);
      flash("warn", result.error);
    }
  };

  const onShare = async (scanId: string, teamId: string | null) => {
    const result = await setScanTeam(scanId, teamId);
    if (!result.ok) return flash("warn", result.error);
    setShared(await listTeamScans(active));
    setMine(await listMyScans());
    setPick("");
    flash("ok", teamId ? "Report shared with the team." : "Report made private again.");
  };

  return (
    <AppShell active="teams">
      <main className="app-page space-y-5">
        <div className="app-page__heading">
          <h1>Team review</h1>
          <p>
            A workspace where reviewers read the same reports. Roles are enforced by row-level security in
            Postgres — removing someone revokes their access at the database, not just in this interface.
          </p>
        </div>

        {!ACCOUNTS_ENABLED ? (
          <section className="ss-panel border-l-2 border-l-[#946200] p-5">
            <div className="ss-label" style={{ color: "#946200" }}>Teams need accounts</div>
            <p className="mt-1.5 text-sm leading-relaxed text-[#58655f]">
              Set <span className="font-mono text-[#374541]">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
              <span className="font-mono text-[#374541]">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>, run{" "}
              <span className="font-mono text-[#374541]">0003_teams.sql</span>, then sign in from the history page.
              Scanning stays free and on-device either way.
            </p>
            <Link href="/history" className="ss-btn ss-btn-sm ss-btn-primary ss-focus mt-4 inline-flex">Go to sign in</Link>
          </section>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Teams", teams.length, "#08745d"],
                ["Members", members.length, "#246b96"],
                ["Pending", invites.length, "#946200"],
                ["Shared reports", shared.length, "#58656b"],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="ss-panel p-3 text-center">
                  <div className="text-2xl font-bold" style={{ color: String(color) }}>{value}</div>
                  <div className="ss-label mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            <section className="ss-panel flex flex-wrap items-center gap-2 p-3">
              <input
                className="ss-input ss-focus max-w-[220px] flex-1"
                placeholder="New team name"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                aria-label="New team name"
                onKeyDown={(event) => { if (event.key === "Enter") void onCreate(); }}
              />
              <button type="button" className="ss-btn ss-btn-sm ss-btn-primary ss-focus" onClick={onCreate} disabled={busy}>Create team</button>
              {teams.length > 0 ? (
                <select className="ss-input ss-focus ml-auto w-auto" value={active} onChange={(event) => {
                  setSelected(new Set());
                  setActive(event.target.value);
                }} aria-label="Active team">
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.role} · {team.members}</option>)}
                </select>
              ) : null}
            </section>

            {note ? <p className="ss-panel break-all p-3 text-xs" style={{ color: note.tone === "ok" ? "#08745d" : "#946200" }}>{note.text}</p> : null}

            {undo ? (
              <div className="ss-panel flex items-center gap-3 border-l-2 border-l-[#946200] p-3">
                <span className="text-sm text-[#946200]">{undo.length} member(s) removed</span>
                <button
                  type="button"
                  className="ss-btn ss-btn-sm ss-btn-primary ss-focus ml-auto"
                  onClick={() => { setMembers((previous) => [...previous, ...undo]); setUndo(null); flash("warn", "Restored in view — re-invite to persist."); }}
                >
                  Undo
                </button>
              </div>
            ) : null}

            {!active ? (
              <p className="ss-panel p-6 text-sm text-[#58655f]">Create a team to start sharing reports with other reviewers.</p>
            ) : (
              <>
                {canManage ? (
                  <section className="ss-panel flex flex-wrap items-center gap-2 p-3">
                    <input
                      className="ss-input ss-focus max-w-[240px] flex-1"
                      type="email"
                      placeholder="teammate@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      aria-label="Invite email"
                    />
                    <select className="ss-input ss-focus w-auto" value={role} onChange={(event) => setRole(event.target.value as "admin" | "member")} aria-label="Invite role">
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={onInvite} disabled={busy}>Invite</button>
                  </section>
                ) : null}

                {selected.size > 0 && canManage ? (
                  <div className="ss-panel flex items-center gap-2 border-l-2 border-l-[#246b96] p-3">
                    <span className="text-sm text-[#374541]">{selected.size} selected</span>
                    <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={() => onRemove([...selected])}>Remove</button>
                    <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={() => setSelected(new Set())}>Clear</button>
                  </div>
                ) : null}

                <section className="ss-panel overflow-hidden">
                  <div className="ss-label px-4 py-3">Members · {members.length}</div>
                  <ul className="space-y-px bg-[#e4e9e5]">
                    {members.map((member) => (
                      <li key={member.userId} className="flex flex-wrap items-center gap-3 bg-[#ffffff] px-4 py-3">
                        {canManage && member.role !== "owner" ? (
                          <input
                            type="checkbox"
                            className="ss-focus h-3.5 w-3.5 accent-[#246b96]"
                            checked={selected.has(member.userId)}
                            onChange={() => setSelected((previous) => {
                              const next = new Set(previous);
                              if (next.has(member.userId)) next.delete(member.userId); else next.add(member.userId);
                              return next;
                            })}
                            aria-label={`Select ${member.email}`}
                          />
                        ) : null}
                        <span className="flex-1 text-sm text-[#374541]">{member.email}</span>
                        {canManage && member.role !== "owner" ? (
                          <select
                            className="ss-input ss-focus w-auto"
                            value={member.role}
                            aria-label={`Role for ${member.email}`}
                            onChange={async (event) => {
                              const next = event.target.value;
                              setMembers((previous) => previous.map((entry) => entry.userId === member.userId ? { ...entry, role: next } : entry));
                              const result = await changeRole(active, member.userId, next);
                              if (!result.ok) flash("warn", result.error);
                            }}
                          >
                            <option value="admin">admin</option>
                            <option value="member">member</option>
                          </select>
                        ) : (
                          <span className="ss-pill" style={{ background: ROLE_COLOR[member.role], color: "#ffffff" }}>{member.role}</span>
                        )}
                        <span className="text-[11px] text-[#65736d]">{new Date(member.joinedAt).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {invites.length > 0 ? (
                  <section className="ss-panel overflow-hidden">
                    <div className="ss-label px-4 py-3">Pending invites · {invites.length}</div>
                    <ul className="space-y-px bg-[#e4e9e5]">
                      {invites.map((invite) => (
                        <li key={invite.id} className="flex flex-wrap items-center gap-3 bg-[#ffffff] px-4 py-3">
                          <span className="flex-1 text-sm text-[#374541]">{invite.email}</span>
                          <span className="ss-pill" style={{ background: ROLE_COLOR[invite.role], color: "#ffffff" }}>{invite.role}</span>
                          <span className="text-[11px] text-[#65736d]">expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
                          {canManage ? (
                            <button
                              type="button"
                              className="ss-btn ss-btn-sm ss-btn-ghost ss-focus"
                              onClick={async () => {
                                setInvites((previous) => previous.filter((entry) => entry.id !== invite.id));
                                const result = await revokeInvite(invite.id);
                                if (!result.ok) flash("warn", result.error);
                              }}
                            >
                              Revoke
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section className="ss-panel overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <span className="ss-label">Team reports · {shared.length}</span>
                    {mine.length > 0 ? (
                      <span className="ml-auto flex gap-1.5">
                        <select className="ss-input ss-focus w-auto" value={pick} onChange={(event) => setPick(event.target.value)} aria-label="Report to share">
                          <option value="">Choose a private report…</option>
                          {mine.map((scan) => <option key={scan.id} value={scan.id}>{scan.title}</option>)}
                        </select>
                        <button type="button" className="ss-btn ss-btn-sm ss-focus" disabled={!pick} onClick={() => onShare(pick, active)}>Share</button>
                      </span>
                    ) : null}
                  </div>
                  {shared.length === 0 ? (
                    <p className="px-4 pb-4 text-xs text-[#58655f]">Nothing shared yet. Save a scan from the scanner, then share it here.</p>
                  ) : (
                    <ul className="space-y-px bg-[#e4e9e5]">
                      {shared.map((scan) => (
                        <li key={scan.id} className="flex flex-wrap items-center gap-3 bg-[#ffffff] px-4 py-3">
                          <span className="h-6 w-1 rounded-full" style={{ background: LABEL_COLOR[scan.label] ?? "#246b96" }} />
                          <span className="flex-1 text-sm text-[#374541]">{scan.title}</span>
                          <span className="text-[11px] text-[#65736d]">{scan.label}</span>
                          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={() => onShare(scan.id, null)}>Make private</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { mintShareToken, shareExpiry, sharingConfigured } from "@/lib/share/token";
import { createHash } from "node:crypto";
import type { HistoryRecord } from "@/lib/history/types";

const findingSchema = z.object({
  ruleId: z.string().max(20),
  category: z.number().int().min(1).max(10),
  categoryName: z.string().max(60),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]),
  layer: z.string().max(4),
  file: z.string().max(300),
  line: z.number().int().min(0).max(1_000_000),
  start: z.number().int().min(0).max(10_000_000),
  snippet: z.string().max(2000),
  why: z.string().max(2000),
  fix: z.string().max(2000),
  confidence: z.number().min(0).max(1),
});

const saveSchema = z.object({
  title: z.string().min(1).max(120),
  sourceType: z.enum(["paste", "file", "zip"]),
  verdict: z.enum(["SAFE", "SUSPICIOUS", "MALICIOUS"]),
  label: z.string().max(40),
  score100: z.number().int().min(0).max(100),
  rawScore: z.number().int().min(0),
  catalogVersion: z.number().int().min(0),
  fileCount: z.number().int().min(0).max(1000),
  bundleHash: z.string().max(64).optional(),
  findings: z.array(findingSchema).max(2000),
});

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export async function saveReport(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await currentUser();
  const client = await supabaseServer();
  if (!user || !client) return { ok: false, error: "Sign in to save a report." };

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That report could not be validated for saving." };
  const payload = parsed.data;

  const { data: scan, error } = await client
    .from("scans")
    .insert({
      user_id: user.id,
      title: payload.title,
      source_type: payload.sourceType,
      status: "completed",
      verdict: payload.verdict,
      label: payload.label,
      score: payload.score100,
      raw_score: payload.rawScore,
      catalog_version: payload.catalogVersion,
      bundle_hash: payload.bundleHash ?? null,
      file_count: payload.fileCount,
    })
    .select("id")
    .single();

  if (error || !scan) return { ok: false, error: "The report could not be saved." };

  if (payload.findings.length > 0) {
    const rows = payload.findings.map((f) => ({
      scan_id: scan.id,
      rule_id: f.ruleId,
      category: `${f.category} · ${f.categoryName}`,
      severity: f.severity,
      layer: f.layer,
      file: f.file,
      line: f.line,
      start_offset: f.start,
      snippet: f.snippet,
      why: f.why,
      fix: f.fix,
      confidence: f.confidence,
    }));
    const { error: findingError } = await client.from("findings").insert(rows);
    if (findingError) {
      await client.from("scans").delete().eq("id", scan.id);
      return { ok: false, error: "Findings could not be saved; the report was rolled back." };
    }
  }

  revalidatePath("/history");
  return { ok: true, data: { id: scan.id } };
}

export async function renameReport(id: string, title: string): Promise<ActionResult> {
  const client = await supabaseServer();
  if (!client) return { ok: false, error: "Accounts are not configured." };
  const clean = title.trim().slice(0, 120);
  if (!clean) return { ok: false, error: "Give the report a name." };
  const { error } = await client.from("scans").update({ title: clean }).eq("id", id);
  if (error) return { ok: false, error: "Rename failed." };
  revalidatePath("/history");
  return { ok: true };
}

export async function archiveReports(ids: string[], archived: boolean): Promise<ActionResult> {
  const client = await supabaseServer();
  if (!client || ids.length === 0) return { ok: false, error: "Nothing to update." };
  const { error } = await client
    .from("scans")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .in("id", ids.slice(0, 200));
  if (error) return { ok: false, error: "Archive update failed." };
  revalidatePath("/history");
  return { ok: true };
}

export async function deleteReports(ids: string[]): Promise<ActionResult> {
  const client = await supabaseServer();
  if (!client || ids.length === 0) return { ok: false, error: "Nothing to delete." };
  const { error } = await client.from("scans").delete().in("id", ids.slice(0, 200));
  if (error) return { ok: false, error: "Delete failed." };
  revalidatePath("/history");
  return { ok: true };
}

export async function createShare(scanId: string): Promise<ActionResult<{ token: string }>> {
  const user = await currentUser();
  const client = await supabaseServer();
  if (!user || !client) return { ok: false, error: "Sign in to share a report." };
  if (!sharingConfigured()) return { ok: false, error: "Set REPORT_SIGNING_SECRET (32+ chars) to enable share links." };

  const { data: owned } = await client.from("scans").select("id").eq("id", scanId).maybeSingle();
  if (!owned) return { ok: false, error: "That report is not yours to share." };

  const token = mintShareToken(scanId);
  if (!token) return { ok: false, error: "Share link could not be signed." };

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error } = await client.from("shares").insert({
    scan_id: scanId,
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: shareExpiry(),
  });
  if (error) return { ok: false, error: "Share link could not be recorded." };

  return { ok: true, data: { token } };
}

export async function revokeShares(scanId: string): Promise<ActionResult> {
  const client = await supabaseServer();
  if (!client) return { ok: false, error: "Accounts are not configured." };
  const { error } = await client
    .from("shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("scan_id", scanId);
  if (error) return { ok: false, error: "Could not revoke links." };
  revalidatePath("/history");
  return { ok: true };
}

export async function persistView(name: string, query: string, severity: string, sort: string): Promise<ActionResult> {
  const user = await currentUser();
  const client = await supabaseServer();
  if (!user || !client) return { ok: false, error: "Sign in to save views." };
  const { error } = await client.from("saved_views").insert({
    user_id: user.id, name: name.slice(0, 60), query: query.slice(0, 120),
    severity: severity.slice(0, 10), sort: sort.slice(0, 10),
  });
  if (error) return { ok: false, error: "View could not be saved." };
  revalidatePath("/history");
  return { ok: true };
}

export async function loadPersisted(): Promise<HistoryRecord[]> {
  const client = await supabaseServer();
  if (!client) return [];
  const { data: scans } = await client
    .from("scans")
    .select("id,title,created_at,source_type,verdict,label,score,raw_score,catalog_version,file_count,bundle_hash,archived_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!scans || scans.length === 0) return [];

  const { data: findings } = await client
    .from("findings")
    .select("scan_id,rule_id,category,severity,layer,file,line,start_offset,snippet,why,fix,confidence")
    .in("scan_id", scans.map((s) => s.id));

  const counts = () => ({ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 });
  return scans.map((scan) => {
    const own = (findings ?? []).filter((f) => f.scan_id === scan.id);
    const tally = counts();
    return {
      id: scan.id,
      title: scan.title,
      createdAt: scan.created_at,
      sourceType: scan.source_type,
      verdict: scan.verdict ?? "SAFE",
      label: scan.label ?? "No findings",
      score100: scan.score ?? 0,
      rawScore: scan.raw_score ?? 0,
      catalogVersion: scan.catalog_version,
      fileCount: scan.file_count,
      bundleHash: scan.bundle_hash ?? undefined,
      archivedAt: scan.archived_at,
      counts: own.reduce((acc, f) => { acc[f.severity as keyof typeof acc] += 1; return acc; }, tally),
      findings: own.map((f) => ({
        ruleId: f.rule_id,
        category: Number.parseInt(String(f.category), 10) || 1,
        categoryName: String(f.category).replace(/^\d+\s·\s/, ""),
        severity: f.severity,
        layer: f.layer ?? "L1",
        file: f.file,
        line: f.line ?? 1,
        start: f.start_offset ?? 0,
        snippet: f.snippet ?? "",
        why: f.why,
        fix: f.fix,
        confidence: f.confidence ?? 0.9,
      })),
    } as HistoryRecord;
  });
}

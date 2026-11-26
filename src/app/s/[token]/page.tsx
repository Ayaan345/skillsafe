import Link from "next/link";
import { Verdict } from "@/components/verdict";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyShareToken } from "@/lib/share/token";
import { groupByCategory } from "@/lib/scan/group";
import type { Finding, ScanReport, Severity } from "@/lib/scan/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared report · SkillSafe", robots: { index: false, follow: false } };

const SEV_COLOR: Record<Severity, string> = {
  CRITICAL: "#ff3b5c", HIGH: "#ff8a3d", MEDIUM: "#ffc53d", LOW: "#4da3ff", INFO: "#a78bfa",
};

export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = verifyShareToken(token);
  const admin = claim ? supabaseAdmin() : null;

  let report: ScanReport | null = null;
  let title = "Shared report";

  if (claim && admin) {
    const { data: scan } = await admin
      .from("scans").select("id,title,verdict,label,score,raw_score,catalog_version,file_count")
      .eq("id", claim.scanId).maybeSingle();
    const { data: share } = await admin
      .from("shares").select("revoked_at").eq("scan_id", claim.scanId).is("revoked_at", null).limit(1);

    if (scan && share && share.length > 0) {
      const { data: rows } = await admin
        .from("findings").select("rule_id,category,severity,layer,file,line,start_offset,snippet,why,fix,confidence")
        .eq("scan_id", scan.id);

      const findings: Finding[] = (rows ?? []).map((f) => ({
        ruleId: f.rule_id,
        category: Number.parseInt(String(f.category), 10) || 1,
        categoryName: String(f.category).replace(/^\d+\s·\s/, ""),
        severity: f.severity, layer: f.layer ?? "L1", file: f.file,
        line: f.line ?? 1, start: f.start_offset ?? 0,
        snippet: f.snippet ?? "", why: f.why, fix: f.fix, confidence: f.confidence ?? 0.9,
      }));

      const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
      for (const f of findings) counts[f.severity] += 1;

      title = scan.title;
      report = {
        findings, counts,
        score: scan.raw_score ?? 0, score100: scan.score ?? 0,
        verdict: scan.verdict ?? "SAFE", label: scan.label ?? "No findings",
        filesScanned: scan.file_count, layersRun: ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7"],
        durationMs: 0, truncated: false, catalogVersion: scan.catalog_version,
      };
    }
  }

  return (
    <>
      <div className="ss-bg" />
      <div className="ss-grid" />
      <header className="ss-bar">
        <Link href="/" className="ss-focus text-[15px] font-bold tracking-tight">SkillSafe</Link>
        <span className="ss-chip ml-auto">read-only shared report</span>
      </header>

      <main className="relative z-10 mx-auto max-w-[900px] space-y-4 px-4 pb-16 pt-[calc(var(--bar-h)+26px)]">
        {!report ? (
          <div className="ss-panel border-l-2 border-l-[#ff3b5c] p-6">
            <h1 className="text-xl font-bold text-[#ff3b5c]">This link is not available</h1>
            <p className="mt-2 text-sm text-[#8fa3bf]">
              It may have expired, been revoked by its owner, or the signature does not match. Share links are
              signed and valid for seven days.
            </p>
            <Link href="/" className="ss-btn ss-btn-sm ss-btn-primary ss-focus mt-4 inline-flex">Scan a skill yourself</Link>
          </div>
        ) : (
          <>
            <div>
              <div className="ss-label">Shared report</div>
              <h1 className="mt-1 text-[26px] font-bold tracking-tight">{title}</h1>
            </div>
            <Verdict report={report} mode="worker" dismissedCount={0} />
            {groupByCategory(report.findings).map((group) => (
              <section key={group.category} className="ss-panel p-4">
                <div className="ss-label">{group.category}. {group.categoryName}</div>
                <ul className="mt-2 space-y-2">
                  {group.findings.map((f, i) => (
                    <li key={`${f.ruleId}-${i}`} className="rounded-md border border-[#18233c] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`ss-pill ss-${f.severity}`}>{f.severity}</span>
                        <code className="text-xs text-[#3df5c4]">{f.ruleId}</code>
                        <span className="text-[11px] text-[#8296b3]">{f.file}:{f.line}</span>
                      </div>
                      <pre dir="ltr" className="ss-evidence mt-2" style={{ borderLeftColor: SEV_COLOR[f.severity] }}>{f.snippet}</pre>
                      <p className="mt-2 text-sm text-[#c3d2e6]">{f.why}</p>
                      <p className="mt-1 text-sm text-[#8fa3bf]">{f.fix}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="text-xs text-[#8296b3]">
              Static analysis only. A clean report means no known pattern matched, not that the skill is certified safe.
            </p>
          </>
        )}
      </main>
    </>
  );
}

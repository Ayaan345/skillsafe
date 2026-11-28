import { AppShell } from "@/components/app-shell";
import { DiffWorkspace } from "@/components/diff-workspace";
import { loadPersisted } from "@/lib/actions/reports";
import { accountsConfigured } from "@/lib/env/server";
import { currentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compare scans · SkillSafe" };

export default async function DiffPage() {
  const user = accountsConfigured() ? await currentUser() : null;
  const records = user ? await loadPersisted() : [];

  return (
    <AppShell active="compare">
      <main className="app-page space-y-5">
        <div className="app-page__heading">
          <h1>Compare scans</h1>
          <p>
            Two scans side by side. Findings are matched on rule, file and snippet rather than line number, so a
            shifted line does not read as a wholesale removal and re-addition — a verdict change stays explainable.
          </p>
        </div>
        <DiffWorkspace initial={records} />
      </main>
    </AppShell>
  );
}

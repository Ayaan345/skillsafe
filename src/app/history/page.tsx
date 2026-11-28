import { AuthPanel } from "@/components/auth-panel";
import { AppShell } from "@/components/app-shell";
import { HistoryView } from "@/components/history-view";
import { loadPersisted } from "@/lib/actions/reports";
import { accountsConfigured } from "@/lib/env/server";
import { currentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "History · SkillSafe" };

export default async function HistoryPage() {
  const configured = accountsConfigured();
  const user = configured ? await currentUser() : null;
  const records = user ? await loadPersisted() : [];

  return (
    <AppShell active="history">
      <main className="app-page space-y-5">
        <div className="app-page__heading">
          <h1>Saved reports</h1>
          <p>
            Every report you keep, with its full findings. Search, filter, rename, archive, bulk-delete with undo,
            and save the filter combinations you use most.
          </p>
        </div>

        <AuthPanel email={user?.email ?? null} />
        <HistoryView initial={records} connected={Boolean(user)} />
      </main>
    </AppShell>
  );
}

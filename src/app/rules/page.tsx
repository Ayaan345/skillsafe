import { CatalogBrowser } from "@/components/catalog-browser";
import { AppShell } from "@/components/app-shell";

export const metadata = {
  title: "Rule catalog · SkillSafe",
  description: "Every detection rule SkillSafe runs, its severity, layer, and live tuning state.",
};

export default function RulesPage() {
  return (
    <AppShell active="rules">
      <main className="app-page">
        <div className="app-page__heading">
          <h1>Detection rules</h1>
          <p>
            Review what each rule checks, why it matters, and the bounded pattern it uses.
          </p>
        </div>

        <div className="mt-5">
          <CatalogBrowser />
        </div>
      </main>
    </AppShell>
  );
}

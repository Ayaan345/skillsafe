import Link from "next/link";
import { CatalogBrowser } from "@/components/catalog-browser";

export const metadata = {
  title: "Rule catalog · SkillSafe",
  description: "Every detection rule SkillSafe runs, its severity, layer, and live tuning state.",
};

export default function RulesPage() {
  return (
    <>
      <div className="ss-bg" />
      <div className="ss-grid" />

      <header className="ss-bar">
        <Link href="/" className="ss-focus flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2 4 5.5v6.2c0 5 3.4 9.3 8 10.3 4.6-1 8-5.3 8-10.3V5.5Z" fill="none" stroke="#3df5c4" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="12" cy="11.5" r="3.1" fill="none" stroke="#4da3ff" strokeWidth="1.6" />
          </svg>
          <span className="text-[15px] font-bold tracking-tight">SkillSafe</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1.5">
          <Link href="/" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus">Scanner</Link>
          <span className="ss-btn ss-btn-sm ss-btn-primary">Rule catalog</span>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-[1100px] px-4 pb-16 pt-[calc(var(--bar-h)+26px)]">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[32px]">
          Every rule, in the open
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-[#8fa3bf]">
          A scanner you cannot inspect is just another black box. Here is the full catalog: what each rule looks
          for, why it matters, what to do about it, and the exact bounded pattern where one is used.
        </p>

        <div className="mt-5">
          <CatalogBrowser />
        </div>
      </main>
    </>
  );
}

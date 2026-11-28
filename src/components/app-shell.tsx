"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, ShieldCheck, X } from "lucide-react";

const LINKS = [
  { href: "/", label: "Scanner", id: "scanner" },
  { href: "/rules", label: "Rules", id: "rules" },
  { href: "/history", label: "History", id: "history" },
  { href: "/diff", label: "Compare", id: "compare" },
  { href: "/team", label: "Teams", id: "teams" },
] as const;

type AppRoute = (typeof LINKS)[number]["id"];

export function AppShell({
  active,
  children,
  variant = "app",
}: {
  active?: AppRoute;
  children: ReactNode;
  variant?: "app" | "shared";
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <Link className="app-brand" href="/" aria-label="SkillSafe home">
            <ShieldCheck className="app-brand__mark" aria-hidden="true" />
            <span>SkillSafe</span>
          </Link>

          {variant === "shared" ? (
            <span className="app-readonly">Read-only shared report</span>
          ) : (
            <>
              <span className="app-security">
                <span className="app-security__dot" />
                Scans run in your browser
              </span>
              <button
                type="button"
                className="app-menu-toggle"
                aria-label={menuOpen ? "Close navigation" : "Open navigation"}
                aria-expanded={menuOpen}
                aria-controls="primary-navigation"
                onClick={() => setMenuOpen((open) => !open)}
              >
                {menuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
              </button>
              <nav
                id="primary-navigation"
                className={`app-nav${menuOpen ? " is-open" : ""}`}
                aria-label="Primary navigation"
              >
                {LINKS.map((link) => (
                  <Link
                    key={link.id}
                    href={link.href}
                    className="app-nav__link"
                    aria-current={active === link.id ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </>
          )}
        </div>
      </header>
      <div className="app-content">{children}</div>
    </div>
  );
}

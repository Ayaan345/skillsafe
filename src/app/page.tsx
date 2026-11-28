import { Scanner } from "@/components/scanner";
import { AppShell } from "@/components/app-shell";

// Nonce-based CSP requires per-request HTML. Without this, a prerendered page
// ships build-time scripts that the production CSP then blocks.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Home() {
  return (
    <AppShell active="scanner">
      <Scanner />
    </AppShell>
  );
}
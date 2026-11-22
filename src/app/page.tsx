import { Scanner } from "@/components/scanner";

// Nonce-based CSP requires per-request HTML. Without this, a prerendered page
// ships build-time scripts that the production CSP then blocks.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Home() {
  return <Scanner />;
}
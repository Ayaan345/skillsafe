"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ACCOUNTS_ENABLED } from "@/lib/env/public";

export function AuthPanel({ email }: { email: string | null }) {
  const [address, setAddress] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (!ACCOUNTS_ENABLED) {
    return (
      <section className="ss-panel border-l-2 border-l-[#946200] p-4">
        <div className="ss-label" style={{ color: "#946200" }}>Accounts are off on this deployment</div>
        <p className="mt-1.5 text-xs leading-relaxed text-[#58655f]">
          Scanning is fully functional and stays on your device. To save reports and share links, create a free
          Supabase project, run <span className="font-mono text-[#374541]">0002_persistence.sql</span>, and set{" "}
          <span className="font-mono text-[#374541]">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
          <span className="font-mono text-[#374541]">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>. Until then, history
          below is kept in this browser session only.
        </p>
      </section>
    );
  }

  const client = supabaseBrowser();

  const sendLink = async () => {
    if (!client || !address.trim()) return;
    setState("sending");
    setMessage(null);
    const { error } = await client.auth.signInWithOtp({
      email: address.trim(),
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=/history` },
    });
    if (error) { setState("error"); setMessage(error.message); }
    else { setState("sent"); setMessage("Check your inbox for the sign-in link."); }
  };

  const github = async () => {
    if (!client) return;
    const { error } = await client.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${location.origin}/auth/callback?next=/history` },
    });
    if (error) { setState("error"); setMessage(error.message); }
  };

  const signOut = async () => {
    if (!client) return;
    await client.auth.signOut();
    location.reload();
  };

  if (email) {
    return (
      <section className="ss-panel flex flex-wrap items-center gap-3 p-4">
        <span className="ss-dot" />
        <span className="text-sm text-[#374541]">Signed in as <span className="font-semibold">{email}</span></span>
        <button type="button" className="ss-btn ss-btn-sm ss-focus ml-auto" onClick={signOut}>Sign out</button>
      </section>
    );
  }

  return (
    <section className="ss-panel space-y-3 p-4">
      <div>
        <div className="ss-label">Sign in to save and share</div>
        <p className="mt-1 text-xs text-[#58655f]">
          Optional. Anonymous scans are never written to the database — only a report you explicitly save.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="ss-input ss-focus max-w-[260px] flex-1"
          aria-label="Email address"
        />
        <button type="button" className="ss-btn ss-btn-sm ss-btn-primary ss-focus" onClick={sendLink} disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Email me a link"}
        </button>
        <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={github}>Continue with GitHub</button>
      </div>
      {message ? (
        <p className="text-xs" style={{ color: state === "error" ? "#b42332" : "#08745d" }}>{message}</p>
      ) : null}
    </section>
  );
}

"use client";

import { useState } from "react";
import { createShare, revokeShares } from "@/lib/actions/reports";
import { ACCOUNTS_ENABLED } from "@/lib/env/public";

export function ShareReport({ scanId }: { scanId: string | null }) {
  const [link, setLink] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ACCOUNTS_ENABLED || !scanId) return null;

  const mint = async () => {
    setBusy(true);
    setNote(null);
    const result = await createShare(scanId);
    if (result.ok && result.data) setLink(`${location.origin}/s/${result.data.token}`);
    else setNote(result.ok ? "Could not create link." : result.error);
    setBusy(false);
  };

  const revoke = async () => {
    setBusy(true);
    const result = await revokeShares(scanId);
    setNote(result.ok ? "All links for this report revoked." : result.error);
    if (result.ok) setLink(null);
    setBusy(false);
  };

  return (
    <section className="ss-panel space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ss-label">Share</span>
        <button type="button" className="ss-btn ss-btn-sm ss-focus" onClick={mint} disabled={busy}>Create signed link</button>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={revoke} disabled={busy}>Revoke links</button>
        {link ? (
          <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-focus" onClick={() => navigator.clipboard.writeText(link)}>Copy</button>
        ) : null}
      </div>
      {link ? <pre dir="ltr" className="ss-evidence" style={{ borderLeftColor: "#08745d" }}>{link}</pre> : null}
      <p className="text-[11px] text-[#65736d]">
        Signed, expires in seven days, revocable at any time. Anyone with the link sees the report read-only.
      </p>
      {note ? <p className="text-xs text-[#946200]">{note}</p> : null}
    </section>
  );
}

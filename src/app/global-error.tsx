"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#070b14", color: "#e6edf7", fontFamily: "system-ui, sans-serif", padding: "48px 16px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", border: "1px solid #18233c", borderLeft: "3px solid #ff3b5c", borderRadius: 12, padding: 24 }}>
          <h1 style={{ color: "#ff3b5c", fontSize: 20, margin: 0 }}>SkillSafe failed to start</h1>
          <p style={{ color: "#8fa3bf", fontSize: 14, marginTop: 8 }}>
            The application shell could not load. This is usually a blocked script.
          </p>
          <pre style={{ background: "#0b1120", border: "1px solid #18233c", borderRadius: 8, padding: 12, fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {error.message || "Unknown error"}
          </pre>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, background: "#3df5c4", color: "#04121a", border: 0, borderRadius: 10, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}

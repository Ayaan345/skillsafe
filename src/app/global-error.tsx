"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#f5f7f5", color: "#1b2724", fontFamily: "system-ui, sans-serif", padding: "48px 16px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", border: "1px solid #e4e9e5", borderLeft: "3px solid #b42332", borderRadius: 12, padding: 24 }}>
          <h1 style={{ color: "#b42332", fontSize: 20, margin: 0 }}>SkillSafe failed to start</h1>
          <p style={{ color: "#58655f", fontSize: 14, marginTop: 8 }}>
            The application shell could not load. This is usually a blocked script.
          </p>
          <pre style={{ background: "#ffffff", border: "1px solid #e4e9e5", borderRadius: 8, padding: 12, fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {error.message || "Unknown error"}
          </pre>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, background: "#08745d", color: "#ffffff", border: 0, borderRadius: 10, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}

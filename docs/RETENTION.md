# SkillSafe — data retention policy

Status: applies to the current build (client-only, no backend configured).

## What is stored today

Nothing. There is no database, no account system, and no server-side scan endpoint
in this build. Every scan runs inside a Web Worker in the visitor's own browser.

| Data | Where it lives | Lifetime |
|---|---|---|
| Pasted text, uploaded file bytes, extracted archive entries | Browser memory (Worker) | Discarded when the Worker terminates at the end of the scan |
| Extracted metadata strings, findings, scores | Browser memory (React state) | Until the next scan, page reload, or tab close |
| Per-file and bundle SHA-256 hashes | Browser memory | Same as above |
| False-positive marks | Browser memory, scoped to one report | Reset on every new scan; never written to disk or localStorage |
| Exported JSON report | A file the user explicitly downloads | Under the user's control, outside the app |

## What is never collected

- No scan content, filenames, hashes, or findings are transmitted anywhere.
- No cookies, no localStorage, no sessionStorage, no IndexedDB.
- No analytics, no telemetry, no third-party scripts.
- No account, email, or IP address is recorded, because no request is made.

The Content-Security-Policy `connect-src` is restricted to `'self'` (plus the
dev-only hot-reload socket), so an injected script cannot exfiltrate scan content
even if one were somehow introduced.

## Verifying this

Open DevTools → Network, run a scan, and confirm no request is issued for the
scan itself. The report's "Artifacts & ingestion" panel shows every hash computed
locally.

## Commitments for when a backend is added (not yet active)

These are design commitments for the optional accounts/deep-scan tier. None of
this code is running today.

1. Anonymous scans are never persisted. Only a signed-in user's explicit
   "save this report" writes a row.
2. Uploaded files auto-expire from object storage within 24 hours.
3. Deleting history hard-deletes the scan, its findings, and its stored files.
4. Deep-scan lookups send the minimum: a URL, a package name/version, or a hash.
   File content is never sent to a reputation provider.
5. The optional semantic pass is classification-only, with no tool access, and
   its output is treated as untrusted data, never as an instruction.
6. Hash reputation lists store hashes only, never the underlying content.

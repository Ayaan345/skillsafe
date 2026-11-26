# SkillSafe — data retention policy

## What stays on-device

The default scan runs in the visitor's browser. Pasted text, uploaded file bytes,
extracted archive entries, metadata strings, findings, and scores remain in
browser memory unless the user explicitly chooses an optional feature that sends
the minimum data described below.

| Data | Where it lives | Lifetime |
|---|---|---|
| Pasted text, uploaded file bytes, extracted archive entries | Browser memory (Worker) | Discarded after the scan |
| Extracted metadata strings, findings, scores, and hashes | Browser memory (React state) | Until the next scan, page reload, or tab close |
| Unsaved session-history records and feedback marks | Browser memory | Current browser session |
| Exported JSON report | A file the user explicitly downloads | Under the user's control |

## What is never collected by the offline scan

- File bytes, filenames, hashes, findings, or verdicts are not uploaded by the
  offline scan.
- Scan contents are not written to localStorage, sessionStorage, or IndexedDB.
- No analytics or telemetry are sent.
- Signing in sends account authentication data to the configured Supabase
  project; it does not upload scans by itself.

## Optional dependency advisory check

The "Dependency advisories" control sends only package names, exact versions, and
ecosystem labels to SkillSafe's `/api/osv` route, which forwards them to the
fixed `api.osv.dev` endpoint. Only exact version pins are queried. The request
is explicit, rate-limited per server instance, and contains no file content,
filenames, hashes, or verdicts.

## Hash reputation

Each scan may fetch `/hash-lists.json` from this site. It contains hashes only;
the fetch sends no scan data and does not transmit the hashes being checked.

## OCR image text

The "Read text inside images" control runs recognition in the browser using
locally served Tesseract assets. Image pixels and recognized text are not
uploaded. OCR is capped at three images and fifteen seconds per image; findings
show the recognized text at reduced confidence.

## Optional live link reputation

The "Live link reputation" control sends only extracted HTTP(S) URLs to
SkillSafe's `/api/links` route, which forwards them to Google Safe Browsing.
Internal, link-local, and cloud-metadata hosts are rejected before egress. File
content, filenames, hashes, and verdicts are not sent. This feature is off
unless `SAFE_BROWSING_API_KEY` is configured.

## Optional semantic review

The "Semantic review" control is the only feature that sends instructional
passages from the skill text to a model provider. It sends at most six passages
to `/api/semantic` and requires explicit consent. The model is classification
only, has no tools, and returns a label and confidence score treated as
untrusted scanner data. A user-provided API key is held in page memory for the
request and is not stored or logged.

## Rule catalog and feedback

Each scan may fetch `/rule-catalog.json` from this site. It contains rule
severity, confidence, and retirement overrides; no scan data is sent. False
positive marks remain in browser memory for the session and can be exported as
rule IDs and counts only.

## Optional account history and sharing

When Supabase is configured, authentication cookies are used for the signed-in
account. A report is stored only after the user explicitly saves it. The saved
record contains report metadata and findings, not source file bytes. Row-level
security restricts saved records to their owner.

The server-side service-role key is used only to load a report after its signed
share token has been verified. Share tokens are HMAC-signed, expire after seven
days, and can be revoked. No service-role key is exposed to the browser.

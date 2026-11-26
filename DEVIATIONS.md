5. L2 is a bounded scope/constant-propagation call analyzer, not a full language AST.
   No parser WASM can be vendored offline in this build; the analyzer covers the spec's
   one-level indirection cases (variable-bound sinks, concatenated/computed callee names,
   getattr) without a network fetch or a multi-megabyte grammar download.
6. WOFF2 name-table extraction is not implemented (Brotli plus a transformed table
   directory). WOFF2 files still get the magic-byte check and SHA-256; the report emits
   an explicit ingestion note rather than silently skipping.
7. Injection phrasing found in image/font metadata is reported as asset-004/asset-005
   (High, per the Category 10 rubric) instead of also emitting the underlying inj-*
   finding, so one span is never counted twice.
8. Zip deflate uses the platform DecompressionStream. Automated zip tests cover stored
   entries and every guard (slip, caps, ratio, encryption, symlinks); the deflate path is
   exercised in the browser.
9. Hardening pass findings, fixed in this milestone:
   - safeEntryPath validated before stripping invisible characters, so a disguised
     traversal segment (".<ZWSP>./") passed the check. Now strips first, validates second.
     Note: extracted entries are never written to disk — they stay in memory as records —
     so traversal was already inert; the fix closes a display-spoofing path and keeps the
     spec's rejection guarantee honest.
   - Zero-byte files produced a CRITICAL asset-001 polyglot finding. Empty files are now
     skipped by the magic-byte check.
   - A corrupt or out-of-range central directory returned zero entries and zero rejections,
     which rendered as a clean report. Every unreadable archive now emits an explicit note
     and sets truncated.
10. Small-text colour --dim raised from #5f7391 (3.9:1) to #8296b3 (6.3:1) to meet WCAG AA.
    Evidence blocks are bidi-isolated so an embedded override cannot reorder surrounding UI.

12. sup-003 (OSV advisories) is implemented as an opt-in deep scan through our own
    /api/osv route rather than a browser-to-OSV fetch. Same-origin routing avoids a
    CORS dependency and keeps connect-src 'self' unchanged; the upstream URL is a
    constant, so there is no user-controlled host and no SSRF surface. Only exact
    version pins are queried — ranges and wildcards are skipped rather than guessed.
    The rule stays status "deep": it never runs in the offline pass.

13. Advisory rate limiting is a per-instance fixed window in memory. On serverless
    this bounds abuse per instance, not globally; a shared Upstash store replaces it
    when the accounts milestone lands. Recorded as a known limitation, not a guarantee.

14. L7 hash reputation is implemented against a versioned static JSON list served
    from our own origin rather than a database-backed community service. This
    satisfies hot-updatability (replace the file, no redeploy) and the hashes-only
    storage requirement without requiring an account or API key. The list ships
    empty; populating it with confirmed-malicious hashes is an operational task,
    not a code gap. A denylist match is CRITICAL and overrides the content verdict;
    an allowlist match is INFO and never suppresses other findings.

15. asset-006 (OCR) is opt-in and lazy-loaded. Tesseract's worker, WASM core, and
    English language data are vendored into public/ by scripts/setup-ocr.mjs so
    recognition needs no third-party origin and the CSP is unchanged. If the
    assets are absent the panel reports a setup note rather than failing the scan.
    OCR findings are Medium at 0.5 confidence per the Category 10 rubric, always
    shown with the recognized text, capped at 3 images and 15s per image.

16. lnk-007 and inj-008 complete the 45-rule catalog. Both are opt-in deep scans
    routed through our own origin, so connect-src stays 'self'. Neither runs
    without explicit user action; semantic review additionally requires a consent
    checkbox because it is the only path that transmits skill text.

17. The versioned catalog required by Section 6 is implemented as a hot-updatable
    overlay (rule-catalog.json) applied after aggregation, rather than a database
    table. It satisfies shipping severity/confidence/retirement changes without a
    redeploy and re-scan flagging when the version moves. Base rule definitions
    still ship in the bundle; moving those to the same overlay is future work.

18. The L10 feedback loop accumulates false-positive marks per session in memory
    and exports counts-only bundles for the maintainer. There is no server-side
    review queue yet; that arrives with the persistence milestone. Marks are never
    written to disk, matching the stated retention policy.

19. Milestone 3 and 5 persistence is additive and optional. With no Supabase env
    vars the app is unchanged: scans stay on-device and history is a session-only
    in-memory registry. With them set, only an explicit "Save report" writes rows,
    under RLS as the signed-in user — never the service role. The service-role
    client is used in exactly one place: reading a scan for a verified, unrevoked,
    unexpired signed share link.

20. Saved views and drag ordering are session-scoped in local mode; saved views
    persist to Supabase when signed in. Share tokens are HMAC-SHA256 over a
    base64url payload with a 7-day expiry, compared with timingSafeEqual, and
    recorded server-side so they can be revoked before expiry.

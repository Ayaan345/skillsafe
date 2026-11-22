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

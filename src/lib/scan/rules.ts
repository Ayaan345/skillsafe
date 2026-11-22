import { CATEGORY_NAMES, type Layer, type Rule, type Severity } from "./types";

export const CATALOG_VERSION = 1;

function rule(
  id: string,
  category: number,
  severity: Severity,
  layer: Layer,
  title: string,
  why: string,
  fix: string,
  extra: Partial<Rule> = {},
): Rule {
  return {
    id,
    category,
    categoryName: CATEGORY_NAMES[category],
    severity,
    layer,
    title,
    why,
    fix,
    status: "active",
    ...extra,
  };
}

const isSvg = (p: string) => p.toLowerCase().endsWith(".svg");

export const RULES: Rule[] = [
  // ---------- Category 1: Prompt injection (L1) ----------
  rule("inj-001", 1, "CRITICAL", "L1", "Instruction override",
    "Text tells the agent to discard the instructions it was already given. This is the core prompt-injection shape.",
    "Remove this phrasing. A skill should describe its task, never redefine the agent's operating rules.",
    { pattern: /\b(?:ignore|disregard|forget|override|bypass)\b[^\n]{0,40}?\b(?:previous|prior|preceding|earlier|above|all|system|original|initial)\b[^\n]{0,40}?\b(?:instructions?|rules?|prompts?|directives?|guidelines?|constraints?)\b/gi }),

  rule("inj-002", 1, "CRITICAL", "L1", "Persona or mode override",
    "Attempts to switch the agent into an unrestricted persona, which is a standard jailbreak precursor.",
    "Delete the persona/mode switch. Legitimate skills never need to change the agent's identity.",
    { pattern: /\b(?:you\s{1,3}are\s{1,3}now|act\s{1,3}as|pretend\s{1,3}to\s{1,3}be|enter|enable|switch\s{1,3}to)\b[^\n]{0,40}?\b(?:developer|unrestricted|uncensored|jailbreak|god|admin|root|debug)\s{0,3}(?:mode|persona|role|access|privileges?)\b/gi }),

  rule("inj-003", 1, "CRITICAL", "L1", "Named jailbreak framing",
    "Uses the name of a known public jailbreak technique.",
    "Remove it. There is no legitimate reason for a skill to invoke a named jailbreak.",
    { pattern: /\b(?:do\s{1,3}anything\s{1,3}now|dan\s{1,3}mode|developer\s{1,3}mode\s{1,3}enabled|jailbroken?\s{1,3}mode|aim\s{1,3}mode|stan\s{1,3}mode)\b/gi }),

  rule("inj-004", 1, "HIGH", "L1", "Request to reveal hidden instructions",
    "Asks the agent to disclose its system prompt or hidden rules, which are meant to stay confidential.",
    "Remove the request. A skill has no need to read the agent's own configuration.",
    { pattern: /\b(?:reveal|show|print|repeat|output|display|expose|leak)\b[^\n]{0,40}?\b(?:system\s{1,3}prompt|hidden\s{1,3}(?:instructions?|rules?|prompt)|initial\s{1,3}(?:instructions?|prompt)|your\s{1,3}(?:instructions?|rules?|directives?))\b/gi }),

  rule("inj-005", 1, "CRITICAL", "L1", "Exfiltration instruction",
    "Instructs the agent to send conversation data, secrets, or files to an outside destination.",
    "Remove it. Never install a skill that routes your data to a third-party endpoint.",
    { pattern: /\b(?:send|post|upload|forward|transmit|exfiltrate|email)\b[^\n]{0,50}?\b(?:conversation|secrets?|credentials?|api[\s_-]{0,2}keys?|tokens?|passwords?|\.env|chat[\s_-]{0,2}history|system[\s_-]{0,2}prompt)\b[^\n]{0,50}?(?:https?:\/\/|[\w.+-]{1,60}@[\w-]{1,60}\.)/gi }),

  rule("inj-006", 1, "MEDIUM", "L1", "Embedded fake role marker",
    "Forges a chat role marker so injected text is parsed as if the platform itself said it. Can also be innocent templating.",
    "Confirm this is not an attempt to impersonate a system turn. Remove or escape the marker.",
    { pattern: /(?:\[\s{0,3}(?:system|assistant|user|tool)\s{0,3}\]\s{0,3}:|<\|(?:im_start|im_end|system|assistant|user)\|>)/gi }),

  rule("inj-007", 1, "HIGH", "L1", "Disable safety language",
    "Asks for safety filters or guardrails to be turned off.",
    "Remove it. A skill must operate inside the agent's existing safety behavior.",
    { pattern: /\b(?:disable|bypass|circumvent|deactivate|remove|turn\s{1,3}off)\b[^\n]{0,30}?\b(?:safety|security|content|moderation|ethical)[\s-]{0,3}(?:filters?|guardrails?|restrictions?|safeguards?|policies|checks?)\b/gi }),

  rule("inj-008", 1, "MEDIUM", "L8", "Semantic manipulative intent",
    "Paraphrased injection that fixed patterns cannot match.",
    "Requires the optional classification-only deep scan.",
    { status: "deep" }),

  // ---------- Category 2: Obfuscation ----------
  rule("obf-001", 2, "HIGH", "L4", "Zero-width characters",
    "Characters that render with no width, used to hide text inside apparently normal prose.",
    "Strip these code points. They have essentially no use in ordinary skill prose."),

  rule("obf-002", 2, "HIGH", "L4", "Bidirectional control characters",
    "Bidi overrides reverse displayed text order, so what a reviewer reads differs from what the agent parses.",
    "Remove the control characters and re-read the affected line in logical order."),

  rule("obf-003", 2, "CRITICAL", "L4", "Unicode tag-block smuggling",
    "The Unicode tag block encodes an entire invisible ASCII message. There is no legitimate use in a skill.",
    "Treat as hostile. The decoded hidden message is shown in the snippet."),

  rule("obf-004", 2, "MEDIUM", "L3", "Long base64 run",
    "A long base64-alphabet blob can carry an encoded instruction payload invisible to a human reader.",
    "Decode it yourself and read the result before installing. Ask why the skill needs an opaque blob.",
    { pattern: /[A-Za-z0-9+/]{80,4096}={0,2}/g }),

  rule("obf-005", 2, "MEDIUM", "L1", "Instruction-shaped HTML comment",
    "HTML comments are invisible in rendered markdown but are still read by the agent.",
    "Remove the comment or move its content into visible text where a reviewer can see it."),

  rule("obf-006", 2, "MEDIUM", "L4", "Mixed-script confusable",
    "A token mixes Latin with Cyrillic/Greek lookalikes, a classic visual-impersonation trick.",
    "Verify the real domain or identifier. Compare it against the official spelling character by character."),

  // ---------- Category 3: Links (L5 string-only) ----------
  rule("lnk-001", 3, "MEDIUM", "L5", "Raw IP address host",
    "The link points at a bare IP instead of a name, which hides who actually operates the endpoint.",
    "Replace with a named, attributable host, or confirm the IP belongs to infrastructure you trust."),

  rule("lnk-002", 3, "LOW", "L5", "URL shortener",
    "A shortener conceals the real destination from both the reviewer and the agent.",
    "Expand the link and inspect the final destination before installing."),

  rule("lnk-003", 3, "MEDIUM", "L5", "Punycode domain",
    "Punycode can render as a near-identical lookalike of a trusted brand domain.",
    "Decode the domain and compare it to the genuine brand spelling."),

  rule("lnk-004", 3, "HIGH", "L5", "Anchor text / href mismatch",
    "The visible link text names one domain while the actual destination is a different one.",
    "Treat as deceptive. Do not follow the link; correct or remove it."),

  rule("lnk-005", 3, "LOW", "L5", "Plain HTTP link",
    "Unencrypted transport can be modified in transit.",
    "Use HTTPS wherever the destination supports it."),

  rule("lnk-006", 3, "HIGH", "L5", "Executable data: URI",
    "A data: URI carrying HTML, SVG, or JavaScript executes content that never appears as a normal link.",
    "Remove it. Inline executable payloads have no place in a skill bundle."),

  rule("lnk-007", 3, "HIGH", "L5", "Live reputation hit",
    "Destination appears on a malware/phishing reputation feed.",
    "Requires the optional deep scan (Google Safe Browsing).",
    { status: "deep" }),

  // ---------- Category 4: Code risk ----------
  rule("code-001", 4, "HIGH", "L1", "Dynamic code execution",
    "Evaluates a string as code, so the actual behavior is not visible in the file a reviewer reads.",
    "Replace with explicit logic. If dynamic evaluation is unavoidable, document exactly what it can receive.",
    { pattern: /(?<![\w.])(?:eval|exec|execfile)\s{0,3}\(|\bnew\s{1,3}Function\s{0,3}\(|\b(?:os\.system|subprocess\.(?:run|call|Popen|check_output)|child_process\.(?:exec|execSync|spawn|spawnSync))\s{0,3}\(/g }),

  rule("code-002", 4, "CRITICAL", "L1", "Download piped to shell",
    "Fetches remote content and executes it immediately. The operator of that URL can change what runs at any time.",
    "Never install as-is. Download, inspect, pin a hash, then execute separately.",
    { pattern: /\b(?:curl|wget|iwr|Invoke-WebRequest)\b[^\n]{0,200}?\|\s{0,3}(?:sudo\s{1,3})?(?:bash|sh|zsh|python[23]?|node|powershell|pwsh)\b/gi }),

  rule("code-003", 4, "CRITICAL", "L1", "Decode then execute",
    "Decodes an opaque payload and runs it as code, hiding the real behavior from review.",
    "Decode the payload manually and read it. Do not install until you know what it does.",
    { pattern: /\b(?:atob|b64decode|Buffer\.from|fromCharCode)\b[^\n]{0,120}?\b(?:eval|exec|Function|system|subprocess)\b|\b(?:eval|exec|new\s{1,3}Function)\s{0,3}\([^\n]{0,120}?\b(?:atob|b64decode|base64|Buffer\.from|fromCharCode)\b/gi }),

  rule("code-004", 4, "HIGH", "L1", "Destructive filesystem operation",
    "Recursive or broad deletion that can destroy data outside the skill's own working area.",
    "Scope deletion to a specific, skill-owned directory and remove force/recursive flags where possible.",
    { pattern: /\brm\s{1,3}-[a-zA-Z]{1,6}\s{1,3}(?:\/(?:\s|$)|~\/|\$HOME|\*)|\bshutil\.rmtree\s{0,3}\(|\bRemove-Item\b[^\n]{0,120}?-Recurse\b[^\n]{0,60}?-Force\b/gi }),

  rule("code-005", 4, "HIGH", "L2", "Sensitive call via indirection",
    "A dangerous function reached through a variable or computed name, which plain text search cannot see.",
    "Replace indirection with an explicit, bounded call. Review what value the variable can hold before installing."),

  // ---------- Category 5: Secrets ----------
  rule("sec-001", 5, "HIGH", "L1", "Credential file path reference",
    "References a known credential store such as an SSH private key, cloud config, or .env file.",
    "Confirm the skill genuinely needs it. Prefer scoped, user-provided credentials over reading key files.",
    { pattern: /~\/\.ssh\/id_[a-z0-9]{1,12}|~\/\.aws\/credentials|~\/\.config\/gcloud|\/etc\/shadow|(?<![\w.])\.env(?![\w])|\bid_rsa\b|(?<![\w])\.netrc\b|(?<![\w])\.npmrc\b/gi }),

  rule("sec-002", 5, "CRITICAL", "L1", "Secret read near network call",
    "A secret-shaped environment variable is read and a network call appears close by in the same file — the shape of credential exfiltration.",
    "Trace where the value is sent. Remove the outbound call or the secret read."),

  rule("sec-003", 5, "INFO", "L3", "High-entropy string literal",
    "A literal is random enough to be a key or an encoded payload. Often a legitimate hash or test fixture.",
    "Check whether it is a real credential. If so, rotate it and remove it from the bundle."),

  // ---------- Category 6: Permissions ----------
  rule("perm-001", 6, "MEDIUM", "L1", "Full / root / admin access language",
    "Requests access broader than a bounded task usually needs.",
    "Ask whether the stated purpose really requires this scope, and narrow it if not.",
    { pattern: /\b(?:full|complete|unrestricted|root|admin|administrator|elevated)\s{1,3}(?:access|control|permissions?|privileges?|rights?)\b/gi }),

  rule("perm-002", 6, "MEDIUM", "L1", "Whole-filesystem access claim",
    "Claims access to all or every file on the machine.",
    "Restrict to the specific directories the task needs.",
    { pattern: /\b(?:all|every|any)\s{1,3}files?\b[^\n]{0,30}?\b(?:on|in|of)\b[^\n]{0,20}?\b(?:the\s{1,3})?(?:system|computer|machine|disk|drive|filesystem)\b|\b(?:read|write|access|scan|delete)\s{1,3}(?:all|every)\s{1,3}files?\b/gi }),

  rule("perm-003", 6, "LOW", "L1", "Email / inbox access mention",
    "Mentions mailbox access. Often legitimate, but worth confirming against the stated purpose.",
    "Confirm the skill's purpose actually involves email.",
    { pattern: /\b(?:access|read|scan|search|monitor)\s{1,3}(?:your\s{1,3}|the\s{1,3})?(?:email|inbox|mailbox|gmail)\b|\b(?:email|inbox)\s{1,3}(?:access|permissions?)\b/gi }),

  // ---------- Category 7: Supply chain ----------
  rule("sup-001", 7, "MEDIUM", "L6", "Possible typosquatted dependency",
    "A declared package name is within edit-distance 2 of a popular package.",
    "Verify the package name character by character against the official registry entry."),
  rule("sup-002", 7, "HIGH", "L6", "Lifecycle hook trips a code rule",
    "An install-time hook script contains a code-execution pattern.",
    "Remove or rewrite the lifecycle hook. Install-time scripts run with the installer's privileges."),
  rule("sup-003", 7, "HIGH", "L6", "Known-vulnerable pinned version",
    "A pinned dependency version has a disclosed advisory.",
    "Optional deep scan against OSV.dev (free, no API key).", { status: "deep" }),

  // ---------- Category 8: Manifest ----------
  rule("man-001", 8, "HIGH", "L9", "Declared capability mismatch",
    "The manifest declares read-only or no-network, but the code contains network or write signals.",
    "Treat the declaration as untrusted. Reconcile the manifest with the actual code before installing."),
  rule("man-002", 8, "MEDIUM", "L0", "Description inconsistent with body",
    "The stated description claims a bounded task, but the body contains injection or code-risk findings.",
    "Compare the description against the instructions and bundled scripts. Ask why they differ."),

  // ---------- Category 9: Signatures ----------
  rule("hash-001", 9, "CRITICAL", "L7", "Denylist hash match",
    "Byte-identical to previously confirmed malicious content.",
    "Hashing lands in 2C; the community list needs the optional free Supabase backend.",
    { status: "pending" }),
  rule("hash-002", 9, "INFO", "L7", "Allowlist hash match",
    "Matches a previously reviewed skill. A confidence signal, never a bypass.",
    "Hashing lands in 2C.", { status: "pending" }),

  // ---------- Category 10: Assets ----------
  rule("asset-001", 10, "CRITICAL", "L0", "Magic-byte / extension mismatch",
    "The file's header bytes identify a different format than its extension claims — a polyglot that different parsers read differently.",
    "Treat as hostile. Rename or remove the file and inspect what each parser would do with it."),

  rule("asset-002", 10, "CRITICAL", "L1", "SVG script or event handler",
    "SVG is markup, not an inert picture. A script tag or on* handler executes when the image is opened.",
    "Remove the script/handler. Never install an SVG that carries executable markup.",
    { pattern: /<\s{0,3}script\b|\bon(?:load|error|click|mouseover|begin|end|repeat|focus)\s{0,3}=/gi, appliesTo: isSvg }),

  rule("asset-003", 10, "HIGH", "L5", "SVG external resource reference",
    "The SVG pulls a resource from outside the bundle, so its behavior is controlled by a remote party.",
    "Inline the resource or remove the reference.",
    { pattern: /<(?:image|use|script|feImage|foreignObject)\b[^>]{0,300}?(?:xlink:href|href|src)\s{0,3}=\s{0,3}["']?(?:https?:)?\/\//gi, appliesTo: isSvg }),

  rule("asset-004", 10, "HIGH", "L1", "Injection in image metadata",
    "Instruction-shaped phrasing was found in an EXIF, XMP, or PNG text-chunk field — invisible to anyone viewing the image.",
    "Strip the metadata field. A picture has no reason to carry instructions for an agent."),

  rule("asset-005", 10, "HIGH", "L1", "Injection in font name table",
    "Instruction-shaped phrasing was found in a font's internal name-table strings (family, copyright, designer).",
    "Strip the name-table string. Font metadata should describe the font, not direct an agent."),
  rule("asset-006", 10, "MEDIUM", "L1", "Injection found via OCR",
    "Instruction phrasing rendered as a picture of text.",
    "Optional in-browser OCR pass.", { status: "pending" }),
];

export const RULE_BY_ID: Record<string, Rule> = Object.fromEntries(
  RULES.map((r) => [r.id, r]),
);

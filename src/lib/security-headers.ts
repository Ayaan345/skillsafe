export interface CspOptions {
  isDev: boolean;
  supabaseUrl?: string;
}

/**
 * Host-based policy rather than nonce-based. Next's production runtime emits
 * inline bootstrap scripts and chunk loads that do not reliably carry a
 * middleware-generated nonce, and 'strict-dynamic' then blocks all of them.
 * Compensating controls: no third-party script origin is permitted at all,
 * connect-src is same-origin only (blocks exfiltration even if a script ran),
 * and the app renders scanned content exclusively as text.
 */
export function buildCsp({ isDev, supabaseUrl }: CspOptions): string {
  const scriptSrc = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"];
  if (isDev) scriptSrc.push("'unsafe-eval'");

  const connectSrc = ["'self'"];
  if (supabaseUrl) connectSrc.push(supabaseUrl);
  if (isDev) connectSrc.push("ws:", "wss:");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": connectSrc,
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  if (!isDev) directives["upgrade-insecure-requests"] = [];

  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(" ")}` : k))
    .join("; ");
}

export function staticSecurityHeaders(isDev: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-Permitted-Cross-Domain-Policies": "none",
  };
  if (!isDev) {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  }
  return headers;
}
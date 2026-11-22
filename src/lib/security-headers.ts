export interface CspOptions {
  nonce: string;
  isDev: boolean;
  supabaseUrl?: string;
}

export function buildCsp({ nonce, isDev, supabaseUrl }: CspOptions): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https:", // fallback for pre-CSP3 browsers
    "'wasm-unsafe-eval'", // allows WASM parsing later without full unsafe-eval
  ];
  if (isDev) scriptSrc.push("'unsafe-eval'"); // dev tooling only

  const connectSrc = ["'self'"];
  if (supabaseUrl) connectSrc.push(supabaseUrl);
  if (isDev) connectSrc.push("ws:", "wss:"); // hot reload

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": connectSrc,
    "worker-src": ["'self'", "blob:"],
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
  };
  if (!isDev) {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  }
  return headers;
}

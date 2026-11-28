const base = process.env.SMOKE_BASE ?? "http://localhost:3000";

const checks = [
  { path: "/", expect: [200], contains: "SkillSafe", headers: ["content-security-policy", "x-content-type-options"] },
  { path: "/rules", expect: [200], contains: "Every rule" },
  { path: "/history", expect: [200], contains: "Saved reports" },
  { path: "/hash-lists.json", expect: [200], json: (j) => Array.isArray(j.denylist) && Array.isArray(j.allowlist) },
  { path: "/rule-catalog.json", expect: [200], json: (j) => typeof j.version === "number" },
  { path: "/s/bogus.token", expect: [200], contains: "not available" },
  { method: "POST", path: "/api/osv", body: { queries: [] }, expect: [400] },
  { method: "POST", path: "/api/osv", body: { queries: [{ name: "lodash", version: "4.17.21", ecosystem: "npm" }] }, expect: [200, 429, 502] },
  { method: "POST", path: "/api/links", body: { urls: ["https://example.com"] }, expect: [200, 429, 502, 503] },
  { method: "POST", path: "/api/semantic", body: { chunks: ["test passage long enough"] }, expect: [200, 429, 502, 503] },
  { path: "/diff", expect: [200], optional: true },
  { path: "/team", expect: [200], optional: true },
  { path: "/api/fetch-skill", method: "POST", body: { url: "https://example.com/SKILL.md" }, expect: [200, 400, 429, 502], optional: true },
];

let failed = 0;
let missing = 0;

for (const check of checks) {
  const method = check.method ?? "GET";
  const label = `${method.padEnd(4)} ${check.path}`;
  try {
    const response = await fetch(base + check.path, {
      method,
      headers: check.body ? { "content-type": "application/json" } : undefined,
      body: check.body ? JSON.stringify(check.body) : undefined,
      redirect: "manual",
    });

    const text = await response.text();
    const problems = [];

    if (!check.expect.includes(response.status)) problems.push(`status ${response.status}, wanted ${check.expect.join("/")}`);
    if (check.contains && !text.includes(check.contains)) problems.push(`body missing "${check.contains}"`);
    for (const header of check.headers ?? []) {
      if (!response.headers.get(header)) problems.push(`missing header ${header}`);
    }
    if (check.json) {
      try {
        if (!check.json(JSON.parse(text))) problems.push("JSON shape unexpected");
      } catch {
        problems.push("body is not JSON");
      }
    }

    if (problems.length === 0) {
      console.log(`PASS  ${label}  ${response.status}`);
    } else if (check.optional && response.status === 404) {
      missing++;
      console.log(`ABSENT ${label}  route not implemented`);
    } else {
      failed++;
      console.log(`FAIL  ${label}  ${problems.join("; ")}`);
    }
  } catch (error) {
    failed++;
    console.log(`FAIL  ${label}  ${error.message}`);
  }
}

console.log(`\n${failed === 0 ? "OK" : "FAILED"} — ${failed} failure(s), ${missing} absent route(s).`);
if (failed > 0) console.log("If every row failed, the server is not running on " + base);
process.exit(failed === 0 ? 0 : 1);
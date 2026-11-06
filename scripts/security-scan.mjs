import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"

// Deliberately print locations and rule names only, never matching credentials.
// This focused regression scan supplements review; it is not an exhaustive scanner.
const rules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["supabase-secret", /\bsb_secret_[A-Za-z0-9_-]{15,}/g],
  [
    "github-token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/g,
  ],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  [
    "provider-secret",
    /\b(?:sk_live_|sk_test_|sk-proj-|sk-ant-|re_)[A-Za-z0-9_-]{24,}/g,
  ],
  [
    "database-password-uri",
    /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:/]+:[^\s@]+@/g,
  ],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{20,}/g],
]
const findings = []
let workingFiles = 0
let historyBlobs = 0
function scan(label, source) {
  for (const [rule, pattern] of rules) {
    for (const match of source.matchAll(pattern)) {
      findings.push({
        file: label,
        rule,
        line: source.slice(0, match.index).split("\n").length,
      })
    }
  }
  for (const match of source.matchAll(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  )) {
    try {
      const claims = JSON.parse(
        Buffer.from(match[0].split(".")[1], "base64url").toString(),
      )
      if (["service_role", "supabase_admin"].includes(claims.role))
        findings.push({ file: label, rule: "privileged-jwt" })
    } catch {
      /* Not a decodable JWT. */
    }
  }
  if (
    label.startsWith("dist/") &&
    (/\.map$/.test(label) || /sourceMappingURL=data:/.test(source))
  )
    findings.push({ file: label, rule: "public-source-map" })
}
async function walk(directory = ".") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", ".pnpm-store", ".vercel"].includes(entry.name))
      continue
    const name = path.join(directory, entry.name)
    if (entry.isDirectory()) await walk(name)
    else if (entry.isFile()) {
      const bytes = await readFile(name)
      if (bytes.includes(0)) continue
      scan(name, bytes.toString("utf8"))
      workingFiles++
    }
  }
}
await walk()
if (process.argv.includes("--history")) {
  const git = (...args) =>
    execFileSync("git", args, { maxBuffer: 32 * 1024 * 1024 })
  for (const line of git("rev-list", "--objects", "--all")
    .toString()
    .trim()
    .split("\n")) {
    const [oid, ...parts] = line.split(" ")
    if (git("cat-file", "-t", oid).toString().trim() !== "blob") continue
    const bytes = git("cat-file", "blob", oid)
    if (bytes.includes(0)) continue
    scan(
      `history:${oid.slice(0, 10)}:${parts.join(" ")}`,
      bytes.toString("utf8"),
    )
    historyBlobs++
  }
}
console.log(JSON.stringify({ workingFiles, historyBlobs, findings }, null, 2))
if (findings.length) process.exitCode = 1

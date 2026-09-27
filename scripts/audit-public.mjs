#!/usr/bin/env node
// Public source audit: run before every push (`npm run audit:public`) and in CI.
// Checks the files Git is about to publish (the index: staged + tracked):
//  * only expected paths and file types,
//  * no oversized files,
//  * no common credential patterns or private keys,
//  * no personal home-directory paths.
// A guardrail, not a proof: always review your diff as well.
import { execFileSync } from 'node:child_process'

const git = (...args) => execFileSync('git', args, { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })
const files = git('ls-files', '-z', '--cached').toString('utf8').split('\0').filter(Boolean)

const ALLOWED_EXT = new Set([
  '.ts', '.mjs', '.js', '.json', '.md', '.html', '.css', '.yml', '.yaml', '.py', '.sh', '.bat', '.ps1',
  '.png', '.gif', '.svg', '',
])
const ALLOWED_NAMES = new Set(['LICENSE', '.gitignore', 'CODEOWNERS', '.gitattributes', '.editorconfig', '.npmrc'])
const BLOCKED_PATHS = [/^node_modules\//, /^dist\//, /^sim\//, /^preview\//, /(^|\/)\.env(\.|$)/, /\.ehpk$/, /\.zip$/, /\.log$/, /setup-log\.txt$/]
const MAX_BYTES = 2 * 1024 * 1024
const BINARY = new Set(['.png', '.gif'])

const SECRET_PATTERNS = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['sk- style API key', /\bsk-(ant-)?[A-Za-z0-9_-]{20,}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['generic assigned secret', /\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*['"][^'"\s]{12,}['"]/i],
]
const PERSONAL_PATTERNS = [
  ['Windows home path', /[A-Za-z]:\\Users\\(?!Public\\|<)[A-Za-z0-9._-]+/],
  ['macOS home path', /\/Users\/(?!Shared\/)[A-Za-z0-9._-]+\//],
  ['Linux home path', /\/home\/(?!runner\/)[a-z0-9._-]+\//],
]

const problems = []
for (const f of files) {
  const name = f.split('/').pop()
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : ''
  if (BLOCKED_PATHS.some((re) => re.test(f))) { problems.push(`${f}: path must never be published`); continue }
  if (!ALLOWED_EXT.has(ext) && !ALLOWED_NAMES.has(name)) { problems.push(`${f}: unexpected file type`); continue }
  const blob = git('show', `:${f}`)
  if (blob.length > MAX_BYTES) problems.push(`${f}: ${(blob.length / 1048576).toFixed(1)} MB is larger than 2 MB`)
  if (BINARY.has(ext)) continue
  const text = blob.toString('utf8')
  const lines = text.split('\n')
  for (const [label, re] of [...SECRET_PATTERNS, ...PERSONAL_PATTERNS]) {
    const i = lines.findIndex((l) => re.test(l))
    if (i >= 0 && f !== 'scripts/audit-public.mjs') problems.push(`${f}:${i + 1}: looks like a ${label}`)
  }
}

if (problems.length) {
  console.error(`Public source audit FAILED (${problems.length}):\n  ` + problems.join('\n  '))
  process.exit(1)
}
console.log(`Public source audit passed: ${files.length} files checked.`)

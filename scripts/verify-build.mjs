// Checks a built site before it is published anywhere (GitHub Pages, the itch.io zip, a Butler push).
//
//   node scripts/verify-build.mjs [dir]        dir defaults to dist
//
// It stops (exit 1) on: no index.html at the root, an absolute or external path in index.html, a referenced file that is missing
// (case-sensitively: itch.io's server is), a reference to localhost or a local path, something that looks like a secret, development
// files, and the limits itch.io documents for HTML games (see docs/DEPLOYMENT.md: 1000 files, 500 MB in all, 200 MB a file, 240-character paths).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

const dir = resolve(process.argv[2] || 'dist');
const problems = [];
const bad = (msg) => problems.push(msg);

if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`verify-build: "${dir}" does not exist (run the build first)`);
  process.exit(1);
}

const files = [];
(function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(dir);
const rel = (p) => relative(dir, p).split(sep).join('/');
const listed = new Set(files.map(rel));

// 1. the entry point
const indexPath = join(dir, 'index.html');
if (!existsSync(indexPath)) bad('index.html is not at the root of the build');
const html = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
if (existsSync(indexPath) && html.trim().length < 200) bad('index.html is almost empty');

// 2. every path in index.html is relative and points at a file that is there (exact case)
for (const m of html.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)) {
  const ref = m[1];
  if (ref.startsWith('data:') || ref.startsWith('#')) continue;
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(ref) || /^[a-z]:/i.test(ref)) {
    bad(`index.html loads an external or absolute address: ${ref}`);
    continue;
  }
  if (ref.startsWith('/')) {
    bad(`index.html uses a root-relative path (breaks under a sub-path and in an itch.io iframe): ${ref}`);
    continue;
  }
  const clean = ref.replace(/^\.\//, '').split(/[?#]/)[0];
  if (clean && !listed.has(clean)) bad(`index.html refers to a file that is not in the build (check the case): ${ref}`);
}

// 3. no local reference, no secret, in what is shipped (text files only)
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.txt', '.svg', '.webmanifest']);
const LOCAL = [/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])/i, /file:\/\//i, /\b[A-Za-z]:\\(?:Users|Projects|P R O J E C T S)/i, /\/Users\/[^\s"']+\/(?:Documents|Desktop|projects)/i];
const SECRET = [
  [/BUTLER_API_KEY/, 'the name of the Butler secret'],
  [/ghp_[A-Za-z0-9]{30,}/, 'a GitHub token'],
  [/github_pat_[A-Za-z0-9_]{30,}/, 'a GitHub token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/, 'an AWS key id'], // bounded: the physics engine's tables hold look-alike runs of letters
  [/xox[abprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
];
for (const f of files) {
  if (!TEXT.has(extname(f).toLowerCase())) continue;
  const text = readFileSync(f, 'utf8');
  for (const re of LOCAL) if (re.test(text)) bad(`${rel(f)} contains a local address or path (${re})`);
  for (const [re, what] of SECRET) if (re.test(text)) bad(`${rel(f)} contains what looks like ${what}`);
}

// 4. nothing that is only for development
const DEV_EXT = new Set(['.map', '.log', '.ts', '.tsx', '.md', '.env', '.pem', '.key']);
for (const f of files) {
  const name = f.split(sep).pop();
  if (DEV_EXT.has(extname(f).toLowerCase()) || name.startsWith('.env') || name === '.DS_Store' || name === 'Thumbs.db') bad(`${rel(f)} should not be shipped`);
}

// 5. itch.io's documented limits (from the forum and docs; the platform may change them: docs/DEPLOYMENT.md)
let total = 0;
for (const f of files) {
  const size = statSync(f).size;
  total += size;
  if (size > 200 * 1024 * 1024) bad(`${rel(f)} is over 200 MB`);
  if (rel(f).length > 240) bad(`${rel(f)} has a path over 240 characters`);
}
if (files.length > 1000) bad(`${files.length} files (itch.io HTML games: 1000 at most)`);
if (total > 500 * 1024 * 1024) bad('the build is over 500 MB');
if (files.length === 0) bad('the build is empty');

if (problems.length) {
  console.error(`verify-build: ${problems.length} problem(s) in ${dir}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`verify-build: OK — ${files.length} files, ${(total / 1024).toFixed(0)} KiB, index.html at the root, relative paths, nothing local, no secret, no dev files`);

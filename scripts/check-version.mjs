// Checks that the version is coherent before a release, and says which channel it belongs to.
//
//   node scripts/check-version.mjs                      package.json is valid semver and CHANGELOG.md has its section
//   node scripts/check-version.mjs --tag v1.2.3         ...and the tag is exactly "v" + package.json's version
//   node scripts/check-version.mjs --tag v1.2.3 --notes release-notes.md    ...and write that section of the changelog to a file
//
// Prints `version=`, `tag=`, `channel=` (stable | beta) and `prerelease=` lines; in GitHub Actions they also go to $GITHUB_OUTPUT.
// A version with a pre-release part (1.0.0-beta.1, 0.5.0-rc.2) is "beta"; one without is "stable".
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const fail = (msg) => {
  console.error(`check-version: ${msg}`);
  process.exit(1);
};

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = pkg.version;
const m = SEMVER.exec(version);
if (!m) fail(`package.json version "${version}" is not Semantic Versioning (MAJOR.MINOR.PATCH[-prerelease])`);
const prerelease = Boolean(m[4]);

const tag = opt('--tag');
if (tag !== undefined && tag !== `v${version}`) fail(`tag "${tag}" does not match package.json version "${version}" (expected "v${version}")`);

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const esc = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const head = new RegExp(`^## \\[${esc}\\][^\\n]*$`, 'm').exec(changelog);
if (!head) fail(`CHANGELOG.md has no "## [${version}]" section`);
const rest = changelog.slice(head.index + head[0].length);
const next = /^## \[/m.exec(rest);
const section = (next ? rest.slice(0, next.index) : rest).trim();
if (section.replace(/^### .*$/gm, '').trim().length < 10) fail(`the "## [${version}]" section of CHANGELOG.md is empty`);

const notes = opt('--notes');
if (notes) writeFileSync(notes, `${section}\n`);

const out = { version, tag: `v${version}`, channel: prerelease ? 'beta' : 'stable', prerelease: String(prerelease) };
for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(out).map(([k, v]) => `${k}=${v}\n`).join(''));

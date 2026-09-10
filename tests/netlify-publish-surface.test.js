/**
 * `publish = "."` in netlify.toml puts the entire repository on the web, so
 * anything committed to the repo root is public by default and has to be opted
 * *out* rather than opted in. That default is the wrong way round, and it is
 * silent: a new doc at the root starts answering 200 in production the moment
 * it is committed, with nothing to notice it.
 *
 * This test is the thing that notices. It fails when a root entry is neither
 * on the public allowlist below nor covered by a 404 redirect in netlify.toml,
 * so the exposure is caught here rather than by a stranger with a URL.
 *
 * Adding something new to the root means making a decision: add it to PUBLIC if
 * the web should have it, or add a redirect to netlify.toml if it should not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');

/**
 * Root entries the web is supposed to have. Everything else must be blocked.
 * js/ and css/ are the application itself: a client-side app ships its source
 * by definition and nothing in it is a secret.
 */
const PUBLIC = new Set(['assets', 'css', 'js', 'robots.txt', 'sitemap.xml', 'LICENSE']);

/** Never deployed, so never a concern. */
const NOT_DEPLOYED = new Set(['node_modules', '.git']);

/** Every `from` on a rule that returns 404 and forces past the static file. */
function blockedPaths() {
  const blocks = toml.split(/\[\[redirects\]\]/).slice(1);
  return blocks
    .filter(b => /status\s*=\s*404/.test(b) && /force\s*=\s*true/.test(b))
    .map(b => b.match(/from\s*=\s*"([^"]+)"/)?.[1])
    .filter(Boolean);
}

function isBlocked(entry, isDir, blocked) {
  return blocked.some(p => (isDir ? p === `/${entry}/*` : p === `/${entry}`));
}

test('every root entry is either public or blocked from the deploy', () => {
  const blocked = blockedPaths();
  assert.ok(blocked.length > 0, 'netlify.toml declares no forced 404 rules');

  const exposed = [];
  for (const e of readdirSync(ROOT, { withFileTypes: true })) {
    const name = e.name;
    // Netlify does not serve dotfiles, and netlify.toml itself is consumed by
    // the build rather than published. Both already 404 in production.
    if (name.startsWith('.') || name === 'netlify.toml') continue;
    if (NOT_DEPLOYED.has(name)) continue;
    if (PUBLIC.has(name)) continue;
    if (name.endsWith('.html')) continue; // the site
    if (isBlocked(name, e.isDirectory(), blocked)) continue;
    exposed.push(e.isDirectory() ? `${name}/` : name);
  }

  assert.deepEqual(
    exposed,
    [],
    `These would be served publicly. Add each to PUBLIC in this test if that is ` +
      `intended, or add a forced 404 redirect to netlify.toml if it is not:\n  ` +
      exposed.join('\n  ')
  );
});

test('the documents that must never be public are individually blocked', () => {
  const blocked = blockedPaths();
  // Named rather than derived: these are the ones with a real cost if they slip
  // back, so the test states them outright instead of trusting a glob.
  for (const f of [
    'PRODUCT.md', // the pricing policy and the advertised/unadvertised split
    'CLAUDE.md',
    'CONTEXT.md',
    'supabase-schema.sql', // a full map of the RLS policies to probe
  ]) {
    assert.ok(blocked.includes(`/${f}`), `${f} is not blocked in netlify.toml`);
  }
  for (const d of [
    'docs', // enforcement-cutover.md, the ADRs, the beta review
    'netlify', // edge-function source, including the Stripe webhook
    'tests', // backer-claim.sql and the entitlement tests
    'scripts',
  ]) {
    assert.ok(blocked.includes(`/${d}/*`), `${d}/ is not blocked in netlify.toml`);
  }
});

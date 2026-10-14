// Mechanical rules for supabase-schema.sql that review used to check by hand:
// every SECURITY DEFINER function pins search_path to `public, pg_temp`, and
// revokes EXECUTE from anon (#231 — Supabase grants public-schema functions to
// anon directly, so revoking from public alone leaves them callable).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');

// Pre-#231 gallery functions, listed so the rule can land without a schema change.
// Each entry must still break its rule: fix the function, then delete the entry.
const PINS_PUBLIC_ONLY = new Set([
  'is_gallery_admin', 'gallery_likes_counter', 'increment_gallery_download', 'update_own_gallery_artwork'
]);
const ANON_MAY_EXECUTE = new Set([
  'is_gallery_admin', // the anon SELECT policy on gallery_artworks calls it; a revoke breaks public reads
  'increment_gallery_download', 'update_own_gallery_artwork' // pre-#231, revoke pending
]);

function definerFunctions() {
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(([^)]*)\)(.*?)\$(\w*)\$.*?\$\4\$([^;]*);/gis;
  return [...schema.matchAll(re)]
    .map(m => ({ name: m[1], options: m[3] + m[5] }))
    .filter(f => /SECURITY\s+DEFINER/i.test(f.options));
}

const revokesAnon = name =>
  new RegExp(`REVOKE[^;]*ON\\s+FUNCTION\\s+(?:public\\.)?${name}\\b[^;]*FROM[^;]*\\banon\\b`, 'is').test(schema);

test('the parser finds every SECURITY DEFINER function', () => {
  // Counted on comment-free lines, so a function the regex skips (quoted name,
  // single-quoted body) fails here instead of escaping every rule below.
  const declared = schema.split('\n').map(l => l.replace(/--.*$/, ''))
    .filter(l => /SECURITY\s+DEFINER/i.test(l)).length;
  assert.equal(definerFunctions().length, declared);
});

test('every grandfathered function still exists', () => {
  const names = new Set(definerFunctions().map(f => f.name));
  for (const name of [...PINS_PUBLIC_ONLY, ...ANON_MAY_EXECUTE]) {
    assert.ok(names.has(name), `${name} is gone — remove it from the allow-lists`);
  }
});

test('every SECURITY DEFINER function pins search_path to public, pg_temp', () => {
  for (const { name, options } of definerFunctions()) {
    const pinned = /SET\s+search_path\s*=\s*public\s*,\s*pg_temp/i.test(options);
    if (PINS_PUBLIC_ONLY.has(name)) {
      assert.ok(!pinned, `${name} now pins pg_temp — remove it from PINS_PUBLIC_ONLY`);
      assert.match(options, /SET\s+search_path\s*=\s*public/i, `${name} pins no search_path`);
    } else {
      assert.ok(pinned, `${name} must SET search_path = public, pg_temp`);
    }
  }
});

test('every callable SECURITY DEFINER function revokes EXECUTE from anon', () => {
  for (const { name, options } of definerFunctions()) {
    if (/RETURNS\s+TRIGGER/i.test(options)) continue; // not callable through PostgREST
    if (ANON_MAY_EXECUTE.has(name)) {
      assert.ok(!revokesAnon(name), `${name} now revokes anon — remove it from ANON_MAY_EXECUTE`);
    } else {
      assert.ok(revokesAnon(name), `${name} must REVOKE EXECUTE ... FROM anon (#231)`);
    }
  }
});

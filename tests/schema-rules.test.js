// Mechanical rules for supabase-schema.sql that review used to check by hand:
// every SECURITY DEFINER function pins search_path to `public, pg_temp`, and
// revokes EXECUTE from anon (#231 — Supabase grants public-schema functions to
// anon directly, so revoking from public alone leaves them callable).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');

// Known exceptions: each entry must still break its rule, or the test asks to delete it.
const ANON_MAY_EXECUTE = new Set([
  'is_gallery_admin' // the anon SELECT policy on gallery_artworks calls it; a revoke breaks public reads
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

test('every ANON_MAY_EXECUTE function still exists', () => {
  const names = new Set(definerFunctions().map(f => f.name));
  for (const name of ANON_MAY_EXECUTE) {
    assert.ok(names.has(name), `${name} is gone — remove it from ANON_MAY_EXECUTE`);
  }
});

test('every SECURITY DEFINER function pins search_path to public, pg_temp', () => {
  for (const { name, options } of definerFunctions()) {
    assert.match(options, /SET\s+search_path\s*=\s*public\s*,\s*pg_temp/i,
      `${name} must SET search_path = public, pg_temp`);
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

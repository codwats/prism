import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artworksQuery, GRID_PAGE_SIZE } from '../js/modules/gallery-query.js';

const params = q => new URLSearchParams(q.slice(q.indexOf('?') + 1));

test('grid query names columns and carries a limit (#440)', () => {
  const q = artworksQuery({ sort: 'liked', offset: 0, limit: GRID_PAGE_SIZE });
  const p = params(q);
  assert.ok(q.startsWith('gallery_artworks?'));
  assert.equal(p.get('status'), 'eq.approved');
  assert.notEqual(p.get('select'), '*');
  assert.ok(p.get('select').split(',').includes('likes_count'));
  assert.ok(!p.get('select').split(',').includes('description'));
  assert.equal(p.get('limit'), '48');
  assert.equal(p.get('offset'), '0');
});

test('sort orders are server-side with a stable tie-break', () => {
  assert.equal(params(artworksQuery({ sort: 'liked' })).get('order'), 'likes_count.desc,id.asc');
  assert.equal(params(artworksQuery({ sort: 'new' })).get('order'), 'created_at.desc,id.asc');
  assert.equal(params(artworksQuery({ sort: 'dl' })).get('order'), 'downloads_count.desc,id.asc');
  assert.equal(params(artworksQuery({ sort: 'liked', featuredFirst: true })).get('order'), 'highlighted.desc,likes_count.desc,id.asc');
});

test('type, artist and partnered filters go to the server', () => {
  assert.equal(params(artworksQuery({ type: 'alter' })).get('type'), 'eq.alter');
  assert.equal(params(artworksQuery({ type: 'all' })).get('type'), null);
  assert.equal(params(artworksQuery({ artistIds: ['a1'] })).get('artist_id'), 'eq.a1');
  assert.equal(params(artworksQuery({ artistIds: ['a1', 'a2'] })).get('artist_id'), 'in.(a1,a2)');
  assert.equal(params(artworksQuery({ id: 'x' })).get('id'), 'eq.x');
});

test('search matches title or card name; most downloaded drops display-only alters', () => {
  assert.equal(params(artworksQuery({ q: ' Sol Ring ' })).get('and'),
    '(or(title.ilike."%Sol Ring%",original_card_name.ilike."%Sol Ring%"))');
  assert.equal(params(artworksQuery({ sort: 'dl' })).get('and'),
    '(or(type.neq.alter,downloads_enabled.is.true))');
  // LIKE sees a\"b\\c: the backslash is a literal, not an escape of c.
  assert.equal(params(artworksQuery({ q: 'a"b\\c,(d)' })).get('and'),
    '(or(title.ilike."%a\\"b\\\\\\\\c,(d)%",original_card_name.ilike."%a\\"b\\\\\\\\c,(d)%"))');
});

test('search term % and _ match literally, not as LIKE wildcards', () => {
  // PostgREST unquotes "*100\\%_x*" to *100\%\_x* — LIKE escapes, so 100%_x matches only itself.
  assert.equal(params(artworksQuery({ q: '100%_x' })).get('and'),
    '(or(title.ilike."%100\\\\%\\\\_x%",original_card_name.ilike."%100\\\\%\\\\_x%"))');
});

test('a typed * is literal; only the surrounding % are wildcards', () => {
  assert.equal(params(artworksQuery({ q: 'a*b' })).get('and'),
    '(or(title.ilike."%a*b%",original_card_name.ilike."%a*b%"))');
});

test('detail query selects every column', () => {
  assert.equal(params(artworksQuery({ id: 'x', columns: '*' })).get('select'), '*');
});

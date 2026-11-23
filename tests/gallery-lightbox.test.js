import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightboxHtml } from '../js/modules/gallery-lightbox.js';

test('wraps the detail art in a wa-lightbox item showing the full image (#497)', () => {
  const html = lightboxHtml({ imageUrl: 'https://x.test/a.png', title: 'Dragon "X"' }, '<img src="https://x.test/a.png">');
  assert.match(html, /^<wa-lightbox\b/);
  assert.match(html, /<wa-lightbox-item src="https:\/\/x\.test\/a\.png" alt="Dragon &#34;X&#34;">/);
  assert.ok(html.includes('<img src="https://x.test/a.png">'));
});

test('no image, no lightbox: the placeholder renders as before', () => {
  assert.equal(lightboxHtml({ imageUrl: null, title: 'T' }, '<p>p</p>'), '<p>p</p>');
});

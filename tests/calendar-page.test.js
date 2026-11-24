import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('calendar.html');

test('the calendar is a free, indexable page with share tags and a canonical link', () => {
  assert.ok(html.includes('<link rel="canonical" href="https://prismmtg.com/calendar.html" />'));
  assert.ok(html.includes('<meta property="og:url" content="https://prismmtg.com/calendar.html" />'));
  assert.ok(/twitter:card/.test(html) && /og:image" content="https:\/\/prismmtg\.com\/assets\/og-card\.png"/.test(html));
  assert.ok(!/noindex|initExtraGate|data-extra-tool/.test(html));
});

test('the calendar is in the sitemap', () => {
  assert.ok(read('sitemap.xml').includes('<loc>https://prismmtg.com/calendar.html</loc>'));
});

test('the nav lists Calendar after Supplies on every page, active on the calendar', () => {
  const layout = read('js/layout.js');
  assert.match(layout, /page: 'tools' },\n\s*\{ href: 'calendar\.html', label: 'Calendar', page: 'calendar' \}/);
  assert.match(read('js/calendar.js'), /initLayout\(\{ activePage: 'calendar'/);
});

test('the page makes no runtime API calls: its data is the static file', () => {
  const js = read('js/calendar.js');
  assert.ok(js.includes("'assets/calendar.json'"));
  assert.ok(!/scryfall|api\./i.test(js));
});

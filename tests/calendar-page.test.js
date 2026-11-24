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

test('events are keyboard buttons that open one shared popover; days open the day panel', () => {
  const js = read('js/calendar.js');
  // A <button> takes Enter/Space; wa-popover closes on Escape and returns focus to its anchor
  assert.match(js, /\['cal-ev'/);
  assert.match(js, /<button class="\$\{cls\}"[^`]*data-ev=/);
  assert.match(js, /<button class="n" data-day=/);
  assert.match(html, /<wa-popover id="cal-pop"/);
  assert.match(html, /<aside class="cal-panel" id="cal-panel"/);
});

test('event icons are monochrome Font Awesome icons, never colored bars', () => {
  const js = read('js/calendar.js');
  for (const name of ['ticket', 'layer-group']) assert.ok(js.includes(`'${name}'`), name);
  const css = read('css/custom.css');
  const evRules = css.match(/\.cal-ev[^{]*\{[^}]*\}/g).join('\n');
  assert.ok(!/--c\b|--set-color/.test(evRules), 'event chips must not take the set color');
});

test('the page makes no runtime API calls: its data is the static file', () => {
  const js = read('js/calendar.js');
  assert.ok(js.includes("'assets/calendar.json'"));
  assert.ok(!/scryfall|api\./i.test(js));
});

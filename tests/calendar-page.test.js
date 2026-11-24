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

test('below 768px an agenda from the calendar module replaces the weeks, rows open the popover', () => {
  const js = read('js/calendar.js');
  assert.match(html, /<div class="cal-agenda" id="cal-agenda"/);
  assert.match(js, /agenda\(cal, /);
  assert.match(js, /<button class="cal-arow[^`]*data-ev=/);
  const css = read('css/custom.css');
  const mobile = css.slice(css.indexOf('@media (max-width: 767px)'));
  assert.match(mobile, /\.cal-scroller, \.cal-panel[^{]*\{ display: none; \}/);
  assert.match(mobile, /\.cal-arow \{[^}]*min-height: 44px/);
});

test('a set with no color breaks --set-color inheritance, so it never takes the hero color', () => {
  // `initial` makes the custom property invalid, so var(--set-color, neutral) falls back
  assert.match(read('js/calendar.js'), /--set-color:\$\{set\?\.color \|\| 'initial'\};/);
});

test('the strip Today marker is neutral and not solid, so it never reads as a stripe', () => {
  const rule = read('css/custom.css').match(/\.cal-strip \.today \{[^}]*\}/)[0];
  assert.match(rule, /border-left: [^;]*(dashed|dotted)/);
  assert.match(rule, /neutral/);
  assert.ok(!/background|brand/.test(rule), rule);
});

test('an open Spotlight says the next Premier set is not announced, never TBA', () => {
  const js = read('js/calendar.js');
  assert.ok(!/TBA|Next set not announced/.test(js));
  assert.match(js, /Next Premier set not announced/);
});

test('mobile agenda headers keep the dark-mode tint: no tinted override inside the 767px query', () => {
  const css = read('css/custom.css');
  const mobile = css.slice(css.indexOf('@media (max-width: 767px)'));
  assert.ok(!/\.cal-ahead\.cal-tint/.test(mobile));
  assert.match(mobile, /\.cal-ahead:not\(\.cal-tint\) \{ background: var\(--wa-color-surface-default\); \}/);
});

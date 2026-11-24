/**
 * Release calendar page (#529). Draws what js/modules/calendar.js returns:
 * the Spotlight hero, then continuous weeks in a scroll box with a sticky
 * chapter ribbon. Data is the static assets/calendar.json; no runtime API calls.
 *
 * Later tickets hang off renderWeek (event chips, #530), the KINDS filter
 * (#531) and the mobile agenda (#532, renderAgenda).
 */
import { initLayout } from './layout.js';
import { escapeHtml } from './core/utils.js';
import {
  buildCalendar, spotlightHero, spotlightSpan, formatDate, openingWeek, monthOfWeek, stepMonth, weekOfMonth,
  spotlightOn, eventsOn, eventRange, MAX_LANES, agenda, weekOf, eventTime, localizeEvents,
} from './modules/calendar.js';

initLayout({ activePage: 'calendar', headerCta: { href: 'build.html', label: 'Build PRISM', icon: 'wand-magic-sparkles' } });

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const now = new Date();
// ?today=YYYY-MM-DD previews another day; otherwise the viewer's local date
const TODAY = new URLSearchParams(location.search).get('today')?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0]
  || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const narrow = matchMedia('(max-width: 767px)');

/** `style` for an element whose --c is the set color; a set with no color stays neutral. */
const colorVar = set => (set?.color ? `--set-color:${set.color};` : '');

/** Set symbol tinted by a CSS mask; a set with no symbol shows its code in a bordered square. */
function symbol(set, cls = '') {
  if (!set.symbol) return `<span class="cal-sym cal-nosym ${cls}" data-c style="${colorVar(set)}" aria-hidden="true"><b>${escapeHtml(set.code.toUpperCase())}</b></span>`;
  return `<span class="cal-sym ${cls}" data-c style="${colorVar(set)}--m:url('${escapeHtml(set.symbol)}')" aria-hidden="true"></span>`;
}

// Event kinds: label, filter label and monochrome Font Awesome icon. A set release shows its set symbol instead.
const KINDS = {
  release: { one: 'Set release', many: 'Set releases', icon: 'calendar-day' },
  prerelease: { one: 'Prerelease', many: 'Prereleases', icon: 'ticket' },
  supplemental: { one: 'Supplemental release', many: 'Supplemental releases', icon: 'layer-group' },
  'secret-lair': { one: 'Secret Lair drop', many: 'Secret Lair drops', icon: 'box-open' },
  magiccon: { one: 'MagicCon', many: 'MagicCons', icon: 'location-dot' },
};
/** "Secret Lair drop · Mon, Nov 30 · 12:00 PM EST · Las Vegas": time in the viewer's zone, city for a MagicCon. */
const eventMeta = e => [KINDS[e.kind]?.one, eventRange(e), eventTime(e), e.city].filter(Boolean).join(' · ');
let setOf = {};
const faIcon = name => `<wa-icon name="${name}" aria-hidden="true"></wa-icon>`;
const eventIcon = e => (e.kind === 'release' && setOf[e.set] ? symbol(setOf[e.set], 'ev-sym') : faIcon(KINDS[e.kind]?.icon || 'calendar-day'));
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const linkLabel = e => ({ 'secret-lair': 'See the drop', magiccon: 'Event details' }[e.kind] || 'Set page');
const eventLink = e => `<a class="cal-ext" href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${linkLabel(e)} on ${escapeHtml(hostOf(e.url))} ${faIcon('arrow-up-right-from-square')}</a>`;

function renderHero(cal) {
  const el = $('cal-hero');
  const hero = spotlightHero(cal.spotlights, TODAY, { before: narrow.matches ? 0 : 2 });
  if (!hero) { el.hidden = true; return; }
  const { current: cur, week, strip } = hero;
  el.style.cssText = colorVar(cur.set);
  const segments = strip.segments.map(({ spotlight: s, left, width }) => `
    <a class="cal-seg cal-tint${s === cur ? ' now' : ''}${s.end ? '' : ' open'}" data-c style="${colorVar(s.set)}left:${left}%;width:calc(${width}% - 3px)"
       href="#w-${s.start}" data-jump="${s.start}" title="${escapeHtml(`${s.set.name}: ${spotlightSpan(s)}`)}">
      ${symbol(s.set)}<span class="nm">${escapeHtml(s.set.name)}</span><span class="len">${s.weeks ? `${s.weeks} wk` : 'TBA'}</span></a>`).join('');
  const pct = iso => ((Date.parse(iso) - Date.parse(strip.from)) / (Date.parse(strip.to) - Date.parse(strip.from))) * 100;
  const months = [];
  for (let d = new Date(`${strip.from.slice(0, 7)}-01T00:00:00Z`); ; ) {
    d.setUTCMonth(d.getUTCMonth() + 1);
    const iso = d.toISOString().slice(0, 10);
    if (iso >= strip.to) break;
    months.push(`<span style="left:${pct(iso)}%">${formatDate(iso, { month: 'short' })}</span>`);
  }
  el.innerHTML = `${symbol(cur.set, 'big')}
    <div>
      <h2 class="wa-heading-xl">${escapeHtml(cur.set.name)}</h2>
      <p>In the Spotlight since ${formatDate(cur.start, { weekday: 'short', month: 'short', day: 'numeric' })}. ${cur.next
        ? `${escapeHtml(cur.next.name)} follows on ${formatDate(cur.next.released)}.`
        : 'The next Premier set has not been announced.'}</p>
      <span class="wk cal-ink">Week ${week}${cur.weeks ? ` of ${cur.weeks}` : ''} · ${escapeHtml(spotlightSpan(cur))}</span>
    </div>
    <div class="cal-strip" aria-label="Spotlights around today">
      <div class="track">${segments}</div>
      <div class="axis" aria-hidden="true">${months.join('')}</div>
      <span class="today" style="left:${strip.today}%"><b>Today</b></span>
    </div>`;
}

function renderChapter({ spotlight: s, firstWeek, lastWeek }) {
  const meta = s.end
    ? `${formatDate(s.start)} – ${formatDate(s.end)}<br>${s.weeks} weeks`
    : `From ${formatDate(s.start)}<br>Next set not announced`;
  return `<div class="cal-chap cal-tint" data-c style="${colorVar(s.set)}grid-row:${firstWeek + 1}/${lastWeek + 2}">
    <div class="lbl">${symbol(s.set)}<h3>${escapeHtml(s.set.name)}</h3><span class="meta cal-ink">${meta}</span></div></div>`;
}

function renderWeek(week, i) {
  const begins = week.days.find(d => d.begins);
  const cells = week.days.map((d, col) => {
    const set = d.spotlight?.set;
    const n = d.date.endsWith('-01') ? `<b>${formatDate(d.date, { month: 'short' })}</b> 1` : String(Number(d.date.slice(8)));
    const count = eventsOn(events, d.date).length;
    const label = formatDate(d.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      + (d.begins ? `, ${set.name} Spotlight begins` : '') + (count ? `, ${count} event${count > 1 ? 's' : ''}` : '');
    return `<div class="cal-day${set ? ' cal-tint' : ''}${d.date === TODAY ? ' today' : ''}${d.date === selected ? ' sel' : ''}" data-c style="${colorVar(set)}grid-column:${col + 1}" data-cell="${d.date}">
      <button class="n" data-day="${d.date}" aria-label="${escapeHtml(label)}">${n}</button>${d.begins && set.symbol ? symbol(set, 'wm') : ''}</div>`;
  }).join('');
  const chips = week.events.map(({ event: e, lane, col, span, clipStart, clipEnd }) => {
    const cls = ['cal-ev', e.end ? 'bar' : '', clipStart ? 'cl' : '', clipEnd ? 'cr' : ''].filter(Boolean).join(' ');
    return `<button class="${cls}" style="grid-column:${col}/span ${span};grid-row:${lane + 2}" data-ev="${escapeHtml(e.id)}" id="ev-${escapeHtml(e.id)}-${week.start}"
      aria-label="${escapeHtml(`${e.title}, ${KINDS[e.kind]?.one || e.kind}, ${eventRange(e)}`)}" aria-haspopup="dialog">${eventIcon(e)}<span>${escapeHtml(e.title)}</span></button>`;
  }).join('');
  const more = Object.entries(week.more).map(([d, n]) =>
    `<button class="cal-more" style="grid-column:${week.days.findIndex(x => x.date === d) + 1};grid-row:${MAX_LANES + 2}" data-day="${d}">+${n} more</button>`).join('');
  const col = begins ? week.days.indexOf(begins) : 0;
  // Fri and Sat are too narrow for "begins"; the tint and watermark still mark the day
  const label = begins
    ? `<span class="cal-begins cal-ink" data-c style="${colorVar(begins.spotlight.set)}grid-column:${col + 1}/8">${escapeHtml(begins.spotlight.set.name)}${col < 5 ? ' begins' : ''}</span>`
    : '';
  return `<div class="cal-week" id="w-${week.start}" style="grid-row:${i + 1}" data-week="${i}">${cells}${label}${chips}${more}</div>`;
}

// ---------- popover and day panel ----------

let events = [];
let selected = TODAY;

/** One shared popover; wa-popover toggles itself on later clicks of the same anchor and closes on Escape. */
function openPopover(cal, anchor) {
  const pop = $('cal-pop');
  if (pop.getAttribute('for') === anchor.id) return;
  const e = events.find(x => x.id === anchor.dataset.ev);
  const set = setOf[e.set];
  const spot = e.kind === 'release' && set?.premier ? cal.spotlights.find(s => s.set === set) : null;
  pop.open = false;
  pop.innerHTML = `<div class="cal-pop">
    <h3>${set ? symbol(set) : ''}${escapeHtml(e.title)}</h3>
    <p>${escapeHtml(eventMeta(e))}</p>
    ${spot ? `<p><b>Spotlight:</b> ${escapeHtml(spotlightSpan(spot))}</p>` : ''}
    ${eventLink(e)}</div>`;
  pop.setAttribute('for', anchor.id);
  requestAnimationFrame(() => { pop.open = true; });
}

const panelItem = e => `<div class="cal-item">${eventIcon(e)}<div><b>${escapeHtml(e.title)}</b>
  <span class="cap">${escapeHtml(eventMeta(e))}</span><br>${eventLink(e)}</div></div>`;

function renderPanel(cal) {
  const d = selected;
  const spot = spotlightOn(cal.spotlights, d);
  const today = eventsOn(events, d);
  const upcoming = events.filter(e => (e.end || e.start) >= TODAY && !today.includes(e)).slice(0, 4);
  const day = formatDate(d, { weekday: 'long', month: 'long', day: 'numeric' });
  const spotLine = !spot ? ''
    : spot.start === d
      ? `<div class="cal-begins-box cal-tint" data-c style="${colorVar(spot.set)}">${symbol(spot.set)}<div><b>${escapeHtml(spot.set.name)} Spotlight begins</b><div class="cap">${escapeHtml(spotlightSpan(spot))}</div></div></div>`
      : `<div class="in" data-c style="${colorVar(spot.set)}">${symbol(spot.set)}<span>${escapeHtml(spot.set.name)} is in the Spotlight, week ${spotlightHero(cal.spotlights, d).week}${spot.weeks ? ` of ${spot.weeks}` : ''}</span></div>`;
  $('cal-panel').innerHTML = `<h2>${d === TODAY ? 'Today, ' : ''}${day}</h2>${spotLine}
    ${today.length ? today.map(panelItem).join('') : '<p class="cal-none">Nothing scheduled.</p>'}
    ${upcoming.length ? `<h3>Coming up</h3>${upcoming.map(panelItem).join('')}` : ''}
    ${d !== TODAY ? `<button class="cal-linkish" data-day="${TODAY}">Back to today</button>` : ''}`;
}

// ---------- mobile agenda (#532) ----------

let showEarlier = false;

/** Below 768px: the same events, grouped by Spotlight, from this week on unless asked for earlier ones. */
function renderAgenda(cal) {
  const groups = agenda(cal, events, showEarlier ? cal.first : weekOf(TODAY));
  const head = s => (s
    ? `<div class="cal-ahead cal-tint" data-c style="${colorVar(s.set)}">${symbol(s.set)}<div><h3>${escapeHtml(s.set.name)}</h3><span class="cap cal-ink">${escapeHtml(spotlightSpan(s))}</span></div></div>`
    : '<div class="cal-ahead"><div><h3>Before the first Premier set</h3></div></div>');
  const row = e => {
    const multi = e.end && e.end !== e.start;
    const now = e.start <= TODAY && (e.end || e.start) >= TODAY;
    return `<button class="cal-arow${now ? ' today' : ''}" data-ev="${escapeHtml(e.id)}" id="ev-${escapeHtml(e.id)}-a"
      aria-label="${escapeHtml(`${e.title}, ${KINDS[e.kind]?.one || e.kind}, ${eventRange(e)}`)}" aria-haspopup="dialog">
      <span class="dt">${formatDate(e.start)}<small>${multi ? `to ${formatDate(e.end)}` : formatDate(e.start, { weekday: 'short' })}</small></span>
      ${eventIcon(e)}<span><b>${escapeHtml(e.title)}</b><span class="cap">${KINDS[e.kind]?.one || ''}</span></span></button>`;
  };
  $('cal-agenda').innerHTML = (showEarlier ? '' : '<button class="cal-linkish cal-earlier" id="cal-earlier">Show earlier events</button>')
    + (groups.length
      ? groups.map(g => `<section class="cal-agroup">${head(g.spotlight)}${g.events.map(row).join('')}</section>`).join('')
      : '<p class="cal-none">Nothing scheduled.</p>');
}

function selectDay(cal, iso, reveal = true) {
  selected = iso;
  document.querySelectorAll('.cal-day.sel').forEach(x => x.classList.remove('sel'));
  document.querySelector(`.cal-day[data-cell="${iso}"]`)?.classList.add('sel');
  renderPanel(cal);
  // Below 960px the panel sits under the weeks; bring it into view
  if (reveal && matchMedia('(max-width: 959px)').matches) $('cal-panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function wireEvents(cal) {
  document.addEventListener('click', ev => {
    const chip = ev.target.closest('[data-ev]');
    if (chip) return openPopover(cal, chip);
    const day = ev.target.closest('[data-day]');
    if (day) return selectDay(cal, day.dataset.day);
    if (ev.target.closest('#cal-earlier')) { showEarlier = true; renderAgenda(cal); }
  });
  $('cal-today').addEventListener('click', () => selectDay(cal, TODAY, false));
}

function renderWeeks(cal) {
  $('cal-grid').innerHTML = cal.chapters.map(renderChapter).join('') + cal.weeks.map(renderWeek).join('');
}

// ---------- scroll box navigation ----------

const scroller = $('cal-scroller');
const weekTop = i => scroller.querySelector(`[data-week="${i}"]`)?.offsetTop - $('cal-grid').offsetTop || 0;
const scrollToWeek = (i, smooth = true) =>
  scroller.scrollTo({ top: weekTop(i), behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });

/** Index of the top week showing in the box. */
function topWeek(cal) {
  const y = scroller.scrollTop + 8;
  let lo = 0, hi = cal.weeks.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (weekTop(mid) <= y) lo = mid; else hi = mid - 1; }
  return lo;
}

function wireNavigation(cal) {
  const month = () => monthOfWeek(cal, topWeek(cal));
  // The agenda has no month to show; the hidden box would read its last month
  const syncMonth = () => {
    $('cal-month').textContent = narrow.matches ? 'Release calendar' : formatDate(`${month()}-15`, { month: 'long', year: 'numeric' });
  };
  narrow.addEventListener('change', () => {
    if (!narrow.matches) scrollToWeek(openingWeek(cal, TODAY), false);
    syncMonth();
  });
  $('cal-prev').addEventListener('click', () => scrollToWeek(weekOfMonth(cal, stepMonth(cal, month(), -1))));
  $('cal-next').addEventListener('click', () => scrollToWeek(weekOfMonth(cal, stepMonth(cal, month(), 1))));
  $('cal-today').addEventListener('click', () => scrollToWeek(openingWeek(cal, TODAY)));
  document.addEventListener('click', ev => {
    const jump = ev.target.closest('[data-jump]');
    if (!jump) return;
    ev.preventDefault();
    scrollToWeek(cal.weeks.findIndex(w => w.days.some(d => d.date === jump.dataset.jump)));
  });
  let queued = false;
  scroller.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; syncMonth(); });
  }, { passive: true });
  scrollToWeek(openingWeek(cal, TODAY), false);
  syncMonth();
}

// ---------- event filter (#531) ----------

/** One "All events" dropdown with a checkbox per kind; `onChange` gets the Set of kinds shown. */
function wireFilter(onChange) {
  const dd = $('cal-filter');
  const label = $('cal-filter-label');
  const total = Object.keys(KINDS).length;
  dd.insertAdjacentHTML('beforeend', Object.entries(KINDS).map(([k, v]) =>
    `<wa-dropdown-item type="checkbox" value="${k}" checked>${faIcon(v.icon).replace('<wa-icon', '<wa-icon slot="icon"')}${v.many}</wa-dropdown-item>`).join(''));
  dd.addEventListener('wa-select', ev => {
    ev.preventDefault(); // stay open while ticking several kinds
    const kinds = new Set([...dd.querySelectorAll('wa-dropdown-item')].filter(x => x.checked).map(x => x.value));
    label.textContent = kinds.size === total ? 'All events' : `${kinds.size} of ${total} event types`;
    onChange(kinds);
  });
}

async function init() {
  let data;
  try {
    const res = await fetch('assets/calendar.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error('Calendar data failed to load', err);
    $('cal-grid').innerHTML = '<p class="cal-empty">The calendar could not load. Reload the page to try again.</p>';
    return;
  }
  setOf = Object.fromEntries(data.sets.map(s => [s.code, s]));
  // Secret Lair drops move to the day their sale time falls on in the viewer's zone
  const all = localizeEvents(data.events).sort((a, b) => a.start.localeCompare(b.start));
  events = all;
  const cal = buildCalendar({ ...data, events: all }, TODAY);
  wireFilter(kinds => {
    events = all.filter(e => kinds.has(e.kind));
    // Same weeks, fewer events; mutate in place so the navigation's `cal` stays current
    Object.assign(cal, buildCalendar({ ...data, events: all }, TODAY, events));
    renderWeeks(cal);
    renderPanel(cal);
    renderAgenda(cal);
  });
  renderHero(cal);
  narrow.addEventListener('change', () => renderHero(cal));
  renderWeeks(cal);
  renderPanel(cal);
  renderAgenda(cal);
  wireEvents(cal);
  // Rows have their height only once laid out, so scroll after the next frame
  requestAnimationFrame(() => wireNavigation(cal));
}

init();

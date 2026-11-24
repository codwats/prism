/**
 * Release calendar page (#529). Draws what js/modules/calendar.js returns:
 * the Spotlight hero, then continuous weeks in a scroll box with a sticky
 * chapter ribbon. Data is the static assets/calendar.json; no runtime API calls.
 *
 * Later tickets hang off renderWeek (event chips, #530), the KINDS filter
 * (#531) and a mobile agenda (#532).
 */
import { initLayout } from './layout.js';
import { escapeHtml } from './core/utils.js';
import {
  buildCalendar, spotlightHero, spotlightSpan, formatDate, openingWeek, monthOfWeek, stepMonth, weekOfMonth,
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
    const label = formatDate(d.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      + (d.begins ? `, ${set.name} Spotlight begins` : '');
    return `<div class="cal-day${set ? ' cal-tint' : ''}${d.date === TODAY ? ' today' : ''}" data-c style="${colorVar(set)}grid-column:${col + 1}" data-day="${d.date}">
      <span class="n" aria-label="${escapeHtml(label)}">${n}</span>${d.begins && set.symbol ? symbol(set, 'wm') : ''}</div>`;
  }).join('');
  const col = begins ? week.days.indexOf(begins) : 0;
  // Fri and Sat are too narrow for "begins"; the tint and watermark still mark the day
  const label = begins
    ? `<span class="cal-begins cal-ink" data-c style="${colorVar(begins.spotlight.set)}grid-column:${col + 1}/8">${escapeHtml(begins.spotlight.set.name)}${col < 5 ? ' begins' : ''}</span>`
    : '';
  return `<div class="cal-week" id="w-${week.start}" style="grid-row:${i + 1}" data-week="${i}">${cells}${label}</div>`;
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
  const syncMonth = () => {
    $('cal-month').textContent = formatDate(`${month()}-15`, { month: 'long', year: 'numeric' });
  };
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
  const cal = buildCalendar(data, TODAY);
  renderHero(cal);
  narrow.addEventListener('change', () => renderHero(cal));
  renderWeeks(cal);
  // Rows have their height only once laid out, so scroll after the next frame
  requestAnimationFrame(() => wireNavigation(cal));
}

init();

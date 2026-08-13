#!/usr/bin/env node
// Banned-string check for reader-facing copy (see issue #166).
// Catches drift BETWEEN sessions, not style within one — the drafting agent
// has /ste-writing loaded and self-lints its own paragraph. Run by hand:
//   node scripts/copy-check.mjs
// Exit code is always 0: this reports, it does not gate.

import { readFileSync } from 'node:fs';

const HTML = ['index.html', 'guide.html', 'tools.html', 'build.html'];
const JS = ['js/features/results.js', 'js/features/deck-list.js', 'js/layout.js'];

const RULES = [
	{ cls: 'glyph', re: /—/g },
	{ cls: 'glyph', re: /;/g, proseOnly: true },
	{ cls: 'contraction', re: /\b(don|can|won|isn|doesn)['’]t\b|\b(it|that)['’]s\b|\byou['’]re\b/gi },
	{ cls: '#158 drift', re: /\bPOOL\b|\bCORE\b/g },
	{ cls: '#158 drift', re: /shared cards|Basics by Deck|perfect-fit/gi },
	{ cls: '#158 drift', re: /\bposition\b/g },
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘' };

/** Strip script/style bodies and all tags, preserving line numbering. */
const blank = (m) => m.replace(/[^\n]/g, ' ');
function stripHtml(src) {
	return src
		.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, blank)
		.replace(/<[^>]+>/g, blank) // blank, not collapse: tags span lines
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
		.replace(/&(\w+);/g, (_, e) => ENTITIES[e] ?? ' ');
}

/** The supporting line under a page's <h1> sits outside the copy standard (#159). */
function exemptLines(src) {
	const lines = src.split('\n');
	const exempt = new Set();
	lines.forEach((line, i) => {
		if (!/<h1\b/.test(line)) return;
		for (let j = i + 1; j < lines.length; j++) {
			if (lines[j].trim()) return exempt.add(j + 1);
		}
	});
	return exempt;
}

const findings = [];
for (const file of [...HTML, ...JS]) {
	const isHtml = file.endsWith('.html');
	const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
	const exempt = isHtml ? exemptLines(src) : new Set();
	const lines = (isHtml ? stripHtml(src) : src).split('\n');
	// Every reported line number depends on this. A tag spanning lines that
	// collapses to one space shifts every number after it, silently.
	if (lines.length !== src.split('\n').length) throw new Error(`${file}: strip changed line count`);

	lines.forEach((line, i) => {
		const n = i + 1;
		if (exempt.has(n)) return;
		if (!isHtml && /^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments are not reader-facing
		for (const { cls, re, proseOnly } of RULES) {
			if (proseOnly && !isHtml) continue; // raw JS semicolons are syntax, not prose
			for (const m of line.matchAll(re)) {
				findings.push({ file, n, cls, hit: m[0], ctx: line.trim().slice(0, 90) });
			}
		}
	});
}

for (const f of findings) console.log(`${f.file}:${f.n} [${f.cls}] "${f.hit}" | ${f.ctx}`);
console.log(`\n${findings.length} finding(s) across ${HTML.length + JS.length} files.`);

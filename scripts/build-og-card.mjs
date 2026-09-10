#!/usr/bin/env node
/**
 * Renders assets/og-card.png, the 1200x630 share card used by every page's
 * og:image and twitter:image.
 *
 * The card is composed entirely from vector paths: the violet ground, the
 * PRISM wordmark lifted from assets/Prism-Logo-Invert.svg, and the 22 deck
 * colors from js/modules/processor.js as the stripe rule. Nothing on it is
 * live text, which is the point. adobe-aldine and halyard-micro are Typekit
 * web fonts and are not installed here, so anything typeset would render in
 * whatever substitute the rasterizer found. The logo is already outlined, so
 * the card carries the real brand lettering with no font to resolve.
 *
 * Usage: node scripts/build-og-card.mjs
 * Requires rsvg-convert (librsvg).
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DEFAULT_COLORS } from '../js/modules/processor.js';

const W = 1200;
const H = 630;
const GROUND = '#180a2e'; // brand-05

// Logo block
const LOGO_W = 620;
const LOGO_H = Math.round((LOGO_W * 405) / 1188); // preserve the source aspect

// Stripe rule. Wide and short so it reads as a sleeve edge rather than a row
// of chips, and wider than the wordmark so it carries the card's horizontal
// structure instead of sitting under the logo as a detail.
const RULE_W = 1000;
const RULE_H = 14;
const RULE_GAP = 6;
const GAP_ABOVE_RULE = 60;

const blockW =
  (RULE_W - RULE_GAP * (DEFAULT_COLORS.length - 1)) / DEFAULT_COLORS.length;

// Center the logo + rule as one optical group
const groupH = LOGO_H + GAP_ABOVE_RULE + RULE_H;
const groupY = Math.round((H - groupH) / 2);
const logoX = Math.round((W - LOGO_W) / 2);
const ruleX = Math.round((W - RULE_W) / 2);
const ruleY = groupY + LOGO_H + GAP_ABOVE_RULE;

// Lift the logo's drawing content out of its own <svg> wrapper so it can be
// nested with its viewBox intact.
const logoSrc = readFileSync(new URL('../assets/Prism-Logo-Invert.svg', import.meta.url), 'utf8');
const logoInner = logoSrc.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const stripes = DEFAULT_COLORS.map((hex, i) => {
  const x = (ruleX + i * (blockW + RULE_GAP)).toFixed(2);
  return `  <rect x="${x}" y="${ruleY}" width="${blockW.toFixed(2)}" height="${RULE_H}" rx="3" fill="${hex}"/>`;
}).join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${GROUND}"/>
  <svg x="${logoX}" y="${groupY}" width="${LOGO_W}" height="${LOGO_H}" viewBox="0 0 1188 405">
${logoInner}
  </svg>
${stripes}
</svg>
`;

const tmp = new URL('../assets/.og-card.tmp.svg', import.meta.url);
const out = new URL('../assets/og-card.png', import.meta.url);
writeFileSync(tmp, svg);
try {
  execFileSync('rsvg-convert', ['-w', String(W), '-h', String(H), '-o', out.pathname, tmp.pathname]);
} finally {
  unlinkSync(tmp);
}
console.log(`Wrote assets/og-card.png (${W}x${H})`);

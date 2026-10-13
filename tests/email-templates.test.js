import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEMPLATES, render } from '../scripts/build-email-templates.mjs';

const read = file => readFileSync(new URL(`../docs/email-templates/${file}`, import.meta.url), 'utf8');

test('the committed auth email templates match the generator (#341)', () => {
  for (const t of TEMPLATES) assert.equal(read(t.file), render(t), `${t.file} is stale: run node scripts/build-email-templates.mjs`);
});

test('each template keeps its Supabase variable, with a plain-text link fallback', () => {
  for (const t of TEMPLATES) {
    const html = read(t.file);
    if (t.url) {
      assert.equal(html.split('{{ .ConfirmationURL }}').length - 1, 3, `${t.file}: button href, fallback href and fallback text`);
    } else {
      assert.ok(html.includes('{{ .Token }}'), `${t.file} must show the code`);
    }
  }
  assert.ok(read('change-email.html').includes('{{ .NewEmail }}'));
  assert.equal(TEMPLATES.length, 6);
});

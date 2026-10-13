#!/usr/bin/env node
/**
 * Builds the six Supabase Auth email templates (#341) into docs/email-templates/.
 * One layout, six messages, so the brand can't drift between them. The output
 * is committed and pasted by hand into Supabase → Authentication → Email
 * Templates (scripts/setup-auth-email.sh walks it). Rerun after any edit here.
 *
 * Email clients don't load Typekit or external CSS: everything is inline, the
 * type stack falls back to Georgia / system sans, and the layout is tables.
 * The {{ .Var }} placeholders are Supabase's Go template variables; keep them
 * verbatim.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'email-templates');
const SITE = 'https://prismmtg.com';
// DESIGN.md brand ramp: brand-30 button, brand-20 headings, brand-95 page tint.
const C = { button: '#4d4169', heading: '#3a2e55', text: '#34353c', subtle: '#5a5a62', tint: '#f6eeff', border: '#e5e5ef' };
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const TEMPLATES = [
  {
    file: 'confirm-signup.html', supabase: 'Confirm signup', subject: 'Confirm your PRISM account',
    heading: 'Confirm your email',
    body: 'Confirm <strong>{{ .Email }}</strong> to finish setting up your PRISM account.',
    button: 'Confirm email', url: '{{ .ConfirmationURL }}',
    why: 'You’re receiving this because someone signed up for PRISM with this address. If it wasn’t you, ignore this email and no account will be created.',
  },
  {
    file: 'invite.html', supabase: 'Invite user', subject: 'Your artist page in the PRISM gallery',
    heading: 'Your artist page is ready',
    body: 'A PRISM gallery admin set up an artist page for you in the PRISM community gallery. Accept the invite to create your account and choose a password. The page is yours as soon as you do.',
    button: 'Accept invite', url: '{{ .ConfirmationURL }}',
    why: 'You’re receiving this because a PRISM gallery admin invited this address. If you weren’t expecting it, ignore this email.',
  },
  {
    file: 'magic-link.html', supabase: 'Magic Link', subject: 'Your PRISM sign-in link',
    heading: 'Sign in to PRISM',
    body: 'Use this link to sign in. It works once and expires soon.',
    button: 'Sign in', url: '{{ .ConfirmationURL }}',
    why: 'You’re receiving this because someone asked to sign in to PRISM with this address. If it wasn’t you, ignore this email.',
  },
  {
    file: 'change-email.html', supabase: 'Change Email Address', subject: 'Confirm your new PRISM email',
    heading: 'Confirm your new email',
    body: 'Confirm changing your PRISM account email from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>.',
    button: 'Confirm change', url: '{{ .ConfirmationURL }}',
    why: 'You’re receiving this because someone asked to change the email on a PRISM account. If it wasn’t you, ignore this email: nothing changes. Consider changing your password.',
  },
  {
    file: 'reset-password.html', supabase: 'Reset Password', subject: 'Reset your PRISM password',
    heading: 'Reset your password',
    body: 'Choose a new password for your PRISM account. This link works once and expires soon.',
    button: 'Choose a new password', url: '{{ .ConfirmationURL }}',
    why: 'You’re receiving this because someone asked to reset the password for this address. If it wasn’t you, ignore this email: your password stays the same.',
  },
  {
    // No link to fall back to: Supabase sends only a one-time code here.
    file: 'reauthentication.html', supabase: 'Reauthentication', subject: 'Your PRISM verification code',
    heading: 'Confirm it’s you',
    body: 'Enter this code in PRISM to continue.',
    code: '{{ .Token }}',
    why: 'You’re receiving this because your PRISM account is making a change that needs a fresh check that it’s you. If it wasn’t you, change your password.',
  },
];

function render(t) {
  const action = t.url
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0 0;">
          <tr><td class="btn" bgcolor="${C.button}" style="border-radius: 6px; background: ${C.button};">
            <a href="${t.url}" style="display: inline-block; padding: 12px 24px; font-family: ${SANS}; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px;">${t.button}</a>
          </td></tr>
        </table>
        <p class="subtle" style="margin: 24px 0 0; font-family: ${SANS}; font-size: 13px; line-height: 1.5; color: ${C.subtle};">Button not working? Copy this link into your browser:<br><a href="${t.url}" style="color: ${C.button}; word-break: break-all;">${t.url}</a></p>`
    : `<p class="code" style="margin: 24px 0 0; padding: 16px; font-family: Menlo, Consolas, monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; text-align: center; color: ${C.heading}; background: ${C.tint}; border-radius: 6px;">${t.code}</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${t.subject}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .page { background: #180a2e !important; }
    .card { background: #23173b !important; border-color: #3a2e55 !important; }
    .heading, .wordmark, .code { color: #eadeff !important; }
    .text { color: #e5e5ef !important; }
    .subtle, .subtle a { color: #b5a9d7 !important; }
    .code { background: #3a2e55 !important; }
    .btn, .btn a { background: #cec2f2 !important; color: #180a2e !important; }
  }
</style>
</head>
<body class="page" style="margin: 0; padding: 0; background: ${C.tint};">
<!-- PRISM · ${t.supabase} · built by scripts/build-email-templates.mjs (#341) -->
<table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: ${C.tint};">
  <tr><td align="center" style="padding: 32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px;">
      <tr><td style="padding: 0 0 16px;">
        <a href="${SITE}" style="text-decoration: none;"><img src="${SITE}/assets/web-app-manifest-192x192.png" width="32" height="32" alt="" style="vertical-align: middle; border: 0;"><span class="wordmark" style="vertical-align: middle; margin-left: 8px; font-family: ${SERIF}; font-size: 22px; font-weight: 700; letter-spacing: 1px; color: ${C.heading};">PRISM</span></a>
      </td></tr>
      <tr><td class="card" style="padding: 32px; background: #ffffff; border: 1px solid ${C.border}; border-radius: 8px;">
        <h1 class="heading" style="margin: 0; font-family: ${SERIF}; font-size: 26px; font-weight: 600; line-height: 1.25; color: ${C.heading};">${t.heading}</h1>
        <p class="text" style="margin: 16px 0 0; font-family: ${SANS}; font-size: 16px; line-height: 1.55; color: ${C.text};">${t.body}</p>
        ${action}
      </td></tr>
      <tr><td class="subtle" style="padding: 20px 8px 0; font-family: ${SANS}; font-size: 12px; line-height: 1.5; color: ${C.subtle};">
        ${t.why}<br><br>PRISM · Sleeve marking for Commander players · <a href="${SITE}" style="color: ${C.subtle};">prismmtg.com</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true });
  for (const t of TEMPLATES) writeFileSync(join(OUT, t.file), render(t));
  console.log(`Wrote ${TEMPLATES.length} templates to ${OUT}`);
}

export { render };

/**
 * Cloudflare Pages Function: POST /api/contact
 *
 * Validates the contact form, checks the honeypot and (if configured)
 * Cloudflare Turnstile, then emails the lead via Resend.
 *
 * Environment variables (Pages > Settings > Variables and secrets):
 *   RESEND_API_KEY        secret, required to send email
 *   CONTACT_TO            where leads go, e.g. "hello@murberec.com" (comma-separate for several)
 *   CONTACT_FROM          verified sender, e.g. "MURBEREC Website <web@murberec.com>"
 *   TURNSTILE_SECRET_KEY  secret, optional; enables spam checks when set
 *
 * Responds with JSON when the request asks for it (the JS form does), and
 * with a 303 redirect to /thanks otherwise, so the form works without JS.
 */

interface Env {
  RESEND_API_KEY?: string;
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
  TURNSTILE_SECRET_KEY?: string;
}

const AUDIENCES: Record<string, string> = { organization: 'Organization', tech: 'Tech company', student: 'Student / intern' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const wantsJson = (request.headers.get('accept') || '').includes('application/json');
  const reply = (status: number, body: { ok: boolean; error?: string }) =>
    wantsJson
      ? Response.json(body, { status })
      : body.ok
        ? Response.redirect(new URL('/thanks', request.url).toString(), 303)
        : new Response(body.error, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(400, { ok: false, error: 'We couldn’t read that submission.' });
  }
  const get = (k: string, max: number) => String(form.get(k) ?? '').trim().slice(0, max);

  // Honeypot: pretend success so bots learn nothing.
  if (get('website', 200)) return reply(200, { ok: true });

  const lead = {
    audience: AUDIENCES[get('audience', 20)] ?? 'Organization',
    name: get('name', 120),
    organization: get('organization', 160),
    email: get('email', 200),
    topic: get('topic', 60) || 'Not specified',
    message: get('message', 5000),
  };
  if (!lead.name || !lead.organization || !EMAIL_RE.test(lead.email) || lead.message.length < 10) {
    return reply(422, { ok: false, error: 'Some required fields are missing or invalid.' });
  }

  if (env.TURNSTILE_SECRET_KEY) {
    const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: get('cf-turnstile-response', 2048),
        remoteip: request.headers.get('cf-connecting-ip') ?? '',
      }),
    }).then((r) => r.json<{ success: boolean }>()).catch(() => ({ success: false }));
    if (!verify.success) return reply(403, { ok: false, error: 'We couldn’t verify you’re human.' });
  }

  if (!env.RESEND_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM) {
    console.error('contact: email is not configured (RESEND_API_KEY / CONTACT_TO / CONTACT_FROM)');
    return reply(503, { ok: false, error: 'Our contact form is temporarily unavailable.' });
  }

  const rows = Object.entries(lead)
    .filter(([k]) => k !== 'message')
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${k}</td><td>${esc(v)}</td></tr>`)
    .join('');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.CONTACT_FROM,
      to: env.CONTACT_TO.split(',').map((s) => s.trim()),
      reply_to: lead.email,
      subject: `New lead: ${lead.name} (${lead.organization}) [${lead.audience}]`,
      text: Object.entries(lead).map(([k, v]) => `${k}: ${v}`).join('\n'),
      html: `<table>${rows}</table><p style="white-space:pre-wrap">${esc(lead.message)}</p>`,
    }),
  }).catch((err: unknown) => {
    console.error('contact: Resend unreachable', err);
    return null;
  });
  if (!res?.ok) {
    if (res) console.error('contact: Resend error', res.status, await res.text());
    return reply(502, { ok: false, error: 'We couldn’t send your message.' });
  }
  return reply(200, { ok: true });
};

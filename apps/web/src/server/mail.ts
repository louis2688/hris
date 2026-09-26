import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let transport: Transporter | null = null;

/** Send an email via SMTP_URL. No-op (false) when unset; never throws. */
export async function sendMail(m: { to: string; subject: string; text?: string; html?: string }): Promise<boolean> {
  const url = process.env.SMTP_URL;
  if (!url) return false;
  try {
    transport ??= nodemailer.createTransport(url);
    await transport.sendMail({ from: process.env.MAIL_FROM || "HRIS <no-reply@hris.local>", ...m });
    return true;
  } catch (e) {
    console.error("sendMail failed", e);
    return false;
  }
}

export function appUrl(path = "") {
  const base =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return base.replace(/\/$/, "") + path;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Minimal branded HTML email. */
export function renderEmail(title: string, body?: string, link?: string) {
  const href = link ? appUrl(link.startsWith("/") ? link : `/${link}`) : null;
  const html = `<div style="background:#f4f4f5;padding:24px;font-family:Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;color:#18181b">
<div style="font-weight:bold;color:#2563eb;margin-bottom:16px">HRIS</div>
<h2 style="margin:0 0 12px;font-size:18px">${esc(title)}</h2>
${body ? `<p style="margin:0 0 20px;line-height:1.5;white-space:pre-line">${esc(body)}</p>` : ""}
${href ? `<a href="${esc(href)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">Open in HRIS</a>` : ""}
</div></div>`;
  const text = [title, body, href].filter(Boolean).join("\n\n");
  return { html, text };
}

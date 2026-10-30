/**
 * Every email Voice Verse sends goes through here.
 *
 * Rules:
 *  - An email problem (bad SMTP login, provider outage) can NEVER fail the request that triggered it:
 *    sendEmail logs and resolves false instead of throwing.
 *  - All user-supplied text is HTML-escaped and subjects have newlines stripped.
 *  - Logs name the purpose and a masked address, never the full recipient or a link.
 *  - Emails carry nothing about what anyone said or heard in a session: only account and payment notices.
 *
 * Delivery is Gmail SMTP for now (a domain-based provider such as Resend later: change only the EMAIL_*
 * settings). With no EMAIL_HOST_PASSWORD set (development, tests) nothing is sent and the email is only logged.
 */
import nodemailer from "nodemailer";

const BRAND = "Voice Verse";

export const mailConfigured = () => Boolean(process.env.EMAIL_HOST_USER && process.env.EMAIL_HOST_PASSWORD);
/** True when an email would really be sent (or captured by a test). Lets callers skip needless work. */
export const mailEnabled = () => Boolean(overrideSender) || mailConfigured();

const mask = (address: string) => {
  const [name = "", domain = ""] = address.split("@");
  return `${name.slice(0, 1)}***@${domain}`;
};

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function render(headline: string, paragraphs: string[], button?: { label: string; url: string }) {
  const support = process.env.SUPPORT_EMAIL || process.env.EMAIL_HOST_USER || "";
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px 0;">${escapeHtml(p)}</p>`).join("");
  const cta = button
    ? `<p style="margin:0 0 18px 0;"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#0b192c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;">${escapeHtml(button.label)}</a></p>` +
      `<p style="margin:0 0 8px 0;font-size:13px;color:#64748b;">If the button does not work, copy this link into your browser:</p>` +
      `<p style="margin:0;font-size:13px;word-break:break-all;">${escapeHtml(button.url)}</p>`
    : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f7fa;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px 4px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#0b192c;">${BRAND}</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px 26px;font-family:Arial,Helvetica,sans-serif;color:#0b192c;font-size:15px;line-height:1.55;">
<h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;">${escapeHtml(headline)}</h1>${body}${cta}</td></tr>
<tr><td style="padding:16px 8px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#64748b;text-align:center;">Questions? Write to ${escapeHtml(support)}.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [headline, "", ...paragraphs, ...(button ? ["", `${button.label}: ${button.url}`] : [])].join("\n");
  return { html, text };
}

export type Sender = (message: { from: string; to: string; subject: string; text: string; html: string }) => Promise<unknown>;

let overrideSender: Sender | null = null;
/** Tests replace the SMTP step with a recorder. */
export const setSenderForTests = (sender: Sender | null) => {
  overrideSender = sender;
};

function transport(): Sender {
  if (overrideSender) return overrideSender;
  const port = Number(process.env.EMAIL_PORT ?? 465);
  const secure = (process.env.EMAIL_USE_SSL ?? "true").toLowerCase() !== "false";
  const t = nodemailer.createTransport({
    host: process.env.EMAIL_HOST ?? "smtp.gmail.com",
    port,
    secure,
    auth: { user: process.env.EMAIL_HOST_USER, pass: process.env.EMAIL_HOST_PASSWORD },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
  return (m) => t.sendMail(m);
}

/** Sends one email. Never throws. */
export async function sendEmail(to: string, subject: string, headline: string, paragraphs: string[], button?: { label: string; url: string }): Promise<boolean> {
  if (!to) return false;
  try {
    if (!overrideSender && !mailConfigured()) {
      console.info(`Email not configured; would have sent '${subject.replace(/\s+/g, " ")}' to ${mask(to)}`);
      return false;
    }
    const { html, text } = render(headline, paragraphs, button);
    await transport()({
      from: process.env.EMAIL_FROM || process.env.EMAIL_HOST_USER || "",
      to,
      subject: subject.replace(/\s+/g, " ").trim(),
      text,
      html,
    });
    console.info(`Sent '${subject.replace(/\s+/g, " ")}' to ${mask(to)}`);
    return true;
  } catch (err) {
    console.error(`Could not send an email to ${mask(to)}:`, (err as Error).message);
    return false;
  }
}

export const nairaFromKobo = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const sendVerification = (to: string, name: string, url: string) =>
  sendEmail(to, "Welcome to Voice Verse: confirm your email", "Welcome to Voice Verse", [
    `Hi ${name || "there"}, your account is ready.`,
    "Confirm your email address so we can reach you about your account and receipts.",
  ], { label: "Confirm my email", url });

export const sendPasswordReset = (to: string, name: string, url: string) =>
  sendEmail(to, "Reset your Voice Verse password", "Reset your password", [
    `Hi ${name || "there"}, someone asked to reset the password for this account. If that was you, choose a new one with the link below. It works once and expires in one hour.`,
    "If you did not ask for this, ignore this email. Your password will not change.",
  ], { label: "Choose a new password", url });

export const sendReceipt = (to: string, what: string, amountKobo: number, reference: string) =>
  sendEmail(to, `Your Voice Verse receipt: ${nairaFromKobo(amountKobo)}`, "Payment received", [
    `Thank you. Here is your receipt for ${what}.`,
    `Amount: ${nairaFromKobo(amountKobo)}`,
    `Reference: ${reference}`,
    "Keep this email as your record.",
  ]);

import "server-only";

export const INVOICE_TO = process.env.INVOICE_TO || "info@apex-leads.co.uk";

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Sends via Resend. Returns an error string, or null on success. */
export async function sendEmail(opts: {
  subject: string;
  html: string;
  attachments?: { filename: string; content: Uint8Array }[];
}): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "Email isn't set up yet (RESEND_API_KEY missing).";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Apex Leads Portal <onboarding@resend.dev>",
      to: [INVOICE_TO],
      subject: opts.subject,
      html: opts.html,
      attachments: (opts.attachments ?? []).map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content).toString("base64"),
      })),
    }),
  });
  if (!res.ok) return `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`;
  return null;
}

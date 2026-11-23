import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export interface OfferTier {
  key: string;
  name: string;
  sort: number;
  monthly_fee: number;
  min_daily_ad_spend: number;
  guarantee_leads: number | null;
  guarantee_days: number | null;
  report_every_days: number;
  exclusive_radius_km: number | null;
  min_term_months: number;
  notice_days: number;
  extras: string | null;
}

export interface ContractDetails {
  business_name: string;
  contact_name: string;
  area: string;
  start_date: string; // YYYY-MM-DD
  monthly_fee: number;
}

export interface ContractRow {
  id: string;
  client_name: string;
  tier: string;
  template_id: number | null;
  status: "draft" | "sent" | "signed" | "ended";
  details: ContractDetails;
  body: string;
  sign_token: string | null;
  closer_id: string | null;
  created_by: string | null;
  sent_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  file_path: string | null;
  created_at: string;
}

export const statusTone = (s: ContractRow["status"]) => (s === "signed" ? "good" : s === "sent" ? "info" : s === "ended" ? "default" : "warn");

const gbp = (n: number) => `£${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const longDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** One-line summary of what a tier includes, for pickers and client cards. */
export function tierSummary(t: OfferTier): string {
  return [
    `${gbp(t.monthly_fee)} a month`,
    `ad spend from ${gbp(t.min_daily_ad_spend)} a day`,
    t.guarantee_leads ? `${t.guarantee_leads} qualified leads in ${t.guarantee_days} days` : "no guarantee",
    t.exclusive_radius_km ? `${t.exclusive_radius_km} km exclusive area` : "no exclusive area",
    t.min_term_months ? `${t.min_term_months}-month minimum` : "rolling monthly",
  ].join(" · ");
}

/** The earliest date a client can leave: the minimum term from signing, or just the notice period. */
export function minimumTermEnd(t: OfferTier, startDate: string): string | null {
  if (!t.min_term_months) return null;
  const d = new Date(`${startDate.slice(0, 10)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + t.min_term_months);
  return d.toISOString().slice(0, 10);
}

const BLANK = "____________________";

/** A tier's contract with the client's details left as blank lines: an example to show a prospect before they buy. */
export function blankContract(body: string, t: OfferTier): string {
  return fillTemplate(body, t, { business_name: BLANK, contact_name: BLANK, area: BLANK, start_date: "", monthly_fee: Number(t.monthly_fee) });
}

const every = (days: number) => (days === 7 ? "week" : days === 14 ? "two weeks" : `${days} days`);

/** Fill a template's {{placeholders}} from the tier's terms and the client's details. */
export function fillTemplate(body: string, t: OfferTier, d: ContractDetails): string {
  const start = d.start_date ? longDate(d.start_date) : BLANK;
  const spend = gbp(t.min_daily_ad_spend);
  const guaranteed = Boolean(t.guarantee_leads);
  const values: Record<string, string> = {
    tier_name: t.name,
    business_name: d.business_name,
    contact_name: d.contact_name || d.business_name,
    area: d.area || BLANK,
    start_date: start,
    monthly_fee: gbp(d.monthly_fee),
    ad_spend: spend,
    // Extra bullets for section 1: the report, anything the tier adds, and the exclusive area.
    services_extra: [
      `- A results report every ${every(t.report_every_days)}.`,
      ...(t.extras ?? "").split(/\.\s*/).filter(Boolean).map((x) => `- ${x.trim()}.`),
      ...(t.exclusive_radius_km
        ? [`- Exclusive area: Agency will not take on another client in the same trade within ${t.exclusive_radius_km} km of Client's base while this Agreement runs.`]
        : []),
    ].join("\n"),
    guarantee: guaranteed
      ? [
          `- The guarantee: ${t.guarantee_leads} qualifying leads within ${t.guarantee_days} days of launch, or Agency keeps working at no extra fee until it hits ${t.guarantee_leads}.`,
          "- Qualifying lead: A genuine enquiry through the campaign form: real name, valid number, stated interest.",
          `- Conditions: Client maintains the ${spend}/day minimum spend and grants full access on time for launch.`,
          "- Accuracy: Depends on the accuracy of what Client provided during qualification and onboarding — trade, job value, service area, capacity. Agency is not liable for guarantee shortfalls caused by inaccurate information from Client.",
          "- Scope: Covers Agency's fee only, not ad spend. Runs from campaign launch, not from signing.",
        ].join("\n")
      : "- This plan does not include a lead guarantee. Agency will work to deliver qualified enquiries but does not promise a number of leads.",
    term: [
      t.min_term_months
        ? `- Minimum term: ${t.min_term_months} months from the Effective Date. After that, rolling month to month.`
        : "- Rolling month to month from the Effective Date.",
      `- ${t.notice_days} days' written notice by email, either party${t.min_term_months ? ", to end the Agreement at or after the end of the minimum term" : ""}.`,
      `- Fees paid are non-refundable once work has commenced${guaranteed ? ", except as set out in Section 3" : ""}.`,
    ].join("\n"),
    // Kept for older template versions that use these as plain sentences.
    exclusive_area: t.exclusive_radius_km
      ? `Agency will not take on another client in the same trade within ${t.exclusive_radius_km} km of Client's base while this Agreement runs.`
      : "This plan does not include an exclusive area.",
    reporting: `Agency sends Client a results report every ${every(t.report_every_days)}.${t.extras ? ` ${t.extras}` : ""}`,
  };
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => values[key] ?? whole);
}

// The standard PDF fonts cover Windows Latin-1 only; anything outside it (emoji and the like) becomes "?".
const safe = (s: string) => s.replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF‘’“”–—•]/g, "?");

type Word = { text: string; font: PDFFont };

/**
 * The contract as a PDF, laid out like Apex-Leads' own service agreement: centred title, numbered
 * headings, bullets with bold labels, a signature block and a footer. When it has been signed the
 * signature lines are filled in and the signing record is added.
 */
export async function buildContractPdf(
  c: Pick<ContractRow, "body" | "client_name" | "signed_at" | "signer_name"> & { signer_ip?: string | null; example?: boolean }
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.1, 0.1, 0.12);
  const grey = rgb(0.45, 0.45, 0.5);
  const W = 595;
  const H = 842;
  const M = 58;
  const size = 11;
  const lead = 16.5;
  let page = pdf.addPage([W, H]);
  let y = H - M - 8;
  const room = (need: number) => {
    if (y - need < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const centred = (t: string, f: PDFFont, s: number, color = ink) => {
    room(s + 6);
    page.drawText(t, { x: (W - f.widthOfTextAtSize(t, s)) / 2, y, size: s, font: f, color });
    y -= s + 8;
  };
  /** Lay out words of mixed fonts, wrapping at the right margin. */
  const flow = (words: Word[], indent = 0, s = size) => {
    const space = regular.widthOfTextAtSize(" ", s);
    let x = M + indent;
    room(lead);
    for (const w of words) {
      const width = w.font.widthOfTextAtSize(w.text, s);
      if (x + width > W - M && x > M + indent) {
        y -= lead;
        room(lead);
        x = M + indent;
      }
      page.drawText(w.text, { x, y, size: s, font: w.font, color: ink });
      x += width + space;
    }
    y -= lead;
  };
  const words = (t: string, f: PDFFont): Word[] => t.split(/\s+/).filter(Boolean).map((text) => ({ text, font: f }));
  /** "Label: the rest" gets a bold label when the label is short. */
  const labelled = (t: string, f = regular): Word[] => {
    const m = /^([^:]{2,40}:)\s+(.*)$/.exec(t);
    return m ? [...words(m[1], bold), ...words(m[2], f)] : words(t, f);
  };

  const signedOn = c.signed_at ? new Date(c.signed_at).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" }) : null;
  const lines = safe(c.body).split("\n").map((l) => l.trimEnd());
  if (c.example) {
    centred("EXAMPLE ONLY - NOT FOR SIGNATURE", sans, 8.5, grey);
    y -= 18;
  }
  let i = 0;
  // The first two non-empty lines are the title and subtitle when they are all capitals.
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i] && lines[i] === lines[i].toUpperCase() && !/^\d/.test(lines[i])) {
    centred(lines[i++], bold, 22);
    while (i < lines.length && !lines[i].trim()) i++;
    if (lines[i] && lines[i] === lines[i].toUpperCase() && !/^\d/.test(lines[i])) centred(lines[i++], bold, 13);
    y -= 10;
  }
  const last = lines.length - 1;
  for (; i < lines.length; i++) {
    let t = lines[i].trim();
    if (!t) {
      y -= lead * 0.45;
      continue;
    }
    if (i === last && /·|@/.test(t)) {
      // Footer: contact line under a rule.
      y -= 6;
      room(30);
      page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.6, color: rgb(0.8, 0.8, 0.82) });
      y -= 8;
      centred(t, sans, 9, grey);
      continue;
    }
    if (/^\d+\.\s/.test(t) || t === "Signatures") {
      y -= 6;
      room(lead * 3);
      page.drawText(t, { x: M, y, size: 13.5, font: bold, color: ink });
      y -= lead + 3;
      continue;
    }
    if (signedOn) {
      if (/^Client signature:/.test(t)) t = `Client signature: ${c.signer_name ?? c.client_name} (signed electronically)`;
      else if (/^Date:\s*_+$/.test(t)) t = `Date: ${signedOn}`;
    }
    if (t.startsWith("- ")) {
      room(lead);
      page.drawText("•", { x: M + 8, y, size, font: regular, color: ink });
      flow(labelled(t.slice(2)), 20);
      y -= 2;
      continue;
    }
    const isItalic = /^Effective Date:/.test(t) || /^This Agreement may be signed/.test(t);
    const isParty = /\((“|")(Agency|Client)(”|")\)/.test(t);
    if (isParty) {
      const m = /^(.*?)(,)? (trading as.*|\(.*)$/.exec(t);
      flow(m ? [...words(m[1] + (m[2] ?? ""), bold), ...words(m[3], regular)] : words(t, regular));
    } else flow(isItalic ? words(t, italic) : labelled(t));
    y -= 3;
  }
  if (c.signed_at) {
    y -= lead;
    room(lead * 5);
    page.drawText("Signature record", { x: M, y, size: 11, font: bold, color: ink });
    y -= lead;
    flow(words(safe(`Signed electronically by ${c.signer_name ?? c.client_name} on ${new Date(c.signed_at).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "long", timeStyle: "short" })} (UK time)${c.signer_ip ? `, from IP address ${c.signer_ip}` : ""}, by typing their name and ticking "I agree" on the Apex Leads signing page.`), regular), 0, 10);
  }
  return pdf.save();
}

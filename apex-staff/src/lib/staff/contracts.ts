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

/** Fill a template's {{placeholders}} from the tier's terms and the client's details. */
export function fillTemplate(body: string, t: OfferTier, d: ContractDetails): string {
  const start = d.start_date ? longDate(d.start_date) : BLANK;
  const values: Record<string, string> = {
    tier_name: t.name,
    business_name: d.business_name,
    contact_name: d.contact_name || d.business_name,
    area: d.area || "[AREA TO BE AGREED]",
    start_date: start,
    monthly_fee: gbp(d.monthly_fee),
    ad_spend: gbp(t.min_daily_ad_spend),
    guarantee: t.guarantee_leads
      ? `Apex-Leads guarantees ${t.guarantee_leads} qualified leads within ${t.guarantee_days} days of the campaign going live. If the guarantee is not met, Apex-Leads keeps working at no charge until it is.`
      : "This tier does not include a lead guarantee.",
    exclusive_area: t.exclusive_radius_km
      ? `Apex-Leads will not take on another client in the same trade within ${t.exclusive_radius_km} km of the Client's base while this agreement runs.`
      : "This tier does not include an exclusive area.",
    term: t.min_term_months
      ? `This agreement has a minimum term of ${t.min_term_months} months from ${start}. After that it continues month to month and either side can end it with ${t.notice_days} days' written notice.`
      : `This agreement runs month to month. Either side can end it with ${t.notice_days} days' written notice.`,
    reporting: `Apex-Leads sends the Client a results report every ${t.report_every_days === 7 ? "week" : t.report_every_days === 14 ? "two weeks" : `${t.report_every_days} days`}.${t.extras ? ` ${t.extras}` : ""}`,
  };
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => values[key] ?? whole);
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

// The standard PDF fonts only cover Latin-1; anything else (curly quotes are fine, emoji are not) becomes "?".
const safe = (s: string) => s.replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF‘’“”–—]/g, "?").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");

/** The contract as a PDF, with the signature record on the end when it has been signed. */
export async function buildContractPdf(
  c: Pick<ContractRow, "body" | "client_name" | "signed_at" | "signer_name"> & { signer_ip?: string | null; example?: boolean }
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.09, 0.11);
  const M = 56;
  const size = 10.5;
  const lead = 15;
  let page = pdf.addPage([595, 842]);
  let y = 842 - M;
  const line = (t: string, f = font) => {
    if (y < M + lead) {
      page = pdf.addPage([595, 842]);
      y = 842 - M;
    }
    page.drawText(t, { x: M, y, size, font: f, color: ink });
    y -= lead;
  };
  if (c.example) {
    page.drawText("EXAMPLE ONLY - NOT FOR SIGNATURE", { x: M, y, size: 9, font: bold, color: rgb(0.55, 0.55, 0.6) });
    y -= lead * 1.5;
  }
  const lines = wrap(safe(c.body), font, size, 595 - 2 * M);
  lines.forEach((t, i) => line(t, i === 0 || /^\d+\.\s/.test(t) ? bold : font));
  if (c.example) {
    y -= lead;
    line("Signed: " + "____________________" + "     Date: " + "______________");
  }
  if (c.signed_at) {
    y -= lead;
    line("Signature record", bold);
    line(safe(`Signed electronically by ${c.signer_name ?? c.client_name}`));
    line(`on ${new Date(c.signed_at).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "long", timeStyle: "short" })} (UK time)`);
    if (c.signer_ip) line(`from IP address ${c.signer_ip}`);
    line("by typing their name and ticking 'I agree to this agreement' on the Apex-Leads signing page.");
  }
  return pdf.save();
}

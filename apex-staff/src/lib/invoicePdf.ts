import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { InvoiceRow } from "./staff/types";

export interface Company {
  name: string;
  address: string;
  vatNumber?: string | null;
}

export interface Payee {
  name: string;
  address: string | null;
  vatNumber: string | null;
  agreementDate: string | null;
}

export const invoiceNumber = (seq: number) => `SB-${String(seq).padStart(4, "0")}`;

export function companyFromEnv(): Company {
  return {
    name: process.env.COMPANY_NAME || "Apex Leads",
    address: process.env.COMPANY_ADDRESS || "",
    vatNumber: process.env.COMPANY_VAT || null,
  };
}

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" });

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

/** A UK self-billing invoice: issued by Apex Leads on behalf of the supplier. */
export async function buildInvoicePdf(inv: InvoiceRow, payee: Payee, company: Company): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.09, 0.11);
  const grey = rgb(0.4, 0.4, 0.45);
  const green = rgb(0.06, 0.6, 0.42);
  const M = 50;
  let y = 792;

  const text = (t: string, x: number, yy: number, size = 10, f = font, color = ink) =>
    page.drawText(t, { x, y: yy, size, font: f, color });
  const right = (t: string, xr: number, yy: number, size = 10, f = font, color = ink) =>
    page.drawText(t, { x: xr - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color });

  text("SELF-BILLING INVOICE", M, y, 20, bold, ink);
  right(invoiceNumber(inv.seq), 545, y + 2, 14, bold, green);
  y -= 18;
  text("Issued by the customer on behalf of the supplier under a self-billing agreement", M, y, 9, font, grey);
  y -= 34;

  // Supplier (left) and customer (right)
  const colR = 320;
  text("SUPPLIER", M, y, 8, bold, grey);
  text("CUSTOMER (ISSUER)", colR, y, 8, bold, grey);
  y -= 14;
  let yl = y;
  text(payee.name, M, yl, 11, bold);
  yl -= 14;
  if (payee.address) {
    for (const l of wrap(payee.address, font, 10, 240)) {
      text(l, M, yl);
      yl -= 13;
    }
  }
  if (payee.vatNumber) {
    text(`VAT no: ${payee.vatNumber}`, M, yl);
    yl -= 13;
  }
  let yr = y;
  text(company.name, colR, yr, 11, bold);
  yr -= 14;
  for (const l of wrap(company.address || "", font, 10, 225)) {
    if (!l) continue;
    text(l, colR, yr);
    yr -= 13;
  }
  if (company.vatNumber) {
    text(`VAT no: ${company.vatNumber}`, colR, yr);
    yr -= 13;
  }
  y = Math.min(yl, yr) - 18;

  // Meta
  const meta: [string, string][] = [
    ["Invoice number", invoiceNumber(inv.seq)],
    ["Invoice date", date(inv.created_at)],
    ["Period", inv.period_label],
  ];
  for (const [k, v] of meta) {
    text(k, M, y, 9, font, grey);
    text(v, M + 100, y, 10, bold);
    y -= 15;
  }
  y -= 14;

  // Lines
  page.drawRectangle({ x: M, y: y - 6, width: 495, height: 22, color: rgb(0.95, 0.96, 0.96) });
  text("Description", M + 8, y, 9, bold, grey);
  right("Amount", 537, y, 9, bold, grey);
  y -= 24;
  for (const line of inv.lines) {
    const rows = wrap(line.description, font, 10, 390);
    rows.forEach((r, i) => text(r, M + 8, y - i * 13));
    right(gbp(Number(line.amount)), 537, y);
    y -= rows.length * 13 + 8;
  }
  page.drawLine({ start: { x: M, y: y + 4 }, end: { x: 545, y: y + 4 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.82) });
  y -= 14;

  right("Subtotal", 450, y, 10, font, grey);
  right(gbp(Number(inv.subtotal)), 537, y);
  y -= 16;
  if (payee.vatNumber) {
    right("VAT (20%)", 450, y, 10, font, grey);
    right(gbp(Number(inv.vat)), 537, y);
    y -= 16;
  }
  right("Total due", 450, y, 12, bold);
  right(gbp(Number(inv.total)), 537, y, 12, bold, green);
  y -= 40;

  const note =
    `This is a self-billed invoice raised by ${company.name} on behalf of ${payee.name}` +
    (payee.agreementDate ? ` under the self-billing agreement dated ${date(payee.agreementDate)}` : " under a self-billing agreement") +
    `. The supplier agrees not to issue a separate invoice for these supplies and to notify ${company.name} if they cease to be VAT registered or their details change.`;
  for (const l of wrap(note, font, 9, 495)) {
    text(l, M, y, 9, font, grey);
    y -= 12;
  }

  return pdf.save();
}

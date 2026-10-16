import PDFDocument from 'pdfkit';
import type { QuoteTotals } from '@maison/shared';
import { formatMoney } from '@maison/shared';
import { getBusiness, getPublishedSite, getPublishedTheme } from './siteConfig.service';

/**
 * Branded server-side PDFs (quotations, invoices). Built-in PDF fonts are used for reliability; the brand
 * colour comes from the published theme. Currency is printed with an ISO code prefix because the core PDF
 * fonts cannot render every currency glyph (e.g. ₹).
 */
const money = (minor: number, currency: string) => `${currency} ${formatMoney(minor, currency).replace(/[^\d.,-]/g, '')}`;

async function brand() {
  const [site, theme, biz] = await Promise.all([getPublishedSite(), getPublishedTheme(), getBusiness()]);
  const accent = theme.colors.primary;
  return { site, biz, accent };
}

function header(doc: PDFKit.PDFDocument, b: Awaited<ReturnType<typeof brand>>, title: string, number: string) {
  doc.fillColor('#111111').font('Times-Roman').fontSize(22).text(b.site.brand.name.toUpperCase(), 50, 50, { characterSpacing: 3 });
  doc.font('Helvetica').fontSize(8).fillColor('#6E675D').text([b.biz.legalName || b.site.brand.name, b.site.company.addressLine, [b.site.company.city, b.site.company.country].filter(Boolean).join(', '), b.site.company.email, b.site.company.phone, b.biz.taxId ? `Tax ID: ${b.biz.taxId}` : ''].filter(Boolean).join('\n'), 50, 80, { width: 260 });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(b.accent).text(title, 350, 50, { width: 195, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#111111').text(number, 350, 72, { width: 195, align: 'right' });
  doc.moveTo(50, 150).lineTo(545, 150).strokeColor(b.accent).lineWidth(1).stroke();
  doc.y = 165;
}

function ensureSpace(doc: PDFKit.PDFDocument, h: number) {
  if (doc.y + h > doc.page.height - 70) doc.addPage();
}

function table(doc: PDFKit.PDFDocument, rows: [string, string, string, string][], accent: string) {
  const cols = [50, 330, 400, 470];
  const widths = [275, 65, 65, 75];
  ensureSpace(doc, 30);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(accent);
  ['ITEM', 'QTY', 'UNIT', 'AMOUNT'].forEach((h, i) => doc.text(h, cols[i], doc.y, { width: widths[i], align: i ? 'right' : 'left', continued: false, lineBreak: false }));
  doc.moveDown(1.2);
  doc.font('Helvetica').fontSize(9).fillColor('#111111');
  for (const r of rows) {
    const h = Math.max(doc.heightOfString(r[0], { width: widths[0] }), 12) + 6;
    ensureSpace(doc, h);
    const y = doc.y;
    r.forEach((c, i) => doc.text(c, cols[i], y, { width: widths[i], align: i ? 'right' : 'left' }));
    doc.y = y + h;
    doc.moveTo(50, doc.y - 3).lineTo(545, doc.y - 3).strokeColor('#E8DED0').lineWidth(0.5).stroke();
  }
}

function totalsBlock(doc: PDFKit.PDFDocument, lines: [string, string, boolean?][]) {
  ensureSpace(doc, lines.length * 16 + 10);
  doc.moveDown(0.5);
  for (const [label, value, bold] of lines) {
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor('#111111');
    doc.text(label, 330, y, { width: 135, align: 'right' });
    doc.text(value, 470, y, { width: 75, align: 'right' });
    doc.y = y + (bold ? 18 : 14);
  }
}

function paragraph(doc: PDFKit.PDFDocument, title: string, body: string) {
  if (!body) return;
  ensureSpace(doc, 60);
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111').text(title.toUpperCase(), 50, doc.y, { characterSpacing: 1 });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(8.5).fillColor('#3d3a36').text(body.replace(/\*\*/g, ''), 50, doc.y, { width: 495 });
}

function finish(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(7).fillColor('#8B8478').text(`Page ${i + 1} of ${range.count}`, 50, doc.page.height - 40, { width: 495, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}

export interface QuotationPdfInput {
  number: string;
  version: number;
  title: string;
  clientName: string;
  clientEmail: string;
  eventDate: string | null;
  venue: string;
  guestCount: number | null;
  validUntil: string | null;
  currency: string;
  intro: string;
  terms: string;
  lines: { id: string; name: string; description: string; quantityX100: number; unit: string; unitPriceMinor: number; optional: boolean; selected: boolean; discountBps: number }[];
  totals: QuoteTotals;
}

export async function quotationPdf(q: QuotationPdfInput) {
  const b = await brand();
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: `${q.number} ${q.title}`, Author: b.site.brand.name } });
  header(doc, b, 'PROPOSAL', `${q.number} · v${q.version}`);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111').text(q.title, 50, doc.y);
  doc.moveDown(0.4).font('Helvetica').fontSize(9).fillColor('#3d3a36');
  doc.text(`Prepared for ${q.clientName} (${q.clientEmail})`);
  doc.text([q.eventDate ? `Event date: ${q.eventDate}` : null, q.venue ? `Venue: ${q.venue}` : null, q.guestCount ? `Guests: ${q.guestCount}` : null].filter(Boolean).join('   ·   '));
  if (q.validUntil) doc.text(`Valid until ${q.validUntil}`);
  if (q.intro) {
    doc.moveDown(0.8).fontSize(9.5).fillColor('#111111').text(q.intro.replace(/\*\*/g, ''), { width: 495 });
  }
  doc.moveDown(1);
  const fmtQty = (x: number) => (x % 100 === 0 ? String(x / 100) : (x / 100).toFixed(2));
  const included = q.lines.filter((l) => !l.optional || l.selected);
  const optional = q.lines.filter((l) => l.optional && !l.selected);
  table(
    doc,
    included.map((l) => {
      const t = q.totals.lines.find((x) => x.id === l.id)!;
      return [`${l.name}${l.optional ? ' (selected option)' : ''}${l.description ? `\n${l.description}` : ''}${l.discountBps ? `\nIncludes ${l.discountBps / 100}% discount` : ''}`, `${fmtQty(l.quantityX100)}${l.unit ? ` ${l.unit}` : ''}`, money(l.unitPriceMinor, q.currency), money(t.netMinor, q.currency)];
    }),
    b.accent,
  );
  totalsBlock(doc, [
    ['Subtotal', money(q.totals.subtotalMinor, q.currency)],
    ...(q.totals.discountMinor ? ([['Discount', `-${money(q.totals.discountMinor, q.currency)}`]] as [string, string][]) : []),
    ...q.totals.taxes.map((t) => [`${t.name} (${t.rateBps / 100}%)`, money(t.amountMinor, q.currency)] as [string, string]),
    ...(q.totals.feesMinor ? ([['Fees', money(q.totals.feesMinor, q.currency)]] as [string, string][]) : []),
    ['Total', money(q.totals.totalMinor, q.currency), true],
  ]);
  if (optional.length) {
    doc.moveDown(1).font('Helvetica-Bold').fontSize(9).fillColor('#111111').text('OPTIONAL ENHANCEMENTS (NOT INCLUDED IN TOTAL)', 50, doc.y);
    doc.moveDown(0.4);
    table(doc, optional.map((l) => [`${l.name}${l.description ? `\n${l.description}` : ''}`, fmtQty(l.quantityX100), money(l.unitPriceMinor, q.currency), money(q.totals.lines.find((x) => x.id === l.id)!.netMinor, q.currency)]), b.accent);
  }
  paragraph(doc, 'Payment schedule', q.totals.milestones.map((m) => `• ${m.label} — ${(m.shareBps / 100).toFixed(m.shareBps % 100 ? 2 : 0)}% · ${money(m.amountMinor, q.currency)}`).join('\n'));
  paragraph(doc, 'Terms & conditions', q.terms);
  return finish(doc);
}

export interface InvoicePdfInput {
  number: string;
  issuedAt: Date;
  dueDate: string | null;
  status: string;
  currency: string;
  clientName: string;
  clientEmail: string;
  bookingRef: string;
  bookingTitle: string;
  eventDate: string | null;
  lines: { description: string; amountMinor: number }[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  notes: string;
}

export async function invoicePdf(inv: InvoicePdfInput) {
  const b = await brand();
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: inv.number, Author: b.site.brand.name } });
  header(doc, b, inv.status === 'PAID' ? 'INVOICE · PAID' : 'INVOICE', inv.number);
  doc.font('Helvetica').fontSize(9).fillColor('#3d3a36');
  doc.text(`Billed to: ${inv.clientName} (${inv.clientEmail})`);
  doc.text(`Event: ${inv.bookingTitle} · ${inv.bookingRef}${inv.eventDate ? ` · ${inv.eventDate}` : ''}`);
  doc.text(`Issued: ${inv.issuedAt.toISOString().slice(0, 10)}${inv.dueDate ? `   ·   Due: ${inv.dueDate}` : ''}`);
  doc.moveDown(1);
  table(doc, inv.lines.map((l) => [l.description, '', '', money(l.amountMinor, inv.currency)]), b.accent);
  totalsBlock(doc, [
    ['Subtotal', money(inv.subtotalMinor, inv.currency)],
    ...(inv.taxMinor ? ([['Tax', money(inv.taxMinor, inv.currency)]] as [string, string][]) : []),
    ['Total', money(inv.totalMinor, inv.currency), true],
    ['Paid', money(inv.paidMinor, inv.currency)],
    ['Amount due', money(Math.max(0, inv.totalMinor - inv.paidMinor), inv.currency), true],
  ]);
  paragraph(doc, 'Notes', inv.notes);
  paragraph(doc, 'Payment details', b.biz.invoice.bankDetails);
  paragraph(doc, '', b.biz.invoice.footer);
  return finish(doc);
}

import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

export async function makeReportPDF({ filePath, title, sections }) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const complete = pipeline(doc, createWriteStream(filePath, { flags: 'wx' }));
  doc.fontSize(10).text('HitLab | Executive Music Production');
  doc.moveDown().fontSize(20).text(title);
  doc.moveDown().fontSize(9).text('AI-assisted editorial draft. Artist decisions remain yours.');
  for (const section of sections) {
    doc.moveDown().fontSize(14).text(section.heading);
    doc.moveDown(0.4).fontSize(11).text(section.body);
  }
  doc.end();
  await complete;
}

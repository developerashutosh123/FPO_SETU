// 100 x 50 mm lot label with a GS1 Digital Link QR (https://<consumer site>/00/<SSCC>), made with pdf-lib and the qrcode matrix.
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const MM = 72 / 25.4;

export async function lotLabelPdf(input: { sscc: string; humanRef: string; commodity: string; variety?: string; grade?: string; netKg?: number; village: string; consumerUrl: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Label ${input.humanRef}`); doc.setProducer('FPO-SETU gateway');
  const page = doc.addPage([100 * MM, 50 * MM]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica), mono = await doc.embedFont(StandardFonts.Courier);
  const link = `${input.consumerUrl.replace(/\/$/, '')}/00/${input.sscc}`;
  const qr = QRCode.create(link, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, size = 36 * MM, cell = size / n, x0 = 100 * MM - size - 4 * MM, y0 = 50 * MM - size - 4 * MM;
  page.drawRectangle({ x: x0 - 1.5 * MM, y: y0 - 1.5 * MM, width: size + 3 * MM, height: size + 3 * MM, color: rgb(1, 1, 1) });
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.data[r * n + c]) page.drawRectangle({ x: x0 + c * cell, y: y0 + (n - 1 - r) * cell, width: cell + 0.05, height: cell + 0.05, color: rgb(0, 0, 0) });
  const L = 4 * MM;
  page.drawText(input.commodity + (input.variety ? ` · ${input.variety}` : ''), { x: L, y: 50 * MM - 8 * MM, size: 10, font: bold });
  page.drawText(`${input.village}${input.grade ? ` · Grade ${input.grade}` : ''}${input.netKg ? ` · ${input.netKg} kg` : ''}`, { x: L, y: 50 * MM - 13 * MM, size: 8, font: reg });
  page.drawText(input.humanRef, { x: L, y: 50 * MM - 20 * MM, size: 5.6, font: mono });
  page.drawText(`SSCC ${input.sscc}`, { x: L, y: 50 * MM - 24 * MM, size: 5.6, font: mono });
  page.drawText('Scan to see the lot journey', { x: L, y: 8 * MM, size: 6.5, font: reg });
  page.drawText('Academic prototype, RD61003, CRDIST, IIT Kharagpur', { x: L, y: 4.5 * MM, size: 4.6, font: reg, color: rgb(0.3, 0.3, 0.3) });
  return doc.save();
}

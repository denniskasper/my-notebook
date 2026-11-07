/**
 * Builds small PDFs for tests, so fixtures stay readable in the repo instead
 * of being opaque binaries. Text uses Helvetica with WinAnsiEncoding, which
 * covers German umlauts and ß.
 */

type PdfObject = string | Uint8Array;

/**
 * A text PDF: one entry per page, each page a list of lines. An empty string
 * leaves a blank line (a paragraph gap).
 */
export function textPdf(pages: string[][]): Uint8Array {
  const pageIds = pages.map((_, index) => 4 + index * 2);
  const objects: PdfObject[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  for (const [index, lines] of pages.entries()) {
    const contentId = 5 + index * 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    const body = lines
      .map((line, row) => `BT /F1 11 Tf 56 ${780 - row * 16} Td (${escape(line)}) Tj ET`)
      .join('\n');
    objects.push(stream(latin1(body)));
  }
  return assemble(objects);
}

/** A "scanned" PDF: each page only shows an image, there is no text layer. */
export function scannedPdf(pageCount = 1): Uint8Array {
  const pageIds = Array.from({ length: pageCount }, (_, index) => 4 + index * 2);
  const objects: PdfObject[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    stream(
      new Uint8Array([0x80, 0x40, 0xc0, 0x20]),
      '/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8',
    ),
  ];
  for (const id of pageIds) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 3 0 R >> >> /Contents ${id + 1} 0 R >>`,
    );
    objects.push(stream(latin1('q 483 0 0 730 56 56 cm /Im1 Do Q')));
  }
  return assemble(objects);
}

function escape(text: string): string {
  return text.replace(/[\\()]/g, (char) => `\\${char}`);
}

function latin1(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => {
    const code = char.charCodeAt(0);
    if (code > 0xff) throw new Error(`Not encodable in a test PDF: ${char}`);
    return code;
  });
}

function stream(data: Uint8Array, dictionary = ''): Uint8Array {
  return concat([
    latin1(`<< ${dictionary} /Length ${data.length} >>\nstream\n`),
    data,
    latin1('\nendstream'),
  ]);
}

function assemble(objects: PdfObject[]): Uint8Array {
  const header = latin1('%PDF-1.4\n');
  const parts: Uint8Array[] = [header];
  const offsets: number[] = [];
  let length = header.length;
  for (const [index, object] of objects.entries()) {
    offsets.push(length);
    const body = typeof object === 'string' ? latin1(object) : object;
    const part = concat([latin1(`${index + 1} 0 obj\n`), body, latin1('\nendobj\n')]);
    parts.push(part);
    length += part.length;
  }
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(length),
    '%%EOF',
  ].join('\n');
  parts.push(latin1(`${xref}\n`));
  return concat(parts);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

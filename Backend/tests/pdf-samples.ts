// Build a small text PDF without a library so parser tests stay independent of the extractor.
export function samplePdf(pageLines: string[][]): Buffer {
  const fontId = 3 + pageLines.length * 2;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageLines.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pageLines.length} >>`,
  ];
  for (const lines of pageLines) {
    const contentId = objects.length + 2;
    const stream = lines.length
      ? `BT\n/F1 18 Tf\n72 720 Td\n${lines.map((line, lineIndex) => {
        const escaped = line.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
        return `${lineIndex ? '0 -28 Td\n' : ''}(${escaped}) Tj\n`;
      }).join('')}ET\n`
      : '';
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

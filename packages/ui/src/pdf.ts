export function imagePdf(
  images: Array<{ bytes: Uint8Array; width: number; height: number }>,
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const offsets: number[] = [0];
  const write = (value: string | Uint8Array) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    size += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = size;
    write(`${id} 0 obj\n`);
    body();
    write("\nendobj\n");
  };
  write("%PDF-1.4\n%Solaistore receipt\n");
  object(1, () => write("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () =>
    write(
      `<< /Type /Pages /Count ${images.length} /Kids [${images.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`,
    ),
  );
  images.forEach((image, i) => {
    const page = 3 + i * 3,
      img = page + 1,
      content = page + 2;
    object(page, () =>
      write(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Receipt ${img} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
    object(img, () => {
      write(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
      );
      write(image.bytes);
      write("\nendstream");
    });
    const stream = "q\n595 0 0 842 0 0 cm\n/Receipt Do\nQ\n";
    object(content, () =>
      write(
        `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`,
      ),
    );
  });
  const start = size;
  write(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i++)
    write(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  write(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`,
  );
  const result = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}

export function sniffDocument(filename: string, bytes: Uint8Array): "pdf" | "docx" | "xlsx" | "xls" | "csv" | "jpeg" | "png" | "heic" | null {
  const name = filename.toLowerCase();
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = Buffer.from(bytes.subarray(8, 12)).toString("ascii").toLowerCase();
    if (brand.startsWith("hei") || brand === "mif1") return "heic";
  }
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return "xls";
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    if (name.endsWith(".xlsx")) return "xlsx";
    if (name.endsWith(".docx")) return "docx";
    return name.endsWith(".xls") ? "xls" : "xlsx";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if ((name.endsWith(".csv") || name.endsWith(".txt")) && !bytes.includes(0)) return "csv";
  return null;
}

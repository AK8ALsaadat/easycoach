import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { unzipSync, Unzip, UnzipInflate } from "fflate";

import type { ImportFile } from "./import-preview";
export async function readImportFile(
  bytes: Uint8Array,
  filename: string,
): Promise<ImportFile> {
  if (bytes.byteLength > 5 * 1024 * 1024)
    throw new Error("الملف أكبر من 5 ميجابايت");
  let rows: string[][];
  if (filename.toLowerCase().endsWith(".csv")) {
    rows = parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes), {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      delimiter: [",", ";", "\t"],
      max_record_size: 20000,
    }) as string[][];
  } else if (filename.toLowerCase().endsWith(".xlsx")) {
    let total = 0,
      count = 0;
    unzipSync(bytes, {
      filter(entry) {
        total += entry.originalSize;
        count++;
        if (total > 20 * 1024 * 1024 || count > 1000)
          throw new Error("ملف Excel المضغوط يتجاوز الحد الآمن");
        return false;
      },
    });
    // Verify actual expanded bytes too; do not trust ZIP directory size fields.
    let expanded = 0;
    const verifier = new Unzip((file) => {
      file.ondata = (error, chunk) => {
        if (error) throw error;
        expanded += chunk.byteLength;
        if (expanded > 20 * 1024 * 1024)
          throw new Error("ملف Excel يتجاوز الحد بعد فك الضغط");
      };
      file.start();
    });
    verifier.register(UnzipInflate);
    for (let offset = 0; offset < bytes.length; offset += 1024)
      verifier.push(
        bytes.subarray(offset, offset + 1024),
        offset + 1024 >= bytes.length,
      );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("الملف لا يحتوي ورقة بيانات");
    if (sheet.rowCount > 2001 || sheet.columnCount > 50)
      throw new Error("الحد 2000 صف و50 عمودًا");
    rows = [];
    sheet.eachRow((row) => {
      const values: string[] = [];
      for (let i = 1; i <= sheet.columnCount; i++) {
        const cell = row.getCell(i);
        if (cell.type === ExcelJS.ValueType.Formula)
          throw new Error("لا نقبل صيغ Excel. استخدم القيم فقط");
        values.push(cell.text);
      }
      rows.push(values);
    });
  } else throw new Error("استخدم CSV بترميز UTF-8 أو Excel بصيغة xlsx");
  if (rows.length < 2 || rows.length > 2001 || rows.some((r) => r.length > 50))
    throw new Error("الملف يحتاج صف عناوين و1–2000 صف بيانات، حتى 50 عمودًا");
  return {
    headers: rows[0].map((v, i) => v.trim() || `عمود ${i + 1}`),
    rows: rows.slice(1).filter((row) => row.some((v) => v.trim())),
  };
}

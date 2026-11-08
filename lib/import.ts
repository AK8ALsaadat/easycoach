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
    const sheets = workbook.worksheets
      .map((sheet) => {
        if (sheet.rowCount > 10001 || sheet.columnCount > 100)
          throw new Error("الحد 10000 صف و100 عمود لكل ملف");
        const sheetRows: string[][] = [];
        const rowNumbers: number[] = [];
        sheet.eachRow((row, rowNumber) => {
          const values: string[] = [];
          for (let i = 1; i <= sheet.columnCount; i++) {
            const cell = row.getCell(i);
            if (cell.type === ExcelJS.ValueType.Formula)
              throw new Error("لا نقبل صيغ Excel. استخدم القيم فقط");
            values.push(
              cell.value instanceof Date
                ? cell.value.toISOString().slice(0, 10)
                : cell.text,
            );
          }
          sheetRows.push(values);
          rowNumbers.push(rowNumber);
        });
        return {
          name: sheet.name,
          headers: (sheetRows[0] ?? []).map(
            (v, i) => v.trim() || "Column " + (i + 1),
          ),
          rows: sheetRows.slice(1),
          rowNumbers: rowNumbers.slice(1),
        };
      })
      .filter((sheet) => sheet.rows.length);
    if (
      !sheets.length ||
      sheets.reduce((n, sheet) => n + sheet.rows.length, 0) > 10000
    )
      throw new Error("الملف يحتاج 1–10000 صف بيانات");
    return { ...sheets[0], sheets };
  } else throw new Error("استخدم CSV بترميز UTF-8 أو Excel بصيغة xlsx");
  if (
    rows.length < 2 ||
    rows.length > 10001 ||
    rows.some((r) => r.length > 100)
  )
    throw new Error("الملف يحتاج صف عناوين و1–10000 صف بيانات، حتى 100 عمودًا");
  return {
    headers: rows[0].map((v, i) => v.trim() || `عمود ${i + 1}`),
    rows: rows.slice(1).filter((row) => row.some((v) => v.trim())),
  };
}

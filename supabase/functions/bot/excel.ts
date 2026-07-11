// iMed HR bot — rangli Excel (.xlsx) hisobotlar (exceljs).
// Dynamic import: exceljs faqat eksport bosilganda yuklanadi (cold-start yengil).

const NAVY = "FF0E2A47", NAVY2 = "FF1C3E68", HEADBLUE = "FF1E79C4";
const ORANGE_BG = "FFFCEBD6", ORANGE_FG = "FFD98324";
const OKBG = "FFE4F5EA", OKFG = "FF2E9E5B", WARNBG = "FFFDF0DE", WARNFG = "FFE6902A";
const BADBG = "FFFBE7EB", BADFG = "FFD5556A", AUTOBG = "FFE7F0FB", AUTOFG = "FF2E86D6";
const TOTBG = "FFEAF3FC", ZEBRA = "FFF7FAFD";

// deno-lint-ignore no-explicit-any
function thin(): any {
  const s = { style: "thin", color: { argb: "FFE5EBF2" } };
  return { top: s, left: s, bottom: s, right: s };
}
// deno-lint-ignore no-explicit-any
function banner(ws: any, range: string, text: string) {
  ws.mergeCells(range);
  const c = ws.getCell(range.split(":")[0]);
  c.value = text;
  c.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  c.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 28;
}
// deno-lint-ignore no-explicit-any
function headerRow(row: any, bg: string) {
  row.height = 22;
  // deno-lint-ignore no-explicit-any
  row.eachCell((c: any) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thin();
  });
}

export interface MaoshXRow { ism: string; rol: string; jami_soat: number; baza: number; bonus: number; yakuniy: number; }

export async function maoshXlsx(oy: string, rows: MaoshXRow[]): Promise<Uint8Array> {
  const ExcelJS = (await import("npm:exceljs@4.4.0")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Maosh");
  ws.columns = [{ width: 28 }, { width: 15 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 18 }];
  banner(ws, "A1:F1", `OYLIK MAOSH — ${oy}`);
  headerRow(ws.addRow(["Xodim", "Rol", "Ish soati", "Baza (so'm)", "Bonus (so'm)", "Umumiy maosh"]), NAVY2);

  rows.forEach((r, i) => {
    const row = ws.addRow([r.ism, r.rol, Number(r.jami_soat), Number(r.baza), Number(r.bonus) || 0, Number(r.yakuniy)]);
    row.height = 20;
    // deno-lint-ignore no-explicit-any
    row.eachCell((c: any) => { c.border = thin(); if (i % 2) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } }; });
    row.getCell(1).font = { bold: true, color: { argb: NAVY } };
    [4, 5, 6].forEach((n) => { row.getCell(n).numFmt = "#,##0"; row.getCell(n).alignment = { horizontal: "right" }; });
    row.getCell(3).alignment = { horizontal: "center" };
    row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ORANGE_BG } };
    row.getCell(6).font = { bold: true, color: { argb: ORANGE_FG } };
  });

  const sum = (k: keyof MaoshXRow) => rows.reduce((s, r) => s + Number(r[k] as number), 0);
  const tot = ws.addRow(["JAMI", "", sum("jami_soat"), sum("baza"), sum("bonus"), sum("yakuniy")]);
  tot.height = 22;
  // deno-lint-ignore no-explicit-any
  tot.eachCell((c: any) => { c.font = { bold: true, color: { argb: NAVY } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTBG } }; c.border = thin(); });
  [4, 5, 6].forEach((n) => { tot.getCell(n).numFmt = "#,##0"; tot.getCell(n).alignment = { horizontal: "right" }; });

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export interface DavomatXRow { ism: string; keldi: string; ketdi: string; soat: number | null; holat: string | null; }

export async function davomatXlsx(sana: string, rows: DavomatXRow[]): Promise<Uint8Array> {
  const ExcelJS = (await import("npm:exceljs@4.4.0")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Davomat");
  ws.columns = [{ width: 28 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 16 }];
  banner(ws, "A1:E1", `BUGUNGI DAVOMAT — ${sana}`);
  headerRow(ws.addRow(["Xodim", "Keldi", "Ketdi", "Soat", "Holat"]), HEADBLUE);

  const holatRang: Record<string, [string, string]> = {
    "Vaqtida": [OKBG, OKFG], "Kech qoldi": [WARNBG, WARNFG], "Avtomatik": [AUTOBG, AUTOFG],
  };
  rows.forEach((r, i) => {
    const holat = r.holat ?? "Kelmadi";
    const row = ws.addRow([r.ism, r.keldi, r.ketdi, r.soat === null ? "—" : Number(r.soat), holat]);
    row.height = 20;
    // deno-lint-ignore no-explicit-any
    row.eachCell((c: any) => { c.border = thin(); if (i % 2) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } }; });
    row.getCell(1).font = { bold: true, color: { argb: NAVY } };
    [2, 3, 4].forEach((n) => { row.getCell(n).alignment = { horizontal: "center" }; });
    const [bg, fg] = holatRang[holat] ?? [BADBG, BADFG];
    row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    row.getCell(5).font = { bold: true, color: { argb: fg } };
    row.getCell(5).alignment = { horizontal: "center" };
  });

  const kelgan = rows.filter((r) => r.holat && r.soat !== null).length;
  const tot = ws.addRow([`JAMI: ${kelgan}/${rows.length} keldi`, "", "", "", ""]);
  ws.mergeCells(`A${tot.number}:E${tot.number}`);
  tot.getCell(1).font = { bold: true, color: { argb: NAVY } };
  tot.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTBG } };
  tot.height = 22;

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

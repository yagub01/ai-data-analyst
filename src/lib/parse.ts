import * as XLSX from "xlsx";
import type { Cell, ColumnType, Dataset, Row, SheetSummary } from "./types";

type RawCell = string | number | boolean | Date | null | undefined;

const TOTAL_ROW = /^(grand\s+)?(sub\s*)?totals?$/i;
const ID_NAME = /(^|[\s_-])(id|code|zip|postal|phone|sku|number|no\.?)$/i;

export interface ParsedWorkbook {
  fileName: string;
  sheets: { name: string; matrix: RawCell[][] }[];
}

export async function readWorkbook(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { cellDates: true, dense: true });
  const sheets = wb.SheetNames.map((name) => ({
    name,
    matrix: XLSX.utils.sheet_to_json<RawCell[]>(wb.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
      UTC: true, // dates come back as UTC wall-clock, matching the engine
    }),
  })).filter((s) => s.matrix.length > 0);
  return { fileName: file.name, sheets };
}

export function summarizeSheets(wb: ParsedWorkbook): SheetSummary[] {
  return wb.sheets.map((s) => ({
    name: s.name,
    rows: Math.max(0, s.matrix.length - 1),
    columns: Math.max(0, ...s.matrix.slice(0, 20).map((r) => r.length)),
  }));
}

/** The sheet with the most cells is usually the data; summary tabs are small. */
export function pickDefaultSheet(wb: ParsedWorkbook): string {
  const sizes = summarizeSheets(wb);
  return sizes.reduce((a, b) => (b.rows * b.columns > a.rows * a.columns ? b : a)).name;
}

export function buildDataset(wb: ParsedWorkbook, sheetName: string): Dataset {
  const sheet = wb.sheets.find((s) => s.name === sheetName) ?? wb.sheets[0];
  if (!sheet) throw new Error("The file has no readable sheets.");

  const headerIdx = findHeaderRow(sheet.matrix);
  const width = sheet.matrix.reduce((w, r) => Math.max(w, r.length), 0);
  const headers = makeHeaders(sheet.matrix[headerIdx] ?? [], width);
  let body = sheet.matrix.slice(headerIdx + 1).filter((r) => r.some((c) => !isBlank(c)));

  // Excel exports often end with "Total" rows that would double-count sums.
  const before = body.length;
  body = body.filter((r) => {
    const first = r.find((c) => !isBlank(c));
    return !(typeof first === "string" && TOTAL_ROW.test(first.trim()));
  });
  const droppedTotalRows = before - body.length;

  const columns: { name: string; type: ColumnType }[] = [];
  const converted: Cell[][] = body.map(() => []);

  headers.forEach((name, ci) => {
    const raw = body.map((r) => r[ci]);
    if (raw.every(isBlank)) return; // empty column
    const type = inferType(name, raw);
    const values = raw.map((v) => convert(v, type));
    const colIdx = columns.length;
    columns.push({ name, type });
    values.forEach((v, ri) => (converted[ri][colIdx] = v));
  });

  const rows: Row[] = converted.map((vals) => {
    const row: Row = {};
    columns.forEach((c, i) => (row[c.name] = vals[i] ?? null));
    return row;
  });

  return {
    fileName: wb.fileName,
    sheetName: sheet.name,
    sheets: summarizeSheets(wb),
    rows,
    columns,
    droppedTotalRows,
  };
}

function isBlank(v: RawCell): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** Title rows above a table have few cells; the header is the first wide, mostly-text row. */
function findHeaderRow(matrix: RawCell[][]): number {
  const scan = matrix.slice(0, 15);
  const widest = Math.max(...scan.map((r) => r.filter((c) => !isBlank(c)).length));
  for (let i = 0; i < scan.length; i++) {
    const filled = scan[i].filter((c) => !isBlank(c));
    const texty = filled.filter((c) => typeof c === "string").length;
    if (filled.length >= Math.max(2, widest * 0.6) && texty >= filled.length * 0.7) return i;
  }
  return 0;
}

function makeHeaders(row: RawCell[], width: number): string[] {
  const seen = new Map<string, number>();
  return Array.from({ length: width }, (_, i) => {
    const v = row[i];
    let name = isBlank(v) ? `Column ${i + 1}` : String(v instanceof Date ? v.toISOString().slice(0, 10) : v).trim();
    name = name.replace(/\s+/g, " ");
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n > 1 ? `${name} (${n})` : name;
  });
}

const NUMERIC = /^[\s$€£¥₹+-]*\(?-?[\d,]*\.?\d+\)?\s*%?\s*$/;

function parseNumber(v: RawCell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !NUMERIC.test(v)) return null;
  const negative = /\(.*\)|-/.test(v);
  const pct = v.includes("%");
  const n = Number(v.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return (negative ? -n : n) / (pct ? 100 : 1);
}

// The engine buckets with UTC getters, so store wall-clock dates as if they
// were UTC. Otherwise a local-midnight date east of Greenwich lands on the
// previous day (and sometimes the previous month).
function wallClockAsUtc(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
}

function parseDate(v: RawCell): number | null {
  // Cell dates are already UTC wall-clock (sheet_to_json with UTC: true).
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v !== "string") return null;
  const s = v.trim();
  // Require a date-looking shape so "North" or "12" are never dates.
  if (!/^\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?|^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|^[A-Za-z]{3,9}[\s-]\d{1,2},?\s\d{4}|^\d{1,2}\s[A-Za-z]{3,9}\s\d{4}|^[A-Za-z]{3,9}[\s-]\d{4}$/.test(s))
    return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  // Date-only ISO strings already parse as UTC; everything else parses as local time.
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? t : wallClockAsUtc(new Date(t));
}

function inferType(name: string, raw: RawCell[]): ColumnType {
  const vals = raw.filter((v) => !isBlank(v));
  const n = vals.length;
  const share = (pred: (v: RawCell) => boolean) => vals.filter(pred).length / n;

  if (share((v) => v instanceof Date) >= 0.8 || share((v) => parseDate(v) !== null) >= 0.8) return "date";
  if (share((v) => typeof v === "boolean" || /^(true|false|yes|no)$/i.test(String(v))) >= 0.95) return "boolean";

  if (share((v) => parseNumber(v) !== null) >= 0.9) {
    const nums = vals.map(parseNumber).filter((x): x is number => x !== null);
    const distinct = new Set(nums).size;
    if (ID_NAME.test(name) && nums.every(Number.isInteger) && distinct > n * 0.5) return "id";
    if (/^(year|yr|fiscal year|fy)$/i.test(name) && nums.every((x) => Number.isInteger(x) && x > 1900 && x < 2200))
      return "category";
    return "number";
  }

  const strs = vals.map((v) => String(v).trim());
  const distinct = new Set(strs).size;
  if (ID_NAME.test(name) && distinct > n * 0.5) return "id";
  const avgLen = strs.reduce((a, s) => a + s.length, 0) / n;
  if (distinct <= Math.max(60, n * 0.2) && avgLen < 60) return "category";
  return "text";
}

function convert(v: RawCell, type: ColumnType): Cell {
  if (isBlank(v)) return null;
  switch (type) {
    case "number":
      return parseNumber(v);
    case "date":
      return parseDate(v);
    case "boolean":
      return typeof v === "boolean" ? v : /^(true|yes)$/i.test(String(v));
    default:
      return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
  }
}

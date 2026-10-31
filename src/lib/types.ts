// Cell values after parsing. Date columns hold epoch milliseconds so the
// engine can bucket and compare them cheaply.
export type Cell = number | string | boolean | null;
export type Row = Record<string, Cell>;

export type ColumnType = "number" | "date" | "category" | "text" | "boolean" | "id";

export interface ColumnProfile {
  name: string;
  type: ColumnType;
  nonNull: number;
  missingPct: number;
  distinct: number;
  samples: string[];
  // number columns
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  sum?: number;
  allIntegers?: boolean;
  negatives?: number;
  // date columns (ISO strings)
  dateMin?: string;
  dateMax?: string;
  // category / boolean columns
  topValues?: { value: string; count: number }[];
}

export interface SheetSummary {
  name: string;
  rows: number;
  columns: number;
}

export interface Dataset {
  fileName: string;
  sheetName: string;
  sheets: SheetSummary[];
  rows: Row[];
  columns: { name: string; type: ColumnType }[];
  droppedTotalRows: number;
}

export interface DatasetProfile {
  fileName: string;
  sheetName: string;
  otherSheets: SheetSummary[];
  rowCount: number;
  duplicateRows: number;
  droppedTotalRows: number;
  columns: ColumnProfile[];
  sampleRows: Record<string, string>[];
}

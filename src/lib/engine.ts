import type {
  ChartT,
  DashboardSpecT,
  KpiT,
  MeasureT,
  MetricDefT,
  QueryInputT,
  TimeGrainT,
} from "./schema";
import type { ColumnType, Dataset, Row } from "./types";
import { round } from "./format";

// Every number on the dashboard is computed here from the full dataset.
// Claude only decides *what* to compute.

const DAY = 86_400_000;
const NUMERIC_AGGS = new Set(["sum", "avg", "min", "max", "median"]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function aggregate(rows: Row[], m: MeasureT): number | null {
  if (m.agg === "count") {
    return m.column ? rows.filter((r) => r[m.column!] !== null).length : rows.length;
  }
  if (!m.column) return null;
  const col = m.column;
  if (m.agg === "count_distinct") {
    return new Set(rows.map((r) => r[col]).filter((v) => v !== null)).size;
  }
  const nums: number[] = [];
  for (const r of rows) {
    const v = r[col];
    if (typeof v === "number") nums.push(v);
  }
  if (!nums.length) return null;
  switch (m.agg) {
    case "sum":
      return nums.reduce((a, b) => a + b, 0);
    case "avg":
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min":
      return nums.reduce((a, b) => Math.min(a, b));
    case "max":
      return nums.reduce((a, b) => Math.max(a, b));
    case "median": {
      const s = nums.sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }
  }
  return null;
}

export function metricValue(rows: Row[], def: MetricDefT): number | null {
  const num = aggregate(rows, def.measure);
  if (!def.divideBy || num === null) return num;
  const den = aggregate(rows, def.divideBy);
  return den ? num / den : null;
}

/** Additive metrics can be summed into an "Other" bucket; averages and ratios cannot. */
function isAdditive(def: MetricDefT): boolean {
  return !def.divideBy && (def.measure.agg === "sum" || def.measure.agg === "count");
}

// ---------- time buckets ----------

export function bucketStart(ms: number, grain: TimeGrainT): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (grain) {
    case "day":
      return Date.UTC(y, m, d.getUTCDate());
    case "week": {
      const day = (d.getUTCDay() + 6) % 7; // Monday = 0
      return Date.UTC(y, m, d.getUTCDate() - day);
    }
    case "month":
      return Date.UTC(y, m, 1);
    case "quarter":
      return Date.UTC(y, m - (m % 3), 1);
    case "year":
      return Date.UTC(y, 0, 1);
  }
}

export function bucketEnd(start: number, grain: TimeGrainT): number {
  const d = new Date(start);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (grain) {
    case "day":
      return start + DAY;
    case "week":
      return start + 7 * DAY;
    case "month":
      return Date.UTC(y, m + 1, 1);
    case "quarter":
      return Date.UTC(y, m + 3, 1);
    case "year":
      return Date.UTC(y + 1, 0, 1);
  }
}

export function bucketLabel(start: number, grain: TimeGrainT): string {
  const d = new Date(start);
  const y = d.getUTCFullYear();
  switch (grain) {
    case "day":
    case "week":
      return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${y}`;
    case "month":
      return `${MONTHS[d.getUTCMonth()]} ${y}`;
    case "quarter":
      return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${y}`;
    case "year":
      return String(y);
  }
}

export function autoGrain(minMs: number, maxMs: number): TimeGrainT {
  const days = (maxMs - minMs) / DAY;
  if (days > 365 * 4) return "quarter";
  if (days >= 120) return "month";
  if (days >= 21) return "week";
  return "day";
}

export function dateExtent(rows: Row[], col: string): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rows) {
    const v = r[col];
    if (typeof v === "number") {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return lo === Infinity ? null : [lo, hi];
}

export interface TimeSeries {
  grain: TimeGrainT;
  buckets: { start: number; label: string; rows: Row[] }[];
  /** Fraction of the last bucket covered by data (1 = complete). */
  lastCoverage: number;
}

/** Groups rows into consecutive periods, filling gaps so trends are not distorted. */
export function timeSeries(rows: Row[], col: string, grain?: TimeGrainT): TimeSeries | null {
  const ext = dateExtent(rows, col);
  if (!ext) return null;
  const g = grain ?? autoGrain(ext[0], ext[1]);
  const map = new Map<number, Row[]>();
  for (const r of rows) {
    const v = r[col];
    if (typeof v !== "number") continue;
    const k = bucketStart(v, g);
    let list = map.get(k);
    if (!list) map.set(k, (list = []));
    list.push(r);
  }
  const buckets: TimeSeries["buckets"] = [];
  for (let s = bucketStart(ext[0], g); s <= ext[1] && buckets.length < 5000; s = bucketEnd(s, g)) {
    buckets.push({ start: s, label: bucketLabel(s, g), rows: map.get(s) ?? [] });
  }
  const last = buckets[buckets.length - 1];
  const lastCoverage = Math.min(1, (ext[1] + DAY - last.start) / (bucketEnd(last.start, g) - last.start));
  return { grain: g, buckets, lastCoverage };
}

// ---------- filters ----------

export interface Filters {
  values: Record<string, string[]>;
  dateFrom: number | null;
  dateTo: number | null;
}

export const emptyFilters: Filters = { values: {}, dateFrom: null, dateTo: null };

export function applyFilters(rows: Row[], f: Filters, timeColumn: string | null): Row[] {
  const active = Object.entries(f.values).filter(([, v]) => v.length);
  if (!active.length && (!timeColumn || (f.dateFrom === null && f.dateTo === null))) return rows;
  return rows.filter((r) => {
    for (const [col, vals] of active) {
      if (!vals.includes(String(r[col] ?? "(blank)"))) return false;
    }
    if (timeColumn && (f.dateFrom !== null || f.dateTo !== null)) {
      const t = r[timeColumn];
      if (typeof t !== "number") return false;
      if (f.dateFrom !== null && t < f.dateFrom) return false;
      if (f.dateTo !== null && t >= f.dateTo + DAY) return false;
    }
    return true;
  });
}

// ---------- KPIs ----------

export interface KpiResult {
  value: number | null;
  change: number | null;
  compareLabel: string | null;
  spark: number[];
}

export function computeKpi(rows: Row[], kpi: KpiT, timeColumn: string | null): KpiResult {
  const value = metricValue(rows, kpi);
  if (!timeColumn) return { value, change: null, compareLabel: null, spark: [] };
  const ts = timeSeries(rows, timeColumn);
  if (!ts || ts.buckets.length < 2) return { value, change: null, compareLabel: null, spark: [] };

  // A half-finished last month would look like a collapse, so compare complete periods.
  let i = ts.buckets.length - 1;
  if (ts.lastCoverage < 0.8 && ts.buckets.length >= 3) i--;
  const cur = metricValue(ts.buckets[i].rows, kpi);
  const prev = metricValue(ts.buckets[i - 1].rows, kpi);
  const change = cur !== null && prev ? (cur - prev) / Math.abs(prev) : null;
  const spark = ts.buckets.slice(-24).map((b) => metricValue(b.rows, kpi) ?? 0);
  return {
    value,
    change,
    compareLabel: `${ts.buckets[i].label} vs ${ts.buckets[i - 1].label}`,
    spark,
  };
}

// ---------- charts ----------

export interface SeriesDef {
  key: string;
  label: string;
  format: MetricDefT["format"];
}

export type ChartData =
  | { kind: "series"; data: Record<string, string | number | null>[]; series: SeriesDef[]; xIsTime: boolean }
  | { kind: "scatter"; points: { x: number; y: number; group: string }[]; groups: string[]; xLabel: string; yLabel: string }
  | { kind: "table"; columns: { key: string; label: string; format: MetricDefT["format"] | null }[]; rows: Record<string, string | number | null>[] }
  | { kind: "empty"; reason: string };

const OTHER = "Other";

function groupBy(rows: Row[], col: string): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r[col] === null ? "(blank)" : String(r[col]);
    let list = m.get(k);
    if (!list) m.set(k, (list = []));
    list.push(r);
  }
  return m;
}

/** Keeps the top N groups by the first metric and folds the rest into "Other" when that is meaningful. */
function topGroups(groups: Map<string, Row[]>, def: MetricDefT, limit: number): { name: string; rows: Row[] }[] {
  const ranked = [...groups.entries()]
    .map(([name, rows]) => ({ name, rows, v: metricValue(rows, def) ?? -Infinity }))
    .sort((a, b) => b.v - a.v);
  if (ranked.length <= limit) return ranked;
  const head = ranked.slice(0, limit);
  if (!isAdditive(def)) return head;
  return [...head, { name: OTHER, rows: ranked.slice(limit).flatMap((g) => g.rows), v: 0 }];
}

export function computeChart(ds: Dataset, rows: Row[], chart: ChartT): ChartData {
  const types = new Map(ds.columns.map((c) => [c.name, c.type]));
  if (!rows.length) return { kind: "empty", reason: "No rows match the current filters." };
  const metrics = chart.metrics.slice(0, 3);
  if (!metrics.length) return { kind: "empty", reason: "This chart has no metric." };

  if (chart.type === "scatter") {
    const yCol = metrics[0].measure.column;
    if (!chart.x || !yCol) return { kind: "empty", reason: "Scatter needs two numeric columns." };
    const pts: { x: number; y: number; group: string }[] = [];
    for (const r of rows) {
      const x = r[chart.x];
      const y = r[yCol];
      if (typeof x === "number" && typeof y === "number")
        pts.push({ x, y, group: chart.groupBy ? String(r[chart.groupBy] ?? "(blank)") : "All" });
    }
    // Even sampling keeps big files responsive.
    const step = Math.max(1, Math.ceil(pts.length / 1500));
    const points = pts.filter((_, i) => i % step === 0);
    // Overlapping points only stay distinguishable with 3 colors; fold the rest.
    const counts = new Map<string, number>();
    points.forEach((p) => counts.set(p.group, (counts.get(p.group) ?? 0) + 1));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
    points.forEach((p) => {
      if (!top.includes(p.group)) p.group = OTHER;
    });
    const groups = counts.size > 3 ? [...top, OTHER] : top;
    return { kind: "scatter", points, groups, xLabel: chart.x, yLabel: metrics[0].label };
  }

  if (!chart.x) {
    // No dimension: a single row of totals.
    return {
      kind: "table",
      columns: metrics.map((m, i) => ({ key: `m${i}`, label: m.label, format: m.format })),
      rows: [Object.fromEntries(metrics.map((m, i) => [`m${i}`, metricValue(rows, m)]))],
    };
  }

  const xIsTime = types.get(chart.x) === "date";
  const series: SeriesDef[] = metrics.map((m, i) => ({ key: `m${i}`, label: m.label, format: m.format }));

  // Build x buckets.
  let buckets: { name: string; rows: Row[]; order: number }[];
  if (xIsTime) {
    const ts = timeSeries(rows, chart.x, chart.timeGrain ?? undefined);
    if (!ts) return { kind: "empty", reason: "No dates in range." };
    buckets = ts.buckets.map((b) => ({ name: b.label, rows: b.rows, order: b.start }));
  } else {
    const defaultLimit = chart.type === "pie" ? 6 : chart.type === "table" ? 25 : 12;
    const limit = Math.max(1, Math.min(chart.limit ?? defaultLimit, 50));
    buckets = topGroups(groupBy(rows, chart.x), metrics[0], limit).map((g, i) => ({ ...g, order: i }));
  }

  if (chart.type === "table") {
    const data = buckets.map((b) => ({
      x: b.name,
      ...Object.fromEntries(metrics.map((m, i) => [`m${i}`, metricValue(b.rows, m)])),
    }));
    sortRows(data, chart.sort, xIsTime);
    return {
      kind: "table",
      columns: [{ key: "x", label: chart.x, format: null }, ...series.map((s) => ({ ...s }))],
      rows: data,
    };
  }

  // Split the first metric into one series per group.
  if (chart.groupBy && chart.groupBy !== chart.x && chart.type !== "pie") {
    const top = topGroups(groupBy(rows, chart.groupBy), metrics[0], 6).map((g) => g.name);
    const keyFor = (r: Row) => {
      const g = r[chart.groupBy!] === null ? "(blank)" : String(r[chart.groupBy!]);
      return top.includes(g) ? g : OTHER;
    };
    const seriesNames = top.slice();
    const data = buckets.map((b) => {
      const row: Record<string, string | number | null> = { x: b.name };
      const byGroup = new Map<string, Row[]>();
      b.rows.forEach((r) => {
        const k = keyFor(r);
        let list = byGroup.get(k);
        if (!list) byGroup.set(k, (list = []));
        list.push(r);
      });
      seriesNames.forEach((g, i) => {
        const gr = byGroup.get(g);
        row[`s${i}`] = gr ? metricValue(gr, metrics[0]) : xIsTime && isAdditive(metrics[0]) ? 0 : null;
      });
      return row;
    });
    if (!xIsTime) sortRows(data, chart.sort === "x_asc" ? "x_asc" : "none", false);
    return {
      kind: "series",
      data,
      series: seriesNames.map((g, i) => ({ key: `s${i}`, label: g, format: metrics[0].format })),
      xIsTime,
    };
  }

  const data = buckets.map((b) => ({
    x: b.name,
    ...Object.fromEntries(
      metrics.map((m, i) => [`m${i}`, b.rows.length ? metricValue(b.rows, m) : isAdditive(m) ? 0 : null]),
    ),
  }));
  if (!xIsTime) sortRows(data, chart.sort, false);
  return { kind: "series", data, series: chart.type === "pie" ? series.slice(0, 1) : series, xIsTime };
}

function sortRows(
  data: Record<string, string | number | null>[],
  sort: ChartT["sort"] | "none",
  xIsTime: boolean,
) {
  if (sort === "none" || xIsTime) return;
  const otherLast = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    Number(a.x === OTHER) - Number(b.x === OTHER);
  if (sort === "x_asc") {
    const numeric = data.every((d) => d.x === OTHER || !Number.isNaN(Number(d.x)));
    data.sort((a, b) =>
      otherLast(a, b) ||
      (numeric ? Number(a.x) - Number(b.x) : String(a.x).localeCompare(String(b.x))),
    );
    return;
  }
  const dir = sort === "value_asc" ? 1 : -1;
  data.sort((a, b) => otherLast(a, b) || dir * (Number(a.m0 ?? 0) - Number(b.m0 ?? 0)));
}

// ---------- ad-hoc queries (used by the chat) ----------

export function runQuery(ds: Dataset, q: QueryInputT, timeColumn: string | null): {
  rows: Record<string, string | number | null>[];
  totalGroups: number;
  note?: string;
} {
  const types = new Map(ds.columns.map((c) => [c.name, c.type]));
  let rows = ds.rows;
  for (const f of q.filters) {
    if (!types.has(f.column)) continue;
    const vals = f.values.map((v) => v.toLowerCase());
    rows = rows.filter((r) => vals.includes(String(r[f.column] ?? "(blank)").toLowerCase()));
  }
  if (timeColumn && (q.dateFrom || q.dateTo)) {
    const from = q.dateFrom ? Date.parse(q.dateFrom.slice(0, 10)) : null;
    const to = q.dateTo ? Date.parse(q.dateTo.slice(0, 10)) : null;
    rows = applyFilters(rows, { values: {}, dateFrom: Number.isNaN(from) ? null : from, dateTo: Number.isNaN(to) ? null : to }, timeColumn);
  }
  const dims = q.groupBy.filter((d) => types.has(d)).slice(0, 2);
  const useTime = q.timeGrain && timeColumn && types.get(timeColumn) === "date";

  const groups = new Map<string, { key: Record<string, string>; rows: Row[]; order: number }>();
  for (const r of rows) {
    const key: Record<string, string> = {};
    let order = 0;
    if (useTime) {
      const t = r[timeColumn!];
      if (typeof t !== "number") continue;
      order = bucketStart(t, q.timeGrain!);
      key.period = bucketLabel(order, q.timeGrain!);
    }
    for (const d of dims) key[d] = r[d] === null ? "(blank)" : String(r[d]);
    const id = JSON.stringify(key);
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { key, rows: [], order }));
    g.rows.push(r);
  }

  let out = [...groups.values()].map((g) => ({
    order: g.order,
    row: {
      ...g.key,
      ...Object.fromEntries(q.metrics.map((m) => [m.label, roundOrNull(metricValue(g.rows, m))])),
      rows: g.rows.length,
    } as Record<string, string | number | null>,
  }));
  const first = q.metrics[0]?.label;
  if (q.sort === "x_asc" || (useTime && !dims.length)) out.sort((a, b) => a.order - b.order);
  else if (first) {
    const dir = q.sort === "value_asc" ? 1 : -1;
    out.sort((a, b) => dir * (Number(a.row[first] ?? 0) - Number(b.row[first] ?? 0)));
  }
  const totalGroups = out.length;
  out = out.slice(0, Math.min(q.limit ?? 30, 60));
  return {
    rows: out.map((o) => o.row),
    totalGroups,
    note: totalGroups > out.length ? `Showing ${out.length} of ${totalGroups} groups.` : undefined,
  };
}

function roundOrNull(v: number | null): number | null {
  return v === null ? null : round(v, 6);
}

// ---------- spec validation ----------

/** Drops anything in Claude's spec that references a column the data does not have. */
export function validateSpec(
  spec: DashboardSpecT,
  columns: { name: string; type: ColumnType }[],
): { spec: DashboardSpecT; warnings: string[] } {
  const types = new Map(columns.map((c) => [c.name, c.type]));
  const warnings: string[] = [];
  const isDim = (c: string | null) => !!c && ["category", "boolean", "text", "date"].includes(types.get(c) ?? "");

  const measureOk = (m: MeasureT) => {
    if (m.agg === "count" && m.column === null) return true;
    if (!m.column || !types.has(m.column)) return false;
    return NUMERIC_AGGS.has(m.agg) ? types.get(m.column) === "number" : true;
  };
  const metricOk = (d: MetricDefT) => measureOk(d.measure) && (!d.divideBy || measureOk(d.divideBy));

  const kpis = uniqueIds(spec.kpis).filter((k) => {
    const ok = metricOk(k);
    if (!ok) warnings.push(`Skipped KPI "${k.label}" (unknown or non-numeric column).`);
    return ok;
  });

  const charts = uniqueIds(spec.charts)
    .map((c) => ({ ...c, metrics: c.metrics.filter(metricOk) }))
    .filter((c) => {
      let ok = c.metrics.length > 0;
      if (c.type === "scatter") ok = ok && types.get(c.x ?? "") === "number" && types.get(c.metrics[0]?.measure.column ?? "") === "number";
      else if (c.x !== null) ok = ok && types.has(c.x);
      if (c.groupBy && !isDim(c.groupBy)) c.groupBy = null;
      if (!ok) warnings.push(`Skipped chart "${c.title}" (it referenced columns that are not in the data).`);
      return ok;
    });

  const timeColumn = spec.timeColumn && types.get(spec.timeColumn) === "date"
    ? spec.timeColumn
    : columns.find((c) => c.type === "date")?.name ?? null;

  return {
    warnings,
    spec: {
      ...spec,
      timeColumn,
      filters: spec.filters.filter((f) => ["category", "boolean"].includes(types.get(f) ?? "")).slice(0, 4),
      kpis,
      charts,
      analysis: {
        measures: spec.analysis.measures.filter(metricOk),
        dimensions: spec.analysis.dimensions.filter((d) => ["category", "boolean"].includes(types.get(d) ?? "")),
      },
    },
  };
}

function uniqueIds<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.map((it, i) => {
    let id = it.id || `item-${i}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    return { ...it, id };
  });
}

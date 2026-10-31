import type { DashboardSpecT, MetricDefT } from "./schema";
import type { Dataset, DatasetProfile, Row } from "./types";
import { metricValue, timeSeries } from "./engine";
import { round } from "./format";

// Statistical findings computed in code. Claude turns these into ranked,
// actionable insights; it never has to do arithmetic on raw rows.

interface Contributor {
  name: string;
  value: number;
  share: number | null;
}

export interface Facts {
  rowCount: number;
  period: { from: string; to: string; grain: string; periods: number; lastPeriodComplete: boolean } | null;
  metrics: {
    label: string;
    total: number | null;
    trend?: {
      latestPeriod: string;
      latest: number | null;
      previous: number | null;
      changePct: number | null;
      sameperiodLastYearPct: number | null;
      avgChangePerPeriodPct: number | null;
      best: { period: string; value: number };
      worst: { period: string; value: number };
      anomalies: { period: string; value: number; zScore: number }[];
      recent: { period: string; value: number | null }[];
    };
  }[];
  breakdowns: {
    metric: string;
    dimension: string;
    groups: number;
    top: Contributor[];
    bottom: Contributor[];
    top1SharePct: number | null;
    top3SharePct: number | null;
    movers?: { name: string; previous: number | null; latest: number | null; change: number | null; changePct: number | null }[];
  }[];
  correlations: { a: string; b: string; r: number }[];
  dataQuality: { duplicateRows: number; droppedTotalRows: number; sparseColumns: { column: string; missingPct: number }[] };
}

export function computeFacts(ds: Dataset, profile: DatasetProfile, spec: DashboardSpecT): Facts {
  const rows = ds.rows;
  const tc = spec.timeColumn;
  const measures = spec.analysis.measures.length ? spec.analysis.measures : spec.kpis.slice(0, 3);
  const ts = tc ? timeSeries(rows, tc) : null;
  // Exclude a half-finished last period from trend math.
  const complete = ts ? (ts.lastCoverage < 0.8 && ts.buckets.length >= 3 ? ts.buckets.slice(0, -1) : ts.buckets) : [];

  const facts: Facts = {
    rowCount: rows.length,
    period: ts
      ? {
          from: ts.buckets[0].label,
          to: ts.buckets[ts.buckets.length - 1].label,
          grain: ts.grain,
          periods: ts.buckets.length,
          lastPeriodComplete: ts.lastCoverage >= 0.8,
        }
      : null,
    metrics: [],
    breakdowns: [],
    correlations: [],
    dataQuality: {
      duplicateRows: profile.duplicateRows,
      droppedTotalRows: profile.droppedTotalRows,
      sparseColumns: profile.columns
        .filter((c) => c.missingPct >= 10)
        .map((c) => ({ column: c.name, missingPct: c.missingPct })),
    },
  };

  for (const m of measures.slice(0, 4)) {
    const entry: Facts["metrics"][number] = { label: m.label, total: r(metricValue(rows, m)) };
    if (complete.length >= 2) {
      const vals = complete.map((b) => ({ period: b.label, value: metricValue(b.rows, m) }));
      const nums = vals.filter((v): v is { period: string; value: number } => v.value !== null);
      const last = vals[vals.length - 1];
      const prev = vals[vals.length - 2];
      const yearBack = periodsPerYear(ts!.grain);
      const ly = yearBack && vals.length > yearBack ? vals[vals.length - 1 - yearBack] : null;
      if (nums.length >= 2) {
        const mean = nums.reduce((a, b) => a + b.value, 0) / nums.length;
        const sd = Math.sqrt(nums.reduce((a, b) => a + (b.value - mean) ** 2, 0) / nums.length);
        entry.trend = {
          latestPeriod: last.period,
          latest: r(last.value),
          previous: r(prev.value),
          changePct: pct(last.value, prev.value),
          sameperiodLastYearPct: ly ? pct(last.value, ly.value) : null,
          avgChangePerPeriodPct: mean ? r((slope(nums.map((n) => n.value)) / Math.abs(mean)) * 100) : null,
          best: maxBy(nums, (n) => n.value),
          worst: maxBy(nums, (n) => -n.value),
          anomalies: sd
            ? nums
                .map((n) => ({ period: n.period, value: r(n.value)!, zScore: r((n.value - mean) / sd, 2)! }))
                .filter((n) => Math.abs(n.zScore) >= 2)
                .slice(0, 5)
            : [],
          recent: vals.slice(-12).map((v) => ({ period: v.period, value: r(v.value) })),
        };
      }
    }
    facts.metrics.push(entry);
  }

  const dims = spec.analysis.dimensions.slice(0, 6);
  for (const m of measures.slice(0, 2)) {
    for (const d of dims) facts.breakdowns.push(breakdown(rows, m, d, complete));
  }

  const numeric = ds.columns.filter((c) => c.type === "number").map((c) => c.name).slice(0, 12);
  for (let i = 0; i < numeric.length; i++) {
    for (let j = i + 1; j < numeric.length; j++) {
      const c = pearson(rows, numeric[i], numeric[j]);
      if (c !== null && Math.abs(c) >= 0.5 && Math.abs(c) < 0.999) facts.correlations.push({ a: numeric[i], b: numeric[j], r: r(c, 2)! });
    }
  }
  facts.correlations.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  facts.correlations = facts.correlations.slice(0, 6);
  return facts;
}

function breakdown(
  rows: Row[],
  m: MetricDefT,
  dim: string,
  complete: { rows: Row[] }[],
): Facts["breakdowns"][number] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const k = row[dim] === null ? "(blank)" : String(row[dim]);
    let list = groups.get(k);
    if (!list) groups.set(k, (list = []));
    list.push(row);
  }
  const additive = !m.divideBy && (m.measure.agg === "sum" || m.measure.agg === "count");
  const total = additive ? metricValue(rows, m) : null;
  const ranked = [...groups.entries()]
    .map(([name, rs]) => ({ name, value: metricValue(rs, m) ?? 0, n: rs.length }))
    // Tiny groups make averages and ratios noisy.
    .filter((g) => additive || g.n >= 5)
    .sort((a, b) => b.value - a.value);
  const contrib = (g: { name: string; value: number }): Contributor => ({
    name: g.name,
    value: r(g.value)!,
    share: total ? r((g.value / total) * 100, 3) : null,
  });

  const out: Facts["breakdowns"][number] = {
    metric: m.label,
    dimension: dim,
    groups: groups.size,
    top: ranked.slice(0, 5).map(contrib),
    bottom: ranked.length > 5 ? ranked.slice(-3).map(contrib) : [],
    top1SharePct: total && ranked[0] ? r((ranked[0].value / total) * 100, 3) : null,
    top3SharePct: total ? r((ranked.slice(0, 3).reduce((a, g) => a + g.value, 0) / total) * 100, 3) : null,
  };

  if (complete.length >= 2 && groups.size <= 200) {
    const lastRows = complete[complete.length - 1].rows;
    const prevRows = complete[complete.length - 2].rows;
    const by = (rs: Row[]) => {
      const mp = new Map<string, Row[]>();
      rs.forEach((row) => {
        const k = row[dim] === null ? "(blank)" : String(row[dim]);
        let list = mp.get(k);
        if (!list) mp.set(k, (list = []));
        list.push(row);
      });
      return mp;
    };
    const L = by(lastRows);
    const P = by(prevRows);
    const movers = [...groups.keys()].map((name) => {
      const latest = L.get(name) ? metricValue(L.get(name)!, m) : additive ? 0 : null;
      const previous = P.get(name) ? metricValue(P.get(name)!, m) : additive ? 0 : null;
      const change = latest !== null && previous !== null ? latest - previous : null;
      return { name, latest: r(latest), previous: r(previous), change: r(change), changePct: pct(latest, previous) };
    });
    movers.sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0));
    out.movers = movers.slice(0, 5);
  }
  return out;
}

function periodsPerYear(grain: string): number | null {
  return grain === "month" ? 12 : grain === "quarter" ? 4 : grain === "week" ? 52 : null;
}

function r(v: number | null, digits = 4): number | null {
  return v === null || !Number.isFinite(v) ? null : round(v, digits);
}

function pct(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return r(((cur - prev) / Math.abs(prev)) * 100, 3);
}

function slope(ys: number[]): number {
  const n = ys.length;
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  return den ? num / den : 0;
}

function maxBy<T extends { period: string; value: number }>(xs: T[], key: (x: T) => number) {
  const best = xs.reduce((a, b) => (key(b) > key(a) ? b : a));
  return { period: best.period, value: r(best.value)! };
}

function pearson(rows: Row[], a: string, b: string): number | null {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (const row of rows) {
    const x = row[a];
    const y = row[b];
    if (typeof x !== "number" || typeof y !== "number") continue;
    n++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
  }
  if (n < 10) return null;
  const den = Math.sqrt((n * saa - sa * sa) * (n * sbb - sb * sb));
  return den ? (n * sab - sa * sb) / den : null;
}

import type { ColumnProfile, Dataset, DatasetProfile } from "./types";
import { round } from "./format";

/**
 * A compact, privacy-friendly summary of the dataset. This (not the raw rows)
 * is what Claude reads to understand the data.
 */
export function profileDataset(ds: Dataset): DatasetProfile {
  const total = ds.rows.length;

  const columns: ColumnProfile[] = ds.columns.map(({ name, type }) => {
    const vals = ds.rows.map((r) => r[name]).filter((v) => v !== null);
    const distinctSet = new Set(vals.map(String));
    const p: ColumnProfile = {
      name,
      type,
      nonNull: vals.length,
      missingPct: total ? round((1 - vals.length / total) * 100, 3) : 0,
      distinct: distinctSet.size,
      samples: [...distinctSet].slice(0, 5).map((s) => (type === "date" ? isoDate(Number(s)) : s.slice(0, 80))),
    };

    if (type === "number") {
      const nums = vals.filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
      if (nums.length) {
        const sum = nums.reduce((a, b) => a + b, 0);
        Object.assign(p, {
          min: round(nums[0]),
          max: round(nums[nums.length - 1]),
          mean: round(sum / nums.length),
          median: round(nums[Math.floor(nums.length / 2)]),
          sum: round(sum),
          allIntegers: nums.every(Number.isInteger),
          negatives: nums.filter((x) => x < 0).length,
        });
      }
    }

    if (type === "date") {
      const ts = vals as number[];
      if (ts.length) {
        p.dateMin = isoDate(ts.reduce((a, b) => Math.min(a, b)));
        p.dateMax = isoDate(ts.reduce((a, b) => Math.max(a, b)));
      }
    }

    if (type === "category" || type === "boolean") {
      const counts = new Map<string, number>();
      vals.forEach((v) => counts.set(String(v), (counts.get(String(v)) ?? 0) + 1));
      p.topValues = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([value, count]) => ({ value, count }));
    }
    return p;
  });

  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const r of ds.rows) {
    const key = JSON.stringify(r);
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
  }

  const sampleRows = ds.rows.slice(0, 8).map((r) => {
    const out: Record<string, string> = {};
    ds.columns.forEach(({ name, type }) => {
      const v = r[name];
      out[name] = v === null ? "" : type === "date" ? isoDate(v as number) : String(v).slice(0, 60);
    });
    return out;
  });

  return {
    fileName: ds.fileName,
    sheetName: ds.sheetName,
    otherSheets: ds.sheets.filter((s) => s.name !== ds.sheetName),
    rowCount: total,
    duplicateRows,
    droppedTotalRows: ds.droppedTotalRows,
    columns,
    sampleRows,
  };
}

export function isoDate(ms: number): string {
  const d = new Date(ms);
  const iso = d.toISOString();
  return d.getUTCHours() || d.getUTCMinutes() ? iso.slice(0, 16).replace("T", " ") : iso.slice(0, 10);
}

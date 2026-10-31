"use client";

import { X } from "lucide-react";
import type { Filters } from "@/lib/engine";
import type { DatasetProfile } from "@/lib/types";
import { isoDate } from "@/lib/profile";

export function FiltersBar({
  profile,
  columns,
  optionsFor,
  timeColumn,
  filters,
  onChange,
}: {
  profile: DatasetProfile;
  columns: string[];
  optionsFor: Record<string, string[]>;
  timeColumn: string | null;
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const time = timeColumn ? profile.columns.find((c) => c.name === timeColumn) : undefined;
  const active =
    Object.values(filters.values).some((v) => v.length) || filters.dateFrom !== null || filters.dateTo !== null;
  if (!columns.length && !time) return null;

  const toMs = (s: string) => (s ? Date.parse(s) : null);
  const toInput = (ms: number | null) => (ms === null ? "" : isoDate(ms).slice(0, 10));

  return (
    <div className="flex flex-wrap items-end gap-3">
      {time?.dateMin && (
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          {timeColumn}
          <span className="flex items-center gap-1">
            <input
              type="date"
              min={time.dateMin.slice(0, 10)}
              max={time.dateMax?.slice(0, 10)}
              value={toInput(filters.dateFrom)}
              onChange={(e) => onChange({ ...filters, dateFrom: toMs(e.target.value) })}
              className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
              aria-label="From date"
            />
            <span className="text-muted">–</span>
            <input
              type="date"
              min={time.dateMin.slice(0, 10)}
              max={time.dateMax?.slice(0, 10)}
              value={toInput(filters.dateTo)}
              onChange={(e) => onChange({ ...filters, dateTo: toMs(e.target.value) })}
              className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
              aria-label="To date"
            />
          </span>
        </label>
      )}
      {columns.map((col) => {
        const options = optionsFor[col] ?? [];
        const current = filters.values[col]?.[0] ?? "";
        return (
          <label key={col} className="flex flex-col gap-1 text-xs text-ink-2">
            {col}
            <select
              value={current}
              onChange={(e) =>
                onChange({ ...filters, values: { ...filters.values, [col]: e.target.value ? [e.target.value] : [] } })
              }
              className="h-9 min-w-36 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
            >
              <option value="">All</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {active && (
        <button
          onClick={() => onChange({ values: {}, dateFrom: null, dateTo: null })}
          className="h-9 inline-flex items-center gap-1 rounded-lg px-2 text-sm text-ink-2 hover:text-ink hover:bg-surface-2"
        >
          <X size={14} /> Clear filters
        </button>
      )}
    </div>
  );
}

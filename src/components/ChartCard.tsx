"use client";

import { Table2, BarChart3 } from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell as PieCell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartData, SeriesDef } from "@/lib/engine";
import type { ChartT } from "@/lib/schema";
import { formatValue } from "@/lib/format";

const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
// Color follows the entity: "Other" is always gray, never a palette slot.
const colorFor = (label: string, i: number) => (label === "Other" ? "var(--series-other)" : SERIES[i % 8]);

// Legend text stays in neutral ink; the swatch carries the series color.
const legendProps = {
  iconType: "circle" as const,
  wrapperStyle: { fontSize: 12 },
  formatter: (value: string) => <span style={{ color: "var(--ink-2)" }}>{value}</span>,
};

const axisProps = {
  stroke: "var(--axis)",
  tick: { fill: "var(--muted)", fontSize: 12 },
  tickLine: false,
} as const;

export function ChartCard({
  chart,
  data,
  currency,
  highlighted,
}: {
  chart: ChartT;
  data: ChartData;
  currency: string | null;
  highlighted?: boolean;
}) {
  const [asTable, setAsTable] = useState(chart.type === "table");
  const canToggle = chart.type !== "table" && data.kind !== "empty";

  return (
    <section
      id={`chart-${chart.id}`}
      className={`rounded-xl border bg-surface p-4 flex flex-col min-w-0 transition-shadow ${
        chart.width === "full" ? "lg:col-span-2" : ""
      } ${highlighted ? "border-accent ring-2 ring-accent/30" : "border-line"}`}
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink leading-snug">{chart.title}</h3>
          <p className="text-sm text-ink-2 mt-0.5">{chart.why}</p>
        </div>
        {canToggle && (
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            className="shrink-0 rounded-md p-1.5 text-muted hover:text-ink hover:bg-surface-2"
            aria-label={asTable ? "Show chart" : "Show as table"}
            title={asTable ? "Show chart" : "Show as table"}
          >
            {asTable ? <BarChart3 size={16} /> : <Table2 size={16} />}
          </button>
        )}
      </header>
      {data.kind === "empty" ? (
        <p className="text-sm text-muted py-10 text-center">{data.reason}</p>
      ) : asTable || data.kind === "table" ? (
        <DataTable data={data} xLabel={chart.x ?? ""} currency={currency} />
      ) : (
        <div className="h-72">
          <Plot chart={chart} data={data} currency={currency} />
        </div>
      )}
    </section>
  );
}

/** Only metrics sharing the first metric's unit go on one axis (never a dual axis). */
function sameScale(series: SeriesDef[]): SeriesDef[] {
  return series.filter((s) => s.format === series[0].format);
}

function Plot({ chart, data, currency }: { chart: ChartT; data: ChartData; currency: string | null }) {
  if (data.kind === "scatter") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis type="number" dataKey="x" name={data.xLabel} {...axisProps} tickFormatter={(v) => formatValue(v, "number", null)} />
          <YAxis type="number" dataKey="y" name={data.yLabel} {...axisProps} axisLine={false} width={56} tickFormatter={(v) => formatValue(v, chart.metrics[0].format, currency)} />
          <Tooltip content={<ScatterTip xLabel={data.xLabel} yLabel={data.yLabel} format={chart.metrics[0].format} currency={currency} />} />
          {data.groups.length > 1 && <Legend {...legendProps} />}
          {data.groups.map((g, i) => (
            <Scatter
              key={g}
              name={g}
              data={data.points.filter((p) => p.group === g)}
              fill={colorFor(g, i)}
              fillOpacity={0.7}
              stroke="var(--surface)"
              strokeWidth={1}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }
  if (data.kind !== "series") return null;

  const series = sameScale(data.series);
  const fmt = (v: number) => formatValue(v, series[0].format, currency);
  const tooltip = <Tooltip content={<SeriesTip series={series} currency={currency} />} cursor={{ fill: "var(--surface-2)", stroke: "var(--axis)" }} />;
  const legend = series.length > 1 && <Legend {...legendProps} />;
  const grid = <CartesianGrid stroke="var(--grid)" vertical={false} />;
  const margin = { top: 8, right: 12, bottom: 4, left: 4 };

  if (chart.type === "pie") {
    const s = series[0];
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={<SeriesTip series={[s]} currency={currency} nameKey="x" />} />
          <Legend {...legendProps} layout="vertical" align="right" verticalAlign="middle" />
          <Pie data={data.data} dataKey={s.key} nameKey="x" innerRadius="55%" outerRadius="85%" stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
            {data.data.map((d, i) => (
              <PieCell key={String(d.x)} fill={colorFor(String(d.x), i)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === "horizontal_bar") {
    const labelWidth = Math.min(160, Math.max(60, ...data.data.map((d) => String(d.x).length * 7)));
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.data} layout="vertical" margin={margin} barCategoryGap={4}>
          <CartesianGrid stroke="var(--grid)" horizontal={false} />
          <XAxis type="number" {...axisProps} tickFormatter={fmt} />
          <YAxis type="category" dataKey="x" {...axisProps} axisLine={false} width={labelWidth} interval={0} tickFormatter={(v: string) => (v.length > 22 ? v.slice(0, 21) + "…" : v)} />
          {tooltip}
          {legend}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={colorFor(s.label, i)} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
              {series.length === 1 &&
                data.data.map((d) => <PieCell key={String(d.x)} fill={d.x === "Other" ? "var(--series-other)" : SERIES[0]} />)}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  const xAxis = <XAxis dataKey="x" {...axisProps} minTickGap={16} tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + "…" : v)} />;
  const yAxis = <YAxis {...axisProps} axisLine={false} width={56} tickFormatter={fmt} />;

  if (chart.type === "bar" || chart.type === "stacked_bar") {
    const stacked = chart.type === "stacked_bar";
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.data} margin={margin} barGap={2}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {legend}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? "a" : undefined}
              fill={colorFor(s.label, i)}
              stroke={stacked ? "var(--surface)" : undefined}
              strokeWidth={stacked ? 1 : 0}
              radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
              maxBarSize={48}
              isAnimationActive={false}
            >
              {series.length === 1 &&
                data.data.map((d) => <PieCell key={String(d.x)} fill={d.x === "Other" ? "var(--series-other)" : SERIES[0]} />)}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.data} margin={margin}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {legend}
          {series.map((s, i) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colorFor(s.label, i)} fill={colorFor(s.label, i)} fillOpacity={series.length > 1 ? 0.08 : 0.15} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} connectNulls />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data.data} margin={margin}>
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        {legend}
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colorFor(s.label, i)} strokeWidth={2} dot={data.data.length <= 16 ? { r: 3, strokeWidth: 0, fill: colorFor(s.label, i) } : false} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: { dataKey?: string | number; value?: number; color?: string; name?: string; payload?: Record<string, unknown> }[];
}

function SeriesTip({ active, label, payload, series, currency, nameKey }: TipProps & { series: SeriesDef[]; currency: string | null; nameKey?: string }) {
  if (!active || !payload?.length) return null;
  const title = nameKey ? String(payload[0].payload?.[nameKey] ?? "") : String(label ?? "");
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-lg text-sm">
      <div className="font-medium text-ink mb-1">{title}</div>
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey);
        if (!s) return null;
        return (
          <div key={String(p.dataKey)} className="flex items-center gap-2 text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="mr-3">{s.label}</span>
            <span className="ml-auto font-medium text-ink tabular">{formatValue(p.value, s.format, currency, false)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ScatterTip({ active, payload, xLabel, yLabel, format, currency }: TipProps & { xLabel: string; yLabel: string; format: SeriesDef["format"]; currency: string | null }) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload as { x: number; y: number; group: string };
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-lg text-sm text-ink-2">
      {pt.group !== "All" && <div className="font-medium text-ink mb-1">{pt.group}</div>}
      <div>
        {xLabel}: <span className="text-ink tabular">{formatValue(pt.x, "number", null, false)}</span>
      </div>
      <div>
        {yLabel}: <span className="text-ink tabular">{formatValue(pt.y, format, currency, false)}</span>
      </div>
    </div>
  );
}

function DataTable({ data, xLabel, currency }: { data: ChartData; xLabel: string; currency: string | null }) {
  let columns: { key: string; label: string; format: SeriesDef["format"] | null }[];
  let rows: Record<string, string | number | null>[];
  if (data.kind === "table") {
    ({ columns, rows } = data);
  } else if (data.kind === "series") {
    columns = [{ key: "x", label: xLabel, format: null }, ...data.series];
    rows = data.data;
  } else if (data.kind === "scatter") {
    columns = [
      { key: "group", label: "Group", format: null },
      { key: "x", label: data.xLabel, format: "number" },
      { key: "y", label: data.yLabel, format: "number" },
    ];
    rows = data.points.slice(0, 200);
  } else return null;

  return (
    <div className="overflow-auto max-h-80 -mx-1">
      <table className="w-full text-sm tabular">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} className={`px-2 py-2 font-medium text-ink-2 whitespace-nowrap ${c.format ? "text-right" : "text-left"}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {columns.map((c) => (
                <td key={c.key} className={`px-2 py-1.5 ${c.format ? "text-right text-ink" : "text-left text-ink-2"}`}>
                  {c.format ? formatValue(r[c.key] as number | null, c.format, currency, false) : String(r[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

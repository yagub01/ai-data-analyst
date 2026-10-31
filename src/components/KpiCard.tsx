import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { KpiResult } from "@/lib/engine";
import type { KpiT } from "@/lib/schema";
import { formatChange, formatValue } from "@/lib/format";

export function KpiCard({ kpi, result, currency }: { kpi: KpiT; result: KpiResult; currency: string | null }) {
  const { change } = result;
  const tone =
    change === null || Math.abs(change) < 0.005 || kpi.goodDirection === "neutral"
      ? "neutral"
      : (change > 0) === (kpi.goodDirection === "up")
        ? "good"
        : "bad";
  const Icon = change === null || Math.abs(change) < 0.005 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-1 min-w-0" title={kpi.description}>
      <div className="text-sm text-ink-2 truncate">{kpi.label}</div>
      <div className="text-2xl sm:text-3xl font-semibold text-ink tracking-tight">{formatValue(result.value, kpi.format, currency)}</div>
      <div className="flex flex-wrap items-end justify-between gap-2 min-h-8">
        {change !== null ? (
          <div className="text-xs min-w-0">
            <span
              className={`inline-flex items-center gap-0.5 font-medium ${
                tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink-2"
              }`}
            >
              <Icon size={14} aria-hidden />
              {formatChange(change)}
            </span>
            <span className="text-muted ml-1">{result.compareLabel}</span>
          </div>
        ) : (
          <div className="text-xs text-muted line-clamp-2">{kpi.description}</div>
        )}
        {result.spark.length > 2 && <Sparkline values={result.spark} />}
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 72;
  const h = 28;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - lo) / span) * (h - 4)}`).join(" ");
  return (
    <svg width={w} height={h} className="shrink-0 hidden sm:block" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

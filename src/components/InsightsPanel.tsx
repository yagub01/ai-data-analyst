"use client";

import { AlertTriangle, Lightbulb, LineChart, Sparkles, TrendingUp, Database, RotateCw } from "lucide-react";
import type { InsightReportT, InsightT } from "@/lib/schema";

const KIND = {
  opportunity: { icon: Lightbulb, label: "Opportunity", cls: "text-good" },
  risk: { icon: AlertTriangle, label: "Risk", cls: "text-bad" },
  trend: { icon: TrendingUp, label: "Trend", cls: "text-accent" },
  anomaly: { icon: LineChart, label: "Anomaly", cls: "text-ink-2" },
  data_quality: { icon: Database, label: "Data quality", cls: "text-muted" },
} satisfies Record<InsightT["kind"], unknown>;

export function InsightsPanel({
  report,
  loading,
  error,
  onRetry,
  onFocusChart,
}: {
  report: InsightReportT | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onFocusChart: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="flex items-center gap-2 font-semibold text-ink mb-3">
        <Sparkles size={18} className="text-accent" /> Insights &amp; actions
      </h2>

      {loading && (
        <div className="space-y-3" aria-busy>
          <p className="text-sm text-ink-2">Looking for what matters in your numbers…</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-surface-2 animate-pulse" />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="text-sm text-bad flex items-center gap-3">
          {error}
          <button onClick={onRetry} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink underline">
            <RotateCw size={14} /> Retry
          </button>
        </div>
      )}

      {report && !loading && (
        <>
          <p className="text-ink font-medium mb-4 leading-relaxed">{report.headline}</p>
          <ol className="space-y-3">
            {report.insights.map((ins, i) => {
              const k = KIND[ins.kind];
              const Icon = k.icon;
              return (
                <li key={i} className="rounded-lg border border-line p-3">
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <span className={`inline-flex items-center gap-1 font-medium ${k.cls}`}>
                      <Icon size={14} aria-hidden /> {k.label}
                    </span>
                    <span className="text-muted">· {ins.impact} impact</span>
                  </div>
                  <h3 className="font-semibold text-ink leading-snug">{ins.title}</h3>
                  <p className="text-sm text-ink-2 mt-1 leading-relaxed">{ins.detail}</p>
                  <p className="text-sm mt-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-ink">
                    <span className="font-medium">Do next: </span>
                    {ins.action}
                  </p>
                  {ins.relatedChartId && (
                    <button
                      onClick={() => onFocusChart(ins.relatedChartId!)}
                      className="mt-2 text-xs text-accent hover:underline"
                    >
                      Show the chart →
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

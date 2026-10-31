"use client";

import { ChevronDown, MessageSquare, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyFilters, computeChart, computeKpi, emptyFilters, validateSpec, type Filters } from "@/lib/engine";
import type { DashboardSpecT, DashboardUpdateT, InsightReportT } from "@/lib/schema";
import type { Dataset, DatasetProfile } from "@/lib/types";
import { runChatTurn, type ChatMessage } from "@/lib/chatClient";
import { ChartCard } from "./ChartCard";
import { ChatPanel } from "./ChatPanel";
import { FiltersBar } from "./FiltersBar";
import { InsightsPanel } from "./InsightsPanel";
import { KpiCard } from "./KpiCard";

export function Dashboard({
  ds,
  profile,
  spec,
  onSpecChange,
  warnings,
  report,
  insightsLoading,
  insightsError,
  onRetryInsights,
  onNewFile,
}: {
  ds: Dataset;
  profile: DatasetProfile;
  spec: DashboardSpecT;
  onSpecChange: (s: DashboardSpecT) => void;
  warnings: string[];
  report: InsightReportT | null;
  insightsLoading: boolean;
  insightsError: string | null;
  onRetryInsights: () => void;
  onNewFile: () => void;
}) {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [showUnderstanding, setShowUnderstanding] = useState(false);
  // The chat's system prompt describes the dashboard as it was when the chat began.
  const chatBaseSpec = useRef<DashboardSpecT | null>(null);
  // Several dashboard updates can land in one chat turn; each builds on the last.
  const specRef = useRef(spec);
  useEffect(() => {
    specRef.current = spec;
  }, [spec]);

  const rows = useMemo(() => applyFilters(ds.rows, filters, spec.timeColumn), [ds.rows, filters, spec.timeColumn]);
  const kpis = useMemo(() => spec.kpis.map((k) => ({ k, r: computeKpi(rows, k, spec.timeColumn) })), [rows, spec]);
  const charts = useMemo(() => spec.charts.map((c) => ({ c, d: computeChart(ds, rows, c) })), [ds, rows, spec]);
  const filterOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const col of spec.filters) {
      out[col] = [...new Set(ds.rows.map((r) => String(r[col] ?? "(blank)")))].sort().slice(0, 300);
    }
    return out;
  }, [ds.rows, spec.filters]);

  function focusChart(id: string) {
    document.getElementById(`chart-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(id);
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 2500);
  }

  function applyUpdate(u: DashboardUpdateT): string {
    const cur = specRef.current;
    const replaceIds = new Set(u.addCharts.map((c) => c.id));
    const replaceKpis = new Set(u.addKpis.map((k) => k.id));
    const next: DashboardSpecT = {
      ...cur,
      title: u.title ?? cur.title,
      kpis: [
        ...cur.kpis.filter((k) => !u.removeKpiIds.includes(k.id) && !replaceKpis.has(k.id)),
        ...u.addKpis,
      ],
      charts: [
        // New charts go first so the user sees them.
        ...u.addCharts,
        ...cur.charts.filter((c) => !u.removeChartIds.includes(c.id) && !replaceIds.has(c.id)),
      ],
    };
    const { spec: valid, warnings: w } = validateSpec(next, ds.columns);
    specRef.current = valid;
    onSpecChange(valid);
    if (u.addCharts[0]) setTimeout(() => focusChart(u.addCharts[0].id), 100);
    return w.length ? `Applied, with problems: ${w.join(" ")}` : "Dashboard updated.";
  }

  async function sendChat(text: string) {
    chatBaseSpec.current ??= spec;
    setChatBusy(true);
    setChatError(null);
    try {
      const next = await runChatTurn({
        history: messages,
        userText: text,
        profile,
        baseSpec: chatBaseSpec.current,
        ds,
        timeColumn: spec.timeColumn,
        applyUpdate,
        onUpdate: setMessages,
      });
      setMessages(next);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Chat failed.");
      setMessages(messages); // drop the failed turn so history stays valid
    } finally {
      setChatBusy(false);
    }
  }

  const u = spec.understanding;
  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-3">
          <span className="font-semibold text-ink">InsightBoard</span>
          <span className="text-sm text-muted truncate hidden sm:inline">
            {ds.fileName} · {ds.sheetName} · {ds.rows.length.toLocaleString()} rows
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onNewFile}
              className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm text-ink-2 hover:text-ink"
            >
              <Upload size={15} /> <span className="hidden sm:inline">New file</span>
            </button>
            <button
              onClick={() => setChatOpen(true)}
              className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white"
            >
              <MessageSquare size={15} /> Ask AI
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">{spec.title}</h1>
          <p className="text-ink-2 mt-1">{spec.subtitle}</p>
        </div>

        <section className="rounded-xl border border-line bg-surface">
          <button
            onClick={() => setShowUnderstanding((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={showUnderstanding}
          >
            <span className="min-w-0">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">What the AI understood</span>
              <span className="block text-ink truncate">
                {u.domain} — for {u.audience.charAt(0).toLowerCase() + u.audience.slice(1)}
              </span>
            </span>
            <ChevronDown size={18} className={`shrink-0 text-muted transition ${showUnderstanding ? "rotate-180" : ""}`} />
          </button>
          {showUnderstanding && (
            <div className="px-4 pb-4 grid gap-4 md:grid-cols-3 text-sm">
              <div className="md:col-span-3 text-ink-2 leading-relaxed">{u.summary}</div>
              <List title="Questions this dashboard answers" items={u.keyQuestions} />
              <List title="Assumptions" items={u.assumptions} />
              <List title="Data notes" items={[...u.dataQualityNotes, ...warnings]} empty="No issues found." />
              <p className="md:col-span-3 text-ink-2">
                Not quite right?{" "}
                <button onClick={() => setChatOpen(true)} className="text-accent hover:underline">
                  Tell the AI what this data is or what you need
                </button>{" "}
                and it will adjust the dashboard.
              </p>
            </div>
          )}
        </section>

        <FiltersBar
          profile={profile}
          columns={spec.filters}
          optionsFor={filterOptions}
          timeColumn={spec.timeColumn}
          filters={filters}
          onChange={setFilters}
        />

        {kpis.length > 0 && (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {kpis.map(({ k, r }) => (
              <KpiCard key={k.id} kpi={k} result={r} currency={spec.currency} />
            ))}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1fr_380px] items-start">
          <div className="grid gap-4 lg:grid-cols-2 min-w-0">
            {charts.map(({ c, d }) => (
              <ChartCard key={c.id} chart={c} data={d} currency={spec.currency} highlighted={highlight === c.id} />
            ))}
          </div>
          {/* Insights come before the charts until there is room for a side column. */}
          <div className="order-first xl:order-none xl:sticky xl:top-20">
            <InsightsPanel
              report={report}
              loading={insightsLoading}
              error={insightsError}
              onRetry={onRetryInsights}
              onFocusChart={focusChart}
            />
          </div>
        </div>
      </main>

      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-5 right-5 z-30 h-12 w-12 rounded-full bg-accent text-white shadow-lg inline-flex items-center justify-center sm:hidden"
          aria-label="Ask AI"
        >
          <MessageSquare size={20} />
        </button>
      )}
      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={messages}
        busy={chatBusy}
        error={chatError}
        onSend={sendChat}
      />
    </div>
  );
}

function List({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  return (
    <div>
      <div className="font-medium text-ink mb-1">{title}</div>
      {items.length ? (
        <ul className="list-disc pl-5 space-y-1 text-ink-2">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">{empty ?? "None."}</p>
      )}
    </div>
  );
}

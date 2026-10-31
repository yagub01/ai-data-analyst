"use client";

import { useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { UploadView } from "@/components/UploadView";
import { validateSpec } from "@/lib/engine";
import { computeFacts } from "@/lib/facts";
import { buildDataset, pickDefaultSheet, readWorkbook, type ParsedWorkbook } from "@/lib/parse";
import { profileDataset } from "@/lib/profile";
import type { DashboardSpecT, InsightReportT } from "@/lib/schema";
import type { Dataset, DatasetProfile } from "@/lib/types";

interface Analysis {
  ds: Dataset;
  profile: DatasetProfile;
  spec: DashboardSpecT;
  warnings: string[];
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data as T;
}

export default function Home() {
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [sheet, setSheet] = useState("");
  const [notes, setNotes] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [report, setReport] = useState<InsightReportT | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  async function loadFile(file: File) {
    setError(null);
    setStage("Reading file…");
    try {
      const wb = await readWorkbook(file);
      if (!wb.sheets.length) throw new Error("This file has no data.");
      setWorkbook(wb);
      setSheet(pickDefaultSheet(wb));
    } catch (e) {
      setError(e instanceof Error ? `Could not read the file: ${e.message}` : "Could not read the file.");
    } finally {
      setStage(null);
    }
  }

  async function loadSample() {
    const res = await fetch("/sample-retail-sales.xlsx");
    const blob = await res.blob();
    await loadFile(new File([blob], "sample-retail-sales.xlsx"));
  }

  async function findInsights(a: Analysis) {
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const facts = computeFacts(a.ds, a.profile, a.spec);
      const { report } = await postJson<{ report: InsightReportT }>("/api/insights", { spec: a.spec, facts, notes });
      setReport(report);
    } catch (e) {
      setInsightsError(e instanceof Error ? e.message : "Could not generate insights.");
    } finally {
      setInsightsLoading(false);
    }
  }

  async function analyze() {
    if (!workbook) return;
    setError(null);
    try {
      setStage("Profiling your data…");
      const ds = buildDataset(workbook, sheet);
      if (ds.rows.length === 0) throw new Error("That sheet has no data rows.");
      const profile = profileDataset(ds);

      setStage("Understanding your data…");
      const { spec } = await postJson<{ spec: DashboardSpecT }>("/api/understand", { profile, notes });
      const checked = validateSpec(spec, ds.columns);
      const a: Analysis = { ds, profile, spec: checked.spec, warnings: checked.warnings };
      setReport(null);
      setAnalysis(a);
      void findInsights(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setStage(null);
    }
  }

  if (analysis) {
    return (
      <Dashboard
        key={analysis.ds.fileName + analysis.ds.sheetName}
        ds={analysis.ds}
        profile={analysis.profile}
        spec={analysis.spec}
        onSpecChange={(spec) => setAnalysis((a) => (a ? { ...a, spec } : a))}
        warnings={analysis.warnings}
        report={report}
        insightsLoading={insightsLoading}
        insightsError={insightsError}
        onRetryInsights={() => findInsights(analysis)}
        onNewFile={() => {
          setAnalysis(null);
          setWorkbook(null);
          setReport(null);
          setNotes("");
        }}
      />
    );
  }

  return (
    <UploadView
      workbook={workbook}
      sheet={sheet}
      onSheet={setSheet}
      notes={notes}
      onNotes={setNotes}
      onFile={loadFile}
      onSample={loadSample}
      onAnalyze={analyze}
      busy={stage !== null}
      stage={stage}
      error={error}
    />
  );
}

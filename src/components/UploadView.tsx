"use client";

import { FileSpreadsheet, Loader2, Sparkles, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { ParsedWorkbook } from "@/lib/parse";
import { summarizeSheets } from "@/lib/parse";
import { VoiceButton } from "./VoiceButton";

const ACCEPT = ".xlsx,.xls,.xlsm,.xlsb,.csv,.ods";

export function UploadView({
  workbook,
  sheet,
  onSheet,
  notes,
  onNotes,
  onFile,
  onSample,
  onAnalyze,
  busy,
  stage,
  error,
}: {
  workbook: ParsedWorkbook | null;
  sheet: string;
  onSheet: (s: string) => void;
  notes: string;
  onNotes: (n: string) => void;
  onFile: (f: File) => void;
  onSample: () => void;
  onAnalyze: () => void;
  busy: boolean;
  stage: string | null;
  error: string | null;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseRef = useRef("");
  const sheets = workbook ? summarizeSheets(workbook) : [];
  const current = sheets.find((s) => s.name === sheet);

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-ink">AI Data Analyst</h1>
          <p className="mt-3 text-ink-2 text-lg">
            Upload a spreadsheet. The AI figures out what it is, builds the dashboard you need, and tells you what to do
            next.
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition ${
            drag ? "border-accent bg-accent/5" : "border-line bg-surface hover:bg-surface-2"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          {workbook ? (
            <div className="flex flex-col items-center gap-2">
              <FileSpreadsheet size={36} className="text-accent" />
              <div className="font-medium text-ink">{workbook.fileName}</div>
              <div className="text-sm text-ink-2">
                {current ? `${current.rows.toLocaleString()} rows · ${current.columns} columns` : ""} · click to choose a
                different file
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={36} className="text-muted" />
              <div className="font-medium text-ink">Drop an Excel or CSV file here, or click to browse</div>
              <div className="text-sm text-muted">.xlsx, .xls, .csv and more. Your data stays in your browser; only a summary is sent to the AI.</div>
            </div>
          )}
        </div>

        {sheets.length > 1 && (
          <label className="mt-4 flex items-center gap-3 text-sm text-ink-2">
            Sheet
            <select
              value={sheet}
              onChange={(e) => onSheet(e.target.value)}
              className="h-9 rounded-lg border border-line bg-surface px-2 text-ink"
            >
              {sheets.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.rows.toLocaleString()} rows)
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-6">
          <label htmlFor="notes" className="text-sm font-medium text-ink">
            Tell the AI about this data <span className="font-normal text-muted">(optional)</span>
          </label>
          <div className="mt-2 flex items-start gap-2">
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              rows={3}
              placeholder="e.g. I run 3 coffee shops. I want to know which products and days make the most profit."
              className="flex-1 resize-y rounded-xl border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <VoiceButton
              onStart={() => (baseRef.current = notes ? notes.trimEnd() + " " : "")}
              onText={(t) => onNotes(baseRef.current + t)}
            />
          </div>
          <p className="mt-1 text-xs text-muted">Skip this and the AI will work out what you most likely need.</p>
        </div>

        {error && <p className="mt-4 text-sm text-bad">{error}</p>}

        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={onAnalyze}
            disabled={!workbook || busy}
            className="w-full sm:w-auto h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 font-medium text-white disabled:opacity-40"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {busy ? stage ?? "Working…" : "Build my dashboard"}
          </button>
          {!workbook && (
            <button onClick={onSample} disabled={busy} className="text-sm text-ink-2 hover:text-ink underline">
              or try it with sample sales data
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

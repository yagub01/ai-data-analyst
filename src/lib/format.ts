import type { MetricDefT } from "./schema";

/** Round to a number of significant digits (keeps prompts short and numbers honest). */
export function round(n: number, digits = 4): number {
  if (!Number.isFinite(n) || n === 0) return n;
  const p = Math.pow(10, digits - Math.ceil(Math.log10(Math.abs(n))));
  return Math.round(n * p) / p;
}

export function formatValue(
  v: number | null | undefined,
  format: MetricDefT["format"],
  currency: string | null,
  compact = true,
): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  if (format === "percent") {
    // Ratios come in as 0.23; stored percentages (23) are left as is.
    const pct = Math.abs(v) <= 1.5 ? v * 100 : v;
    return `${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`;
  }
  const opts: Intl.NumberFormatOptions = compact && Math.abs(v) >= 10_000
    ? { notation: "compact", maximumFractionDigits: 1 }
    : { maximumFractionDigits: format === "decimal" || Math.abs(v) < 10 ? 2 : 0 };
  if (format === "currency" && currency) {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency, ...opts }).format(v);
    } catch {
      // unknown currency code: fall through to a plain number
    }
  }
  return new Intl.NumberFormat("en-US", opts).format(v);
}

export function formatChange(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${(pct * 100).toFixed(Math.abs(pct) < 0.1 ? 1 : 0)}%`;
}

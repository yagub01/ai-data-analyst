import { z } from "zod";

// Shared between the browser (rendering, validation) and the API routes
// (structured output from Claude). Column names always refer to the
// profiled dataset; the browser drops anything that does not match.

export const Agg = z.enum([
  "sum",
  "avg",
  "count",
  "count_distinct",
  "min",
  "max",
  "median",
]);

export const Measure = z.object({
  column: z
    .string()
    .nullable()
    .describe("Column to aggregate. null only with agg=count (row count)."),
  agg: Agg,
});

export const MetricDef = z.object({
  label: z.string(),
  measure: Measure,
  divideBy: Measure.nullable().describe(
    "Optional denominator for ratios such as margin = sum(profit)/sum(revenue). null for plain metrics.",
  ),
  format: z.enum(["number", "currency", "percent", "decimal"]),
});

export const TimeGrain = z.enum(["day", "week", "month", "quarter", "year"]);

export const Kpi = MetricDef.extend({
  id: z.string(),
  description: z.string().describe("One short line on why this number matters."),
  goodDirection: z.enum(["up", "down", "neutral"]),
});

export const ChartType = z.enum([
  "line",
  "area",
  "bar",
  "horizontal_bar",
  "stacked_bar",
  "pie",
  "scatter",
  "table",
]);

export const Chart = z.object({
  id: z.string(),
  title: z.string(),
  why: z.string().describe("One sentence: what question this chart answers for the user."),
  type: ChartType,
  x: z
    .string()
    .nullable()
    .describe(
      "Category or date column on the x axis (or slice column for pie, row column for table). For scatter: the numeric column for the x axis.",
    ),
  timeGrain: TimeGrain.nullable().describe("Required when x is a date column, otherwise null."),
  metrics: z
    .array(MetricDef)
    .describe("1-3 metrics. For scatter: one metric whose measure.column is the y column (agg ignored)."),
  groupBy: z
    .string()
    .nullable()
    .describe("Optional category column that splits the first metric into series (line/area/stacked_bar) or colors points (scatter)."),
  sort: z.enum(["value_desc", "value_asc", "x_asc"]),
  limit: z.number().nullable().describe("Max categories to show (others are grouped). null for no limit."),
  width: z.enum(["half", "full"]),
});

export const Understanding = z.object({
  domain: z.string().describe("What this data is, in plain words, e.g. 'Retail sales transactions'."),
  summary: z.string().describe("2-3 sentences: what the data contains and what it is likely used for."),
  audience: z.string().describe("Who most likely uses this data and what they decide with it."),
  keyQuestions: z.array(z.string()).describe("3-6 questions this user most likely wants answered."),
  assumptions: z.array(z.string()).describe("Assumptions you made about ambiguous columns or meaning."),
  dataQualityNotes: z.array(z.string()),
});

export const DashboardSpec = z.object({
  title: z.string(),
  subtitle: z.string(),
  understanding: Understanding,
  timeColumn: z.string().nullable().describe("Main date column used for trends and period comparisons, or null."),
  currency: z.string().nullable().describe("ISO currency code if monetary values are present, e.g. USD, else null."),
  filters: z.array(z.string()).describe("Up to 4 category columns users would want to filter by."),
  kpis: z.array(Kpi).describe("3-6 headline numbers."),
  charts: z.array(Chart).describe("4-8 charts, most important first."),
  analysis: z.object({
    measures: z.array(MetricDef).describe("2-4 metrics that matter most, used to search for insights."),
    dimensions: z.array(z.string()).describe("2-6 category columns worth breaking those metrics down by."),
  }),
});

export const Insight = z.object({
  title: z.string().describe("Short headline with the key number."),
  detail: z.string().describe("2-3 sentences explaining what is happening, citing the numbers."),
  action: z.string().describe("A concrete next step the user can take."),
  kind: z.enum(["opportunity", "risk", "trend", "anomaly", "data_quality"]),
  impact: z.enum(["high", "medium", "low"]),
  relatedChartId: z.string().nullable(),
});

export const InsightReport = z.object({
  headline: z.string().describe("One-sentence executive summary of the most important takeaway."),
  insights: z.array(Insight).describe("4-8 insights, highest impact first."),
});

export const QueryInput = z.object({
  metrics: z.array(MetricDef),
  groupBy: z.array(z.string()).describe("0-2 category columns to group by."),
  timeGrain: TimeGrain.nullable().describe("Group by the dataset's time column at this grain, or null."),
  filters: z.array(z.object({ column: z.string(), values: z.array(z.string()) })),
  sort: z.enum(["value_desc", "value_asc", "x_asc"]),
  limit: z.number().nullable(),
});

export const DashboardUpdate = z.object({
  addKpis: z.array(Kpi),
  removeKpiIds: z.array(z.string()),
  addCharts: z.array(Chart).describe("New charts, or charts reusing an existing id to replace it."),
  removeChartIds: z.array(z.string()),
  title: z.string().nullable(),
});

export type AggT = z.infer<typeof Agg>;
export type MeasureT = z.infer<typeof Measure>;
export type MetricDefT = z.infer<typeof MetricDef>;
export type TimeGrainT = z.infer<typeof TimeGrain>;
export type KpiT = z.infer<typeof Kpi>;
export type ChartT = z.infer<typeof Chart>;
export type DashboardSpecT = z.infer<typeof DashboardSpec>;
export type InsightT = z.infer<typeof Insight>;
export type InsightReportT = z.infer<typeof InsightReport>;
export type QueryInputT = z.infer<typeof QueryInput>;
export type DashboardUpdateT = z.infer<typeof DashboardUpdate>;

# AI Data Analyst

Upload an Excel or CSV file. The AI works out what the data is and who uses it, builds the dashboard that person needs, and writes actionable insights. You can type or speak to it to add context, ask questions, or change the dashboard. With no input at all, it still works out what you most likely need.

## How it works

1. **Parse (browser).** SheetJS reads the file. The parser finds the header row (skipping title rows), drops "Total" rows, and works out each column's type (number, date, category, id, text).
2. **Profile (browser).** A compact summary of each column: stats, top values, date range and a few sample rows. Only this summary goes to the AI, never the full file.
3. **Understand (Claude).** `/api/understand` turns the profile, plus any notes you typed or spoke, into a dashboard spec: what the data is, the key questions, the KPIs, the charts, the filters and the metrics worth analysing.
4. **Compute (browser).** `src/lib/engine.ts` calculates every number from the full dataset. The AI decides *what* to show and never writes the figures itself. Any spec item that names a column the data doesn't have is dropped.
5. **Insights (code + Claude).** `src/lib/facts.ts` computes trends, period-over-period changes, top/bottom contributors, biggest movers, anomalies, correlations and data-quality issues. `/api/insights` ranks them and turns them into recommendations, using only those numbers.
6. **Chat and voice.** `/api/chat` gives Claude two tools that run in your browser on the full data: `query_data` (exact aggregations) and `update_dashboard` (add, replace or remove charts and KPIs). Voice input uses the browser's speech recognition (Chrome, Edge, Safari).

## Run it

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000 and drop in a file, or click **try it with sample sales data**.

`npm run build` makes a production build. `node scripts/make-sample.mjs` regenerates the sample file.

## Put it online (Vercel)

1. On [vercel.com](https://vercel.com), sign in with GitHub, choose **Add New → Project** and import this repo.
2. Under **Environment Variables**, add:
   - `ANTHROPIC_API_KEY`: your key.
   - `ACCESS_CODE`: a password of your choice. Anyone opening the site must enter it before the AI features work, so strangers can't spend your API credit. Use something long, like `blue-tiger-river-42`.
3. Click **Deploy**. Every push to `main` redeploys automatically.

With `ACCESS_CODE` unset, the app is open to anyone, which is fine on your own computer. The server enforces the code on every AI request; the code screen in the page is only the way to enter it.

## Settings

| Variable | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Your Anthropic API key. |
| `ACCESS_CODE` | for public sites | Password required to use the AI features. |
| `AI_DATA_ANALYST_MODEL` | no | Model to use. Default `claude-sonnet-5-5`; `claude-opus-5-5` is the most capable, at about twice the cost. |

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Recharts · SheetJS · Anthropic SDK (Claude Sonnet 5.5 by default, structured outputs, refusal fallback enabled).

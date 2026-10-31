// Generates public/sample-retail-sales.xlsx: realistic retail orders with a few
// planted patterns (seasonality, a declining region, a low-margin category)
// so the insights have something real to find. Run: node scripts/make-sample.mjs
import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const regions = {
  North: ["Oslo Street", "Pine Mall"],
  South: ["Harbor Point", "Sunset Plaza"],
  East: ["Riverside", "Old Town"],
  West: ["Canyon Center", "Bay Market"],
};
const catalog = {
  Electronics: [["Headphones", 89], ["Smart Watch", 249], ["Bluetooth Speaker", 129], ["Tablet", 399]],
  Furniture: [["Desk Chair", 189], ["Standing Desk", 549], ["Bookshelf", 159]],
  "Office Supplies": [["Notebook Pack", 12], ["Pen Set", 9], ["Desk Organizer", 29], ["Printer Paper", 24]],
  Clothing: [["Rain Jacket", 119], ["Sneakers", 95], ["Wool Sweater", 79]],
};
const margin = { Electronics: 0.32, Furniture: 0.09, "Office Supplies": 0.45, Clothing: 0.38 };

const rows = [];
const start = Date.UTC(2024, 0, 1);
const end = Date.UTC(2025, 8, 30);
let order = 100000;
for (let t = start; t <= end; t += 86400000) {
  const d = new Date(t);
  const month = d.getUTCMonth();
  const monthsIn = (d.getUTCFullYear() - 2024) * 12 + month;
  const season = month === 10 ? 1.6 : month === 11 ? 1.9 : month === 0 ? 0.75 : 1;
  const weekend = [0, 6].includes(d.getUTCDay()) ? 1.3 : 1;
  const n = Math.round((7 + rand() * 6) * season * weekend);
  for (let i = 0; i < n; i++) {
    const region = pick(Object.keys(regions));
    // West loses momentum over the last 6 months.
    if (region === "West" && monthsIn >= 15 && rand() < 0.45) continue;
    let category = pick(Object.keys(catalog));
    // Electronics grows steadily.
    if (rand() < monthsIn * 0.01) category = "Electronics";
    const [product, price] = pick(catalog[category]);
    const units = category === "Office Supplies" ? 1 + Math.floor(rand() * 8) : 1 + Math.floor(rand() * 2.2);
    const discount = rand() < 0.2 ? 0.15 : 0;
    const unitPrice = Math.round(price * (1 - discount) * 100) / 100;
    const revenue = Math.round(units * unitPrice * 100) / 100;
    const m = margin[category] - discount * 0.8 + (rand() - 0.5) * 0.06;
    const profit = Math.round(revenue * m * 100) / 100;
    rows.push({
      "Order Date": new Date(Date.UTC(d.getUTCFullYear(), month, d.getUTCDate())),
      "Order ID": `SO-${order++}`,
      Region: region,
      Store: pick(regions[region]),
      Category: category,
      Product: product,
      Channel: rand() < 0.35 + monthsIn * 0.01 ? "Online" : "In-store",
      "Customer Type": rand() < 0.4 ? "New" : "Returning",
      Units: units,
      "Unit Price": unitPrice,
      "Discount %": discount,
      Revenue: revenue,
      Cost: Math.round((revenue - profit) * 100) / 100,
      Profit: profit,
    });
  }
}

const header = Object.keys(rows[0]);
const totals = { Revenue: 0, Cost: 0, Profit: 0, Units: 0 };
rows.forEach((r) => Object.keys(totals).forEach((k) => (totals[k] += r[k])));

// A title row, a blank row, the table, then a Total row: like real exports.
const aoa = [
  ["Retail Sales Export (all stores)"],
  [],
  header,
  ...rows.map((r) => header.map((h) => r[h])),
  header.map((h, i) => (i === 0 ? "Total" : h in totals ? Math.round(totals[h] * 100) / 100 : null)),
];
const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, UTC: true });
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Orders");
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([["Notes"], ["Exported from POS on 2025-10-01"], ["Amounts in USD"]]),
  "Read me",
);
writeFileSync("public/sample-retail-sales.xlsx", XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log(`Wrote ${rows.length} orders to public/sample-retail-sales.xlsx`);

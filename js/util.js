// util.js — small helpers shared by every screen.

// Escape text before putting it into HTML, so a food named "<b>" can't break the page.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ----- Dates: we store days as 'YYYY-MM-DD' strings in local time -----
const pad = (n) => String(n).padStart(2, '0');
export const dateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return dateStr(d); }
export const shortDate = (s) => parseDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const longDate = (s) => parseDate(s).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

// ----- Numbers -----
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const r1 = (n) => Math.round(n * 10) / 10;
export function num(v) { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : 0; }
// ----- Units -----
// Each food is measured in a base unit: grams (solids) or millilitres (drinks).
// Serving sizes can be typed in g, ml, oz or fl oz and are converted to that base unit.
export const SERVING_UNITS = ['g', 'ml', 'oz', 'fl oz'];
const TO_BASE = { g: 1, ml: 1, oz: 28.3495, 'fl oz': 29.5735 };
export const baseOf = (unit) => (unit === 'ml' || unit === 'fl oz' ? 'ml' : 'g');
export const toBase = (qty, unit) => qty * (TO_BASE[unit] || 1);

// "1 serving is 8 fl oz (237 ml)" style label for a food's serving.
export function servingLabel(food) {
  const base = food.baseUnit || 'g';
  if (food.servingUnit && food.servingUnit !== base && food.servingQty) {
    return `${r1(food.servingQty)} ${food.servingUnit} (${Math.round(food.servingG)} ${base})`;
  }
  return `${r1(food.servingG)} ${base}`;
}

// "1.5 servings · 82.5 g" when there's a serving size, otherwise "82.5 g".
export function amountText(amount, servingG, base = 'g') {
  if (!servingG) return `${r1(amount)} ${base}`;
  const n = Math.round((amount / servingG) * 100) / 100;
  return `${n} serving${n === 1 ? '' : 's'} · ${r1(amount)} ${base}`;
}
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ----- Nutrition math -----
// Foods are stored per 100 g. Scale to any amount in grams.
export function scale(per100, grams) {
  const k = grams / 100;
  return { kcal: per100.kcal * k, p: per100.p * k, c: per100.c * k, f: per100.f * k };
}
export const sum = (list) => list.reduce((a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c, f: a.f + e.f }), { kcal: 0, p: 0, c: 0, f: 0 });
// Protein and carbs have 4 kcal per gram, fat has 9.
export const kcalFromMacros = (p, c, f) => p * 4 + c * 4 + f * 9;

// ----- Inline icons (stroke SVG) -----
export const ICON = {
  plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  plusSm: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B6F6C" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  barcode: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 9v6M11 9v6M14 9v6M17 9v6"/></svg>',
};

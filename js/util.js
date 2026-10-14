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
// Each food is measured in a base unit:
//   'g'  grams (most foods)       'ml' millilitres (drinks with a serving in ml / fl oz)
//   'pc' pieces (things you count, like cookies, when the weight isn't known)
// Serving sizes can be typed in g, ml, oz, fl oz or pieces and are converted to the base unit.
export const SERVING_UNITS = ['g', 'ml', 'oz', 'fl oz', 'pieces'];
const TO_BASE = { g: 1, ml: 1, oz: 28.3495, 'fl oz': 29.5735 };
export const baseOf = (unit) => (unit === 'ml' || unit === 'fl oz' ? 'ml' : 'g');
export const toBase = (qty, unit) => qty * (TO_BASE[unit] || 1);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const r2 = (n) => Math.round(n * 100) / 100;

// The ways you can enter an amount for a food. `per` = how many base units one of these is.
export function amountUnits(food) {
  const base = food.baseUnit || 'g';
  const units = [];
  const pieceSize = food.servingUnit === 'pieces' && food.servingQty ? food.servingG / food.servingQty : null;
  if (base === 'pc' || pieceSize) units.push({ key: 'pc', label: 'pieces', per: base === 'pc' ? 1 : pieceSize, step: 1 });
  if (food.servingG && !(base === 'pc' && food.servingQty === 1)) units.push({ key: 'serv', label: 'servings', per: food.servingG, step: 0.5 });
  if (base !== 'pc') units.push({ key: 'base', label: base, per: 1, step: 10 });
  return units;
}

// "8 fl oz (237 ml)", "2 pieces (28 g)", "55 g": how big one serving is.
export function servingLabel(food) {
  const base = food.baseUnit || 'g';
  if (food.servingUnit === 'pieces' && food.servingQty) {
    return plural(r1(food.servingQty), 'piece') + (base === 'pc' ? '' : ` (${Math.round(food.servingG)} ${base})`);
  }
  if (food.servingUnit && food.servingUnit !== base && food.servingQty) {
    return `${r1(food.servingQty)} ${food.servingUnit} (${Math.round(food.servingG)} ${base})`;
  }
  return `${r1(food.servingG)} ${base}`;
}

// How an amount reads in lists: "2 pieces · 28 g", "1.5 servings · 82.5 g", "150 g".
// `item` is a food or an entry (anything with baseUnit / servingG / servingUnit / servingQty).
export function amountText(amount, item = {}) {
  const base = item.baseUnit || 'g';
  if (base === 'pc') return plural(r2(amount), 'piece');
  if (item.servingUnit === 'pieces' && item.servingQty && item.servingG) {
    return `${plural(r2(amount / (item.servingG / item.servingQty)), 'piece')} · ${r1(amount)} ${base}`;
  }
  if (!item.servingG) return `${r1(amount)} ${base}`;
  return `${plural(r2(amount / item.servingG), 'serving')} · ${r1(amount)} ${base}`;
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

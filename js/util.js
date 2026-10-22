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
// "Today", "Yesterday", or "Mon, Oct 12"
export function dayName(s) {
  const t = dateStr();
  if (s === t) return 'Today';
  if (s === addDays(t, -1)) return 'Yesterday';
  return parseDate(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
// The day to show: a valid 'YYYY-MM-DD' that isn't in the future, otherwise today.
export function pickDay(d) {
  const t = dateStr();
  return /^\d{4}-\d{2}-\d{2}$/.test(d || '') && d <= t ? d : t;
}
// '?d=2026-10-12' for links, or '' when the day is today (keeps today's links clean)
export const dayQuery = (d) => (d && d !== dateStr() ? `?d=${d}` : '');

// ----- Numbers -----
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const r1 = (n) => Math.round(n * 10) / 10;
export function num(v) { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : 0; }
// ----- Units -----
// Each food is measured in a base unit:
//   'g'  grams (most foods)       'ml' millilitres (drinks, sauces measured by the spoon)
//   'pc' pieces (things you count, like cookies, when the weight isn't known)
// Serving sizes can be typed in g, ml, oz, fl oz, tsp, tbsp, cup or pieces and are converted to the base unit.
export const SERVING_UNITS = ['g', 'ml', 'oz', 'fl oz', 'tsp', 'tbsp', 'cup', 'pieces'];
// Spoons and cups use the sizes US nutrition labels use: 1 tsp = 5 ml, 1 tbsp = 15 ml, 1 cup = 240 ml.
export const SPOONS = { tsp: 5, tbsp: 15, cup: 240 };
export const isSpoon = (unit) => unit in SPOONS;
const TO_BASE = { g: 1, ml: 1, oz: 28.3495, 'fl oz': 29.5735, ...SPOONS };
export const baseOf = (unit) => (unit === 'ml' || unit === 'fl oz' || isSpoon(unit) ? 'ml' : 'g');
export const toBase = (qty, unit) => qty * (TO_BASE[unit] || 1);
// Finds a spoon/cup measure in label text: "2 Tbsp (32g)" -> { qty: 2, unit: 'tbsp' }, "1/4 cup" -> { qty: 0.25, unit: 'cup' }
export function spoonFromText(text) {
  const m = String(text || '').match(/(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(tsp|teaspoons?|tbsp|tbs|tablespoons?|cups?)\b/i);
  if (!m) return null;
  const qty = m[1].trim().split(/\s+/).reduce((a, part) => a + (part.includes('/') ? part.split('/')[0] / part.split('/')[1] : parseFloat(part)), 0);
  const w = m[2].toLowerCase();
  const unit = w.startsWith('c') ? 'cup' : /^(tsp|tea)/.test(w) ? 'tsp' : 'tbsp';
  return qty > 0 ? { qty: Math.round(qty * 1000) / 1000, unit } : null;
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const r2 = (n) => Math.round(n * 100) / 100;

// The ways you can enter an amount for a food. `per` = how many base units one of these is.
export function amountUnits(food) {
  const base = food.baseUnit || 'g';
  const units = [];
  const pieceSize = food.servingUnit === 'pieces' && food.servingQty ? food.servingG / food.servingQty : null;
  if (base === 'pc' || pieceSize) units.push({ key: 'pc', label: 'pieces', per: base === 'pc' ? 1 : pieceSize, step: 1 });
  // A serving that is exactly 1 piece would be the same button twice, so skip "servings" then
  const onePiece = food.servingUnit === 'pieces' && food.servingQty === 1;
  if (food.servingG && !onePiece) units.push({ key: 'serv', label: 'servings', per: food.servingG, step: 0.5 });
  if (base !== 'pc') units.push({ key: 'base', label: base, per: 1, step: 10 });
  // Ounces for weighed foods, fluid ounces for drinks
  if (base === 'g') units.push({ key: 'oz', label: 'oz', per: TO_BASE.oz, step: 0.5 });
  if (base === 'ml') units.push({ key: 'floz', label: 'fl oz', per: TO_BASE['fl oz'], step: 1 });
  // Spoons and cups. For weighed foods we need grams per ml: known when the label says e.g. "2 tbsp (32 g)"
  // (saved as food.gPerMl), otherwise we assume 1 g per ml and mark it as approximate.
  if (base !== 'pc') {
    const density = base === 'ml' ? 1 : food.gPerMl || 1;
    const approx = base === 'g' && !food.gPerMl;
    const steps = { tsp: 1, tbsp: 0.5, cup: 0.25 };
    for (const [k, ml] of Object.entries(SPOONS)) units.push({ key: k, label: k, per: ml * density, step: steps[k], spoon: true, approx });
  }
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
  // Logged in oz, fl oz, tsp, tbsp or cup: show it that way, e.g. "2 tbsp · 30 g"
  const u = ['oz', 'floz', 'tsp', 'tbsp', 'cup'].includes(item.unit) && amountUnits(item).find((x) => x.key === item.unit);
  if (u) return `${r2(amount / u.per)} ${u.label} · ${r1(amount)} ${base}`;
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

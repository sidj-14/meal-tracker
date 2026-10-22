// food-api.js — looking foods up online.
//
// Barcodes -> Open Food Facts (free, crowd-sourced, mostly packaged foods). No key needed.
// Search   -> USDA FoodData Central (free, generic foods like "banana, raw"). Needs an API key.
//             The app ships with a shared key (about 1,000 searches/hour for everyone together).
//             A key pasted in Settings is used instead, if there is one.
//
// Both return foods in the app's own shape: { id, name, brand, per100: {kcal,p,c,f}, servingG, barcode, source }.

import { kv } from './store.js';
import { r1, kcalFromMacros, spoonFromText, toBase } from './util.js';

const OFF = 'https://world.openfoodfacts.org/api/v2/product/';
const USDA = 'https://api.nal.usda.gov/fdc/v1/foods/search';
// Free api.data.gov key, built in so search works for everyone without setup. It's visible to anyone
// who reads this file; that's fine for a free, read-only key. If it gets abused, make a new one and swap it here.
const SHARED_KEY = 'bfq8jcWP9mThWQzJLGhcDNMkJfdmGnmr6HLNLMkJ';

export class LookupError extends Error {}

const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) && x >= 0 ? x : null; };

// How many pieces are in one serving, read from the label's serving text:
// "1 oz (28g/About 11 chips)" -> 11, "2 cookies (30 g)" -> 2, "1 bar (40g)" -> null (1 piece = 1 serving already).
const MEASURE = /^(ounces?|ozs?|fl|cups?|tbsps?|tsps?|tablespoons?|teaspoons?|grams?|mls?|liters?|litres?|kcal|cal|calories|mg|servings?|containers?|packages?|packs?|portions?)$/i;
export function piecesPerServing(text) {
  for (const m of String(text || '').matchAll(/(\d+(?:\.\d+)?)\s*([a-z]{3,})/gi)) {
    const count = parseFloat(m[1]);
    if (!MEASURE.test(m[2]) && count > 1 && count <= 200) return count;
  }
  return null;
}

// ---------- barcode ----------
// Returns { status: 'found', food } | { status: 'incomplete', name, brand } | { status: 'missing' }
export async function lookupBarcode(code) {
  let res;
  try {
    res = await fetch(`${OFF}${encodeURIComponent(code)}?fields=product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit`);
  } catch {
    throw new LookupError("Couldn't reach the food database. Check your internet connection.");
  }
  if (res.status === 404) return { status: 'missing' };
  if (!res.ok) throw new LookupError(`The food database didn't answer (error ${res.status}). Try again in a minute.`);
  const data = await res.json();
  const p = data.product;
  if (data.status !== 1 || !p) return { status: 'missing' };

  const name = (p.product_name || p.product_name_en || '').trim();
  const brand = (p.brands || '').split(',')[0].trim();
  const nm = p.nutriments || {};
  const prot = n(nm.proteins_100g), carb = n(nm.carbohydrates_100g), fat = n(nm.fat_100g);
  let kcal = n(nm['energy-kcal_100g']);
  if (kcal === null && n(nm.energy_100g) !== null) kcal = nm.energy_100g / 4.184; // energy_100g is in kJ
  if (kcal === null && prot !== null && carb !== null && fat !== null) kcal = kcalFromMacros(prot, carb, fat);

  if (!name || kcal === null || prot === null || carb === null || fat === null) return { status: 'incomplete', name, brand };
  const servingG = n(p.serving_quantity) || null;
  const pieces = servingG ? piecesPerServing(p.serving_size) : null;
  const isMl = /ml/i.test(p.serving_quantity_unit || '');
  // "2 tbsp (32 g)": remember the spoon size and how heavy it is, so you can log by the spoon
  const spoon = servingG && !pieces && !isMl ? spoonFromText(p.serving_size) : null;
  return {
    status: 'found',
    food: {
      id: `off-${code}`, name, brand, barcode: code, source: 'Open Food Facts',
      per100: { kcal: r1(kcal), p: r1(prot), c: r1(carb), f: r1(fat) },
      servingG,
      baseUnit: isMl ? 'ml' : 'g',
      ...(pieces ? { servingUnit: 'pieces', servingQty: pieces } : {}),
      ...(spoon ? { servingUnit: spoon.unit, servingQty: spoon.qty, gPerMl: r1(servingG / toBase(spoon.qty, spoon.unit) * 100) / 100 } : {}),
    },
  };
}

// ---------- search ----------
function nutrient(list, numbers, ids, nameStart, unit) {
  const hit = list.find((x) => numbers.includes(String(x.nutrientNumber)))
    || list.find((x) => ids.includes(x.nutrientId))
    || list.find((x) => (x.nutrientName || '').startsWith(nameStart) && (!unit || (x.unitName || '').toUpperCase() === unit));
  return hit ? n(hit.value ?? hit.amount) : null;
}

export async function searchUSDA(query) {
  const key = (await kv('usdaKey', '')).trim() || SHARED_KEY;
  const base = `${USDA}?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&pageSize=25`;
  let res;
  try {
    // Foundation + SR Legacy = generic foods (not brand-name products, which barcodes cover)
    res = await fetch(`${base}&dataType=${encodeURIComponent('Foundation,SR Legacy')}`);
    if (res.status === 400) res = await fetch(base); // fall back to all food types
  } catch {
    throw new LookupError("Couldn't reach the food database. Check your internet connection.");
  }
  if (res.status === 429 || res.status === 403) {
    throw new LookupError(key === SHARED_KEY
      ? 'Search limit reached for the hour. Try again later, or add your own free key in Settings → Food search key.'
      : 'Search key not accepted or limit reached. Check Settings → Food search key.');
  }
  if (!res.ok) throw new LookupError(`Food search failed (error ${res.status}). Try again in a minute.`);
  const data = await res.json();

  return (data.foods || []).map((f) => {
    const list = f.foodNutrients || [];
    const p = nutrient(list, ['203'], [1003], 'Protein');
    const c = nutrient(list, ['205'], [1005], 'Carbohydrate, by difference');
    const fat = nutrient(list, ['204'], [1004], 'Total lipid');
    let kcal = nutrient(list, ['208'], [1008], 'Energy', 'KCAL');
    if (kcal === null) kcal = nutrient(list, ['957', '958'], [2047, 2048], 'Energy (Atwater', 'KCAL');
    if (kcal === null && p !== null && c !== null && fat !== null) kcal = kcalFromMacros(p, c, fat);
    if (kcal === null) return null;
    const name = f.description.charAt(0) + f.description.slice(1).toLowerCase();
    return {
      id: `usda-${f.fdcId}`, name, brand: f.brandOwner || '', source: 'USDA',
      per100: { kcal: r1(kcal), p: r1(p || 0), c: r1(c || 0), f: r1(fat || 0) },
      servingG: null,
    };
  }).filter(Boolean);
}

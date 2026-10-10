// food-api.js — looking foods up online.
//
// Barcodes -> Open Food Facts (free, crowd-sourced, mostly packaged foods). No key needed.
// Search   -> USDA FoodData Central (free, generic foods like "banana, raw"). Needs an API key;
//             "DEMO_KEY" works for light use (30 searches/hour, 50/day). Add your own free key in Settings.
//
// Both return foods in the app's own shape: { id, name, brand, per100: {kcal,p,c,f}, servingG, barcode, source }.

import { kv } from './store.js';
import { r1, kcalFromMacros } from './util.js';

const OFF = 'https://world.openfoodfacts.org/api/v2/product/';
const USDA = 'https://api.nal.usda.gov/fdc/v1/foods/search';

export class LookupError extends Error {}

const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) && x >= 0 ? x : null; };

// ---------- barcode ----------
// Returns { status: 'found', food } | { status: 'incomplete', name, brand } | { status: 'missing' }
export async function lookupBarcode(code) {
  let res;
  try {
    res = await fetch(`${OFF}${encodeURIComponent(code)}?fields=product_name,product_name_en,brands,nutriments,serving_quantity,serving_quantity_unit`);
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
  return {
    status: 'found',
    food: {
      id: `off-${code}`, name, brand, barcode: code, source: 'Open Food Facts',
      per100: { kcal: r1(kcal), p: r1(prot), c: r1(carb), f: r1(fat) },
      servingG: n(p.serving_quantity) || null,
      baseUnit: /ml/i.test(p.serving_quantity_unit || '') ? 'ml' : 'g',
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
  const key = (await kv('usdaKey', '')).trim() || 'DEMO_KEY';
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
    throw new LookupError(key === 'DEMO_KEY'
      ? 'Free search limit reached for now. Add your own free key in Settings → Food search key.'
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

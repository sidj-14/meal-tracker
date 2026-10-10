// store.js — the app's data rules, built on top of db.js.
// Screens call these functions; they never talk to IndexedDB directly.

import * as db from './db.js';
import { dateStr, uid, scale } from './util.js';

export const BUILTIN_GROUPS = ['Breakfast', 'Lunch', 'Dinner'];

// ---------- key/value settings ----------
export async function kv(key, fallback) {
  const v = await db.get('kv', key);
  return v === undefined ? fallback : v;
}
export const setKV = (key, value) => db.put('kv', value, key);

export const getProfile = () => kv('profile', { name: '', age: '', ft: '', inch: '', lb: '' });
export const setProfile = (p) => setKV('profile', p);
export const getWeekStart = () => kv('weekStart', 'mon');
export const getGroups = () => kv('groups', []);           // custom groups only
export const setGroups = (g) => setKV('groups', g);

// ---------- targets ----------
// Stored as a list of { from: 'YYYY-MM-DD', kcal, p, c, f }.
// A target applies from its `from` date until the next one starts, so past days keep old targets.
export async function getTargets() {
  const list = await kv('targets', []);
  return list.slice().sort((a, b) => (a.from < b.from ? -1 : 1));
}
export function targetOn(list, date) {
  let t = null;
  for (const x of list) if (x.from <= date) t = x;
  return t || list[0] || null;
}
export async function saveTarget({ kcal, p, c, f }) {
  const from = dateStr();
  const list = (await getTargets()).filter((x) => x.from !== from); // re-saving today replaces today's
  list.push({ from, kcal, p, c, f });
  await setKV('targets', list);
}

// ---------- foods ----------
// { id, name, brand, per100: { kcal, p, c, f }, servingG, barcode, fav, lastUsed, lastGrams }
export const allFoods = () => db.all('foods');
export const getFood = (id) => db.get('foods', id);
export async function saveFood(food) {
  food.id = food.id || uid();
  food.createdAt = food.createdAt || Date.now();
  await db.put('foods', food);
  return food;
}
export const deleteFood = (id) => db.del('foods', id);

// ---------- entries (what you ate) ----------
// Each entry keeps a copy of the food's per-100 g values, so editing a food later
// doesn't silently change what you logged in the past.
export const entriesOn = (date) => db.byIndex('entries', 'date', IDBKeyRange.only(date));
export const entriesBetween = (from, to) => db.byIndex('entries', 'date', IDBKeyRange.bound(from, to));

export async function addEntry(food, grams, group) {
  const entry = {
    id: uid(), date: dateStr(), createdAt: Date.now(),
    foodId: food.id, name: food.name, per100: { ...food.per100 },
    grams, servingG: food.servingG || null, baseUnit: food.baseUnit || 'g', group: group || null, ...scale(food.per100, grams),
  };
  await db.put('entries', entry);
  await db.put('foods', { ...food, lastUsed: Date.now(), lastGrams: grams });
  return entry;
}
export async function updateEntry(entry, grams, group) {
  await db.put('entries', { ...entry, grams, group: group || null, ...scale(entry.per100, grams) });
}
export const deleteEntry = (id) => db.del('entries', id);

// ---------- backup ----------
export async function exportAll() {
  return {
    app: 'meal-tracker', format: 1, exportedAt: new Date().toISOString(),
    kv: await db.pairs('kv'), foods: await db.all('foods'), entries: await db.all('entries'),
  };
}
export async function importAll(data) {
  if (!data || data.app !== 'meal-tracker') throw new Error('Not a Meal Tracker backup file');
  await Promise.all([db.clear('kv'), db.clear('foods'), db.clear('entries')]);
  for (const [k, v] of data.kv || []) await db.put('kv', v, k);
  for (const f of data.foods || []) await db.put('foods', f);
  for (const e of data.entries || []) await db.put('entries', e);
}

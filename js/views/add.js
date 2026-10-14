// Add food — re-add something you logged before (Recent, by day), pick from Favorites or
// My foods, search the USDA database, scan a barcode, or create a food. Choosing a food opens
// the amount sheet, which adds the entry to today (and saves the food to My foods for next time).

import { allFoods, getFood, saveFood, getTargets, targetOn, entriesOn, entriesBetween, addEntry } from '../store.js';
import { esc, fmt, r1, sum, scale, dateStr, addDays, longDate, amountText, ICON } from '../util.js';
import { back, go, replace, amountSheet, closeSheet, toast } from '../ui.js';
import { lookupBarcode, searchUSDA, LookupError } from '../food-api.js';
import { scanFromPhoto } from '../scanner.js';

export default async function add(el, params) {
  const today = dateStr();
  let [foods, history] = await Promise.all([allFoods(), entriesBetween(addDays(today, -21), today)]);
  history.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
  let tab = params.get('tab') || (history.length ? 'recent' : 'mine');
  let query = '';
  let online = { query: '', loading: false, results: null, error: '' }; // USDA search state

  el.innerHTML = `<div class="screen">
    <header class="head row between">
      <button class="link" data-act="cancel">Cancel</button>
      <h1 class="h2">Add food</h1>
      <span style="width:52px"></span>
    </header>
    <div class="stack gap14" style="padding:14px 24px 0">
      <div class="row gap8">
        <form class="search" data-o="form" role="search">${ICON.search}<input type="search" enterkeyhint="search" placeholder="Search foods" aria-label="Search foods" data-o="q" autocomplete="off"></form>
        <label class="iconbtn" aria-label="Scan barcode" style="cursor:pointer">${ICON.barcode}
          <input type="file" accept="image/*" capture="environment" hidden data-o="scan"></label>
      </div>
      <div class="chips" data-o="tabs"></div>
    </div>
    <div class="body" data-o="list" style="gap:8px"></div>
  </div>`;

  const $ = (k) => el.querySelector(`[data-o="${k}"]`);

  function visibleFoods() {
    const q = query.trim().toLowerCase();
    if (q) return foods.filter((f) => `${f.name} ${f.brand || ''}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    if (tab === 'fav') return foods.filter((f) => f.fav).sort((a, b) => a.name.localeCompare(b.name));
    return foods.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  const row = (f, { saved = true } = {}) => {
    const g = f.lastGrams || f.servingG || 100;
    const m = scale(f.per100, g);
    return `<div class="food-row">
      <button class="list-item grow" data-act="${saved ? 'pick' : 'pickOnline'}" data-id="${esc(f.id)}">
        <span class="grow"><span class="name">${esc(f.name)}${f.brand ? ` <span class="muted" style="font-weight:400">· ${esc(f.brand)}</span>` : ''}</span>
        <span class="sub">${amountText(g, f)} · P ${r1(m.p)} · C ${r1(m.c)} · F ${r1(m.f)}</span></span>
        <span class="kcal">${fmt(m.kcal)}</span>
      </button>
      ${saved ? `<button class="star ${f.fav ? 'on' : ''}" data-act="fav" data-id="${esc(f.id)}" aria-label="${f.fav ? 'Remove from' : 'Add to'} favorites" aria-pressed="${!!f.fav}">${f.fav ? '★' : '☆'}</button>` : ''}
      ${saved && tab === 'mine' && !query ? `<a class="star" style="display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:13px;color:var(--muted);width:48px" href="#/create?edit=${esc(f.id)}" aria-label="Edit ${esc(f.name)}">Edit</a>` : ''}
    </div>`;
  };

  function onlineSection() {
    const q = query.trim();
    if (q.length < 2) return '';
    if (online.loading) return `<div class="empty" style="padding:16px">Searching the USDA database…</div>`;
    if (online.error) return `<div class="empty" style="padding:16px">${esc(online.error)}</div>`;
    if (online.results && online.query === q) {
      if (!online.results.length) return `<div class="empty" style="padding:16px">No USDA results for “${esc(q)}”.<a class="btn soft sm" href="#/create?name=${encodeURIComponent(q)}">Create it yourself</a></div>`;
      return `<span class="small muted" style="padding:10px 4px 2px">USDA database · per 100 g</span>${online.results.map((f) => row(f, { saved: false })).join('')}
        <span class="note center-text" style="padding:8px">Generic foods from USDA FoodData Central. Scan a barcode for packaged products.</span>`;
    }
    return `<button class="btn soft" data-act="searchOnline" style="flex-shrink:0">${ICON.search} Search all foods for “${esc(q)}”</button>`;
  }

  // ----- Recent: what you logged on previous days, by day and group, ready to add again -----
  function dayLabel(d) {
    if (d === today) return 'Today';
    if (d === addDays(today, -1)) return 'Yesterday';
    return longDate(d);
  }
  function recentSection() {
    if (!history.length) return '<div class="empty">Things you log will show up here by day, so you can add them again with one tap.</div>';
    const days = [];
    for (const e of history) {
      let day = days[days.length - 1];
      if (!day || day.date !== e.date) { day = { date: e.date, groups: new Map(), loose: [] }; days.push(day); }
      if (e.group) { if (!day.groups.has(e.group)) day.groups.set(e.group, []); day.groups.get(e.group).push(e); } else day.loose.push(e);
    }
    const item = (e) => `<button class="list-item" data-act="again" data-id="${esc(e.id)}">
      <span class="grow"><span class="name">${esc(e.name)}</span><span class="sub">${amountText(e.grams, e)} · P ${r1(e.p)} · C ${r1(e.c)} · F ${r1(e.f)}</span></span>
      <span class="kcal">${fmt(e.kcal)}</span></button>`;
    return days.slice(0, 14).map((day) => `
      <div class="stack gap8" style="flex-shrink:0">
        <span class="small muted" style="padding:6px 4px 0;text-transform:uppercase;letter-spacing:.04em">${dayLabel(day.date)}</span>
        ${[...day.groups].map(([g, items]) => `
          <div class="row between" style="padding:2px 4px 0"><span class="title" style="font-size:14px">${esc(g)} <span class="muted" style="font-weight:400">· ${fmt(sum(items).kcal)} kcal</span></span>
            <button class="chip" data-act="againAll" data-date="${day.date}" data-g="${esc(g)}">Add all</button></div>
          ${items.map(item).join('')}`).join('')}
        ${day.loose.map(item).join('')}
      </div>`).join('')
      + '<span class="note center-text" style="padding:8px">Tap an item to add it to today. You can change the amount and group before adding.</span>';
  }

  // A logged entry carries a copy of its food, so it can be re-added even if the food was deleted.
  const foodOf = async (e) => (await getFood(e.foodId)) || {
    id: e.foodId, name: e.name, per100: e.per100, servingG: e.servingG, baseUnit: e.baseUnit,
    servingQty: e.servingQty, servingUnit: e.servingUnit,
  };

  function render() {
    const tabBtn = (key, label) => `<button class="chip ${tab === key && !query ? 'on' : ''}" data-act="tab" data-tab="${key}">${label}</button>`;
    $('tabs').innerHTML = tabBtn('recent', 'Recent') + tabBtn('fav', 'Favorites') + tabBtn('mine', 'My foods')
      + '<a class="chip dashed link-chip" href="#/create">Create</a>';

    const list = visibleFoods();
    let html = '';
    if (query.trim()) {
      html = (list.length ? `<span class="small muted" style="padding:0 4px 2px">My foods</span>${list.map((f) => row(f)).join('')}` : '') + onlineSection();
    } else if (tab === 'recent') {
      html = recentSection();
    } else if (!foods.length) {
      html = `<div class="empty">No foods saved yet.<br>Search above, scan a barcode, or create one from its label.<a class="btn primary sm" href="#/create">Create a food</a></div>`;
    } else if (!list.length) {
      html = `<div class="empty">${tab === 'fav' ? 'No favorites yet. Open any food and tap “☆ Add to favorites”, or tap the ☆ next to a food in My foods.' : 'Foods you log will show up here.'}</div>`;
    } else {
      html = list.map((f) => row(f)).join('');
    }
    $('list').innerHTML = html;
  }

  async function pick(food, note, preset = {}) {
    const saved = await getFood(food.id); // an online food you've used before keeps your favorite/last amount
    const f = saved || food;
    const date = dateStr();
    const [targetList, entries] = await Promise.all([getTargets(), entriesOn(date)]);
    const t = targetOn(targetList, date) || { kcal: 0, p: 0 };
    const eaten = sum(entries);
    amountSheet({
      food: f, grams: preset.grams || f.lastGrams || f.servingG || null, group: preset.group || null,
      mode: 'add', note: saved ? '' : note,
      remaining: { kcal: t.kcal - eaten.kcal, p: t.p - eaten.p },
      onSubmit: async (grams, group) => {
        await addEntry(f, grams, group); // also saves the food to My foods
        toast(`Added ${f.name}`);
        replace('#/today');
      },
    });
  }

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    online = { query: q, loading: true, results: null, error: '' };
    render();
    try {
      const results = await searchUSDA(q);
      if (query.trim() === q) online = { query: q, loading: false, results, error: '' };
    } catch (err) {
      online = { query: q, loading: false, results: null, error: err instanceof LookupError ? err.message : 'Search failed. Try again.' };
    }
    if (query.trim() === q) render();
  }

  async function handleBarcode(code, setStatus) {
    // 1) Already saved (scanned before, or created by you with this barcode)?
    const mine = foods.find((f) => f.barcode === code);
    if (mine) { closeSheet(); pick(mine); return; }
    // 2) Look it up online.
    try {
      const r = await lookupBarcode(code);
      if (r.status === 'found') {
        closeSheet();
        pick(r.food, `From Open Food Facts · check against the label`);
      } else {
        closeSheet();
        toast(r.status === 'incomplete' ? 'Found it, but nutrition is missing. Add it from the label.' : 'Not in the database yet. Add it from the label once.');
        const q = new URLSearchParams({ barcode: code });
        if (r.name) q.set('name', r.name);
        if (r.brand) q.set('brand', r.brand);
        go(`#/create?${q}`);
      }
    } catch (err) {
      setStatus(err.message || 'Lookup failed.');
      setTimeout(() => { closeSheet(); go(`#/create?barcode=${code}`); }, 1800);
    }
  }

  $('q').addEventListener('input', (e) => { query = e.target.value; if (online.query !== query.trim()) online = { query: '', loading: false, results: null, error: '' }; render(); });
  // Barcode: the phone's own camera takes a photo (no permission prompt), then we read the code from it.
  $('scan').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) scanFromPhoto(file, handleBarcode);
  });
  $('form').addEventListener('submit', (e) => { e.preventDefault(); $('q').blur(); runSearch(); });

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'cancel') back();
    if (act === 'searchOnline') runSearch();
    if (act === 'tab') { tab = b.dataset.tab; query = ''; $('q').value = ''; foods = await allFoods(); render(); } // re-read: favorites may have changed
    if (act === 'pick') pick(foods.find((f) => f.id === b.dataset.id));
    if (act === 'again') {
      const e = history.find((x) => x.id === b.dataset.id);
      pick(await foodOf(e), '', { grams: e.grams, group: e.group });
    }
    if (act === 'againAll') {
      const items = history.filter((x) => x.date === b.dataset.date && x.group === b.dataset.g).reverse(); // original order
      for (const e of items) await addEntry(await foodOf(e), e.grams, e.group);
      toast(`Added ${b.dataset.g} (${items.length} item${items.length === 1 ? '' : 's'})`);
      replace('#/today');
    }
    if (act === 'pickOnline') pick(online.results.find((f) => f.id === b.dataset.id), 'From USDA FoodData Central');
    if (act === 'fav') {
      const f = foods.find((x) => x.id === b.dataset.id);
      f.fav = !f.fav;
      await saveFood(f);
      render();
    }
  };

  render();
  // Coming back from "Create food" opens the food you just made.
  const preselect = params.get('food') || sessionStorage.getItem('pickFood');
  sessionStorage.removeItem('pickFood');
  if (preselect) { const f = await getFood(preselect); if (f) pick(f); }
}

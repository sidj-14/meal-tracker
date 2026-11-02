// Add food — re-add something you logged before (Recent, by day), pick from My foods, search the USDA database, scan a barcode, or create a food. Choosing a food opens
// the amount sheet, which adds the entry to today (and saves the food to My foods for next time).

import { allFoods, getFood, saveFood, getTargets, targetOn, entriesOn, entriesBetween, addEntry, deleteEntry, getGroups, BUILTIN_GROUPS } from '../store.js';
import { esc, fmt, r1, sum, scale, dateStr, addDays, longDate, dayName, pickDay, dayQuery, amountText, ICON } from '../util.js';
import { back, go, replace, amountSheet, openSheet, closeSheet, toast, star, rememberFoods } from '../ui.js';
import { lookupBarcode, searchUSDA, LookupError } from '../food-api.js';
import { barcodeMenu } from '../scanner.js';

let favListener = null; // the one live 'star changed' listener for this screen

export default async function add(el, params) {
  const today = dateStr();
  const day = pickDay(params.get('d'));            // the day you're adding to (today unless you came from an earlier day)
  const dayLabel = day === today ? 'today' : day === addDays(today, -1) ? 'yesterday' : dayName(day);
  const backToDay = () => replace(`#/today${dayQuery(day)}`);
  let [foods, history] = await Promise.all([allFoods(), entriesBetween(addDays(today, -21), today)]);
  history.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
  let tab = params.get('tab') || (history.length ? 'recent' : 'mine');
  rememberFoods(history.filter((e) => e.foodId).map((e) => ({ id: e.foodId, name: e.name, per100: e.per100, servingG: e.servingG, baseUnit: e.baseUnit, servingQty: e.servingQty, servingUnit: e.servingUnit, gPerMl: e.gPerMl })));
  let query = '';
  let online = { query: '', loading: false, results: null, error: '' }; // USDA search state
  // Select mode on Recent: press and hold an item to start, then tap to tick more, then Add them together
  let selecting = false;
  const selected = new Set(); // entry ids

  el.innerHTML = `<div class="screen">
    <header class="head row between">
      <button class="link" data-act="cancel">Cancel</button>
      <div class="stack" style="align-items:center"><h1 class="h2">Add food</h1>${day === today ? '' : `<span class="note">to ${esc(dayName(day))}</span>`}</div>
      <span style="width:52px"></span>
    </header>
    <div class="stack gap14" style="padding:14px 24px 0">
      <div class="row gap8">
        <form class="search" data-o="form" role="search">${ICON.search}<input type="search" enterkeyhint="search" placeholder="Search foods" aria-label="Search foods" data-o="q" autocomplete="off"><button type="button" class="clear-q" data-act="clearq" aria-label="Clear search" hidden>${ICON.close}</button></form>
        <button class="iconbtn" data-act="barcode" aria-label="Add by barcode" style="cursor:pointer;border:0">${ICON.barcode}</button>
      </div>
      <div class="chips" data-o="tabs"></div>
    </div>
    <div class="body" data-o="list" style="gap:8px"></div>
    <div class="select-bar" data-o="selbar" hidden></div>
  </div>`;

  const $ = (k) => el.querySelector(`[data-o="${k}"]`);

  function visibleFoods() {
    const q = query.trim().toLowerCase();
    if (q) return foods.filter((f) => `${f.name} ${f.brand || ''}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    return foods.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  const isFav = (id) => foods.some((f) => f.id === id && f.fav);
  const row = (f, { saved = true } = {}) => {
    const g = f.lastGrams || f.servingG || 100;
    const m = scale(f.per100, g);
    return `<div class="food-row">
      <button class="list-item grow" data-act="${saved ? 'pick' : 'pickOnline'}" data-id="${esc(f.id)}">
        <span class="grow"><span class="name">${esc(f.name)}${f.brand ? ` <span class="muted" style="font-weight:400">· ${esc(f.brand)}</span>` : ''}</span>
        <span class="sub">${amountText(g, f)} · P ${r1(m.p)} · C ${r1(m.c)} · F ${r1(m.f)}</span></span>
        ${star(f.id, isFav(f.id))}<span class="kcal">${fmt(m.kcal)}</span>
      </button>
      ${saved && tab === 'mine' && !query ? `<a class="edit-link" href="#/create?edit=${esc(f.id)}" aria-label="Edit ${esc(f.name)}">Edit</a>` : ''}
    </div>`;
  };

  // A favorite: tap the row to open the amount sheet, or ＋ to add it straight away with your usual amount
  const favRow = (f) => {
    const g = f.lastGrams || f.servingG || 100;
    const m = scale(f.per100, g);
    return `<div class="food-row">
      <button class="list-item grow" data-act="pick" data-id="${esc(f.id)}">
        <span class="grow"><span class="name">${esc(f.name)}</span>
        <span class="sub">${amountText(g, { ...f, unit: f.lastUnit })} · ${fmt(m.kcal)} kcal${f.lastGroup ? ` · ${esc(f.lastGroup)}` : ''}</span></span>
        ${star(f.id, true)}
      </button>
      <button class="quick-add" data-act="quick" data-id="${esc(f.id)}" aria-label="Add ${esc(f.name)} now">＋</button>
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
  function recentDayName(d) {
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
    const item = (e) => `<button class="list-item recent-item ${selected.has(e.id) ? 'sel' : ''}" data-act="again" data-id="${esc(e.id)}" ${selecting ? `aria-pressed="${selected.has(e.id)}"` : ''}>
      ${selecting ? '<span class="tick" aria-hidden="true"></span>' : ''}
      <span class="grow"><span class="name">${esc(e.name)}</span><span class="sub">${amountText(e.grams, e)} · P ${r1(e.p)} · C ${r1(e.c)} · F ${r1(e.f)}</span></span>
      ${e.foodId ? star(e.foodId, isFav(e.foodId)) : ''}<span class="kcal">${fmt(e.kcal)}</span></button>`;
    return days.slice(0, 14).map((day) => `
      <div class="stack gap8" style="flex-shrink:0">
        <span class="small muted" style="padding:6px 4px 0;text-transform:uppercase;letter-spacing:.04em">${recentDayName(day.date)}</span>
        ${[...day.groups].map(([g, items]) => `
          <div class="row between" style="padding:2px 4px 0"><span class="title" style="font-size:14px">${esc(g)} <span class="muted" style="font-weight:400">· ${fmt(sum(items).kcal)} kcal</span></span>
            ${selecting ? '' : `<button class="chip" data-act="againAll" data-date="${day.date}" data-g="${esc(g)}">Add all</button>`}</div>
          ${items.map(item).join('')}`).join('')}
        ${day.loose.map(item).join('')}
      </div>`).join('')
      + `<span class="note center-text" style="padding:8px">${selecting ? 'Tap items to select or unselect them.' : `Tap an item to add it to ${esc(dayLabel)}. Press and hold to select several.`}</span>`;
  }

  // A logged entry carries a copy of its food, so it can be re-added even if the food was deleted.
  const foodOf = async (e) => (await getFood(e.foodId)) || {
    id: e.foodId, name: e.name, per100: e.per100, servingG: e.servingG, baseUnit: e.baseUnit,
    servingQty: e.servingQty, servingUnit: e.servingUnit, gPerMl: e.gPerMl,
  };

  function renderSelBar() {
    const bar = $('selbar');
    bar.hidden = !selecting;
    if (!selecting) return;
    const items = history.filter((e) => selected.has(e.id));
    const t = sum(items);
    bar.innerHTML = `<button class="link" data-act="selCancel">Cancel</button>
      <span class="stack" style="align-items:center;min-width:0"><b style="font-size:15px">${items.length} selected</b><span class="note" style="font-size:12px">${fmt(t.kcal)} kcal · P ${fmt(t.p)} · C ${fmt(t.c)} · F ${fmt(t.f)}</span></span>
      <button class="btn primary sm" data-act="selAdd" ${items.length ? '' : 'disabled'}>Add</button>`;
  }
  function stopSelecting() { selecting = false; selected.clear(); }

  function render() {
    if (selecting && (tab !== 'recent' || query.trim())) stopSelecting(); // select mode is only for Recent
    renderSelBar();
    const tabBtn = (key, label) => `<button class="chip ${tab === key && !query ? 'on' : ''}" data-act="tab" data-tab="${key}">${label}</button>`;
    const favs = foods.filter((f) => f.fav);
    if (tab === 'favs' && !favs.length) tab = 'recent';
    $('tabs').innerHTML = (favs.length ? tabBtn('favs', 'Favorites') : '') + tabBtn('recent', 'Recent') + tabBtn('mine', 'My foods')
      + '<a class="chip dashed link-chip" href="#/create">Create</a>';

    const list = visibleFoods();
    let html = '';
    if (query.trim()) {
      html = (list.length ? `<span class="small muted" style="padding:0 4px 2px">My foods</span>${list.map((f) => row(f)).join('')}` : '') + onlineSection();
    } else if (tab === 'favs') {
      html = favs.sort((a, b) => a.name.localeCompare(b.name)).map((f) => favRow(f)).join('')
        + `<span class="note center-text" style="padding:8px">Tap ＋ to add with your usual amount, or tap the food to change it first. Tap ★ on a food's sheet to add or remove favorites.</span>`;
    } else if (tab === 'recent') {
      html = recentSection();
    } else if (!foods.length) {
      html = `<div class="empty">No foods saved yet.<br>Search above, scan a barcode, or create one from its label.<a class="btn primary sm" href="#/create">Create a food</a></div>`;
    } else if (!list.length) {
      html = `<div class="empty">Foods you log will show up here.</div>`;
    } else {
      html = list.map((f) => row(f)).join('');
    }
    $('list').innerHTML = html;
  }

  async function pick(food, note, preset = {}) {
    const saved = await getFood(food.id); // an online food you've used before keeps your last amount
    const f = saved || food;
    const [targetList, entries] = await Promise.all([getTargets(), entriesOn(day)]);
    const t = targetOn(targetList, day) || { kcal: 0, p: 0 };
    const eaten = sum(entries);
    amountSheet({
      food: f, grams: preset.grams || f.lastGrams || f.servingG || null, group: preset.group || null,
      mode: 'add', note: saved ? '' : note, dayLabel,
      remaining: { kcal: t.kcal - eaten.kcal, p: t.p - eaten.p },
      // Label a bit different from the database? Fix the numbers, then come back here to add it.
      onEditFood: async (cur) => {
        const savedNow = await saveFood({ ...cur }); // keep it in My foods so the fix sticks (and next scan finds it)
        closeSheet();
        go(`#/create?edit=${encodeURIComponent(savedNow.id)}&basis=serving&then=pick`);
      },
      onSubmit: async (grams, group, unit, food) => {
        await addEntry({ ...food, lastUnit: unit }, grams, group, day); // also saves the food to My foods
        toast(`Added ${f.name}`);
        backToDay();
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
      rememberFoods(results); // so their stars can save them to My foods
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

  // The ✕ in the search box shows only when there's text to clear
  const showClear = () => { el.querySelector('[data-act="clearq"]').hidden = !query; };
  $('q').addEventListener('input', (e) => { query = e.target.value; showClear(); if (online.query !== query.trim()) online = { query: '', loading: false, results: null, error: '' }; render(); });
  $('form').addEventListener('submit', (e) => { e.preventDefault(); $('q').blur(); runSearch(); });

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'cancel') back();
    if (act === 'searchOnline') runSearch();
    // Barcode: choose take a photo / pick from Photos / type the number (photos need no camera permission)
    if (act === 'barcode') barcodeMenu(handleBarcode);
    if (act === 'tab') { tab = b.dataset.tab; query = ''; $('q').value = ''; showClear(); render(); }
    if (act === 'clearq') {
      query = ''; $('q').value = ''; showClear();
      online = { query: '', loading: false, results: null, error: '' };
      render(); $('q').focus(); // keep the keyboard up for the next search
    }
    if (act === 'pick') pick(foods.find((f) => f.id === b.dataset.id));
    if (act === 'quick') {
      // One tap: same amount, unit and group as last time; stay here so you can add more
      const f = foods.find((x) => x.id === b.dataset.id);
      const g = f.lastGrams || f.servingG || 100;
      const entry = await addEntry({ ...f, lastUnit: f.lastUnit }, g, f.lastGroup || null, day);
      b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 900);
      toast(`Added ${f.name} to ${f.lastGroup || dayLabel}`, { action: 'Undo', onAction: async () => { await deleteEntry(entry.id); toast('Removed'); } });
    }
    if (act === 'again' && selecting) {
      const id = b.dataset.id;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      if (!selected.size) stopSelecting(); // unticking the last one leaves select mode
      render(); return;
    }
    if (act === 'selCancel') { stopSelecting(); render(); return; }
    if (act === 'selAdd') { addSelected(); return; }
    if (act === 'again') {
      const e = history.find((x) => x.id === b.dataset.id);
      pick(await foodOf(e), '', { grams: e.grams, group: e.group });
    }
    if (act === 'againAll') {
      const items = history.filter((x) => x.date === b.dataset.date && x.group === b.dataset.g).reverse(); // original order
      for (const e of items) await addEntry(await foodOf(e), e.grams, e.group, day);
      toast(`Added ${b.dataset.g} (${items.length} item${items.length === 1 ? '' : 's'})`);
      backToDay();
    }
    if (act === 'pickOnline') pick(online.results.find((f) => f.id === b.dataset.id), 'From USDA FoodData Central');
  };

  // ----- Press and hold on a Recent item to start selecting -----
  let holdTimer = null, holdStart = null, justHeld = false;
  const list = $('list');
  list.addEventListener('pointerdown', (e) => {
    justHeld = false; // a new touch: forget the last long press (iPhone doesn't always send a tap after one)
    const b = e.target.closest('.recent-item');
    if (!b || selecting) return;
    holdStart = { x: e.clientX, y: e.clientY };
    holdTimer = setTimeout(() => {
      holdTimer = null; justHeld = true;
      selecting = true; selected.add(b.dataset.id);
      if (navigator.vibrate) navigator.vibrate(10);
      render();
    }, 450);
  });
  const cancelHold = () => { clearTimeout(holdTimer); holdTimer = null; };
  list.addEventListener('pointermove', (e) => { // moving the finger = scrolling, not holding
    if (holdTimer && holdStart && Math.hypot(e.clientX - holdStart.x, e.clientY - holdStart.y) > 10) cancelHold();
  });
  list.addEventListener('pointerup', cancelHold);
  list.addEventListener('pointercancel', cancelHold);
  list.addEventListener('contextmenu', (e) => { if (e.target.closest('.recent-item')) e.preventDefault(); });
  // The tap that ends a long press shouldn't also open the amount sheet or untick the item
  el.addEventListener('click', (e) => { if (justHeld) { justHeld = false; e.stopPropagation(); e.preventDefault(); } }, true);

  async function addSelected() {
    const items = history.filter((e) => selected.has(e.id)).reverse(); // oldest first, like you logged them
    const t = sum(items);
    const groups = BUILTIN_GROUPS.concat(await getGroups());
    let choice = 'keep'; // 'keep' = each item goes back into the group it was in
    const sheet = openSheet(`<div class="sheet-pad">
      <div class="handle"></div>
      <div class="stack"><span class="h2">Add ${items.length} item${items.length === 1 ? '' : 's'}</span>
        <span class="note" style="font-size:13px">${fmt(t.kcal)} kcal · P ${fmt(t.p)} · C ${fmt(t.c)} · F ${fmt(t.f)} · same amounts as before</span></div>
      <div class="stack gap6">${items.map((e) => `<div class="row between" style="font-size:14px"><span>${esc(e.name)} <span class="muted">· ${amountText(e.grams, e)}</span></span><span class="muted">${fmt(e.kcal)}</span></div>`).join('')}</div>
      <div class="stack gap8"><span class="muted">Group</span><div class="chips" data-o="g"></div></div>
      <button class="btn primary" data-act="go" data-o="go"></button>
    </div>`);
    const draw = () => {
      sheet.querySelector('[data-o="g"]').innerHTML = [['keep', 'As before'], ['none', 'No group'], ...groups.map((g) => [g, g])]
        .map(([v, label]) => `<button class="chip ${choice === v ? 'on' : ''}" data-act="g" data-v="${esc(v)}">${esc(label)}</button>`).join('');
      sheet.querySelector('[data-o="go"]').textContent = choice === 'keep' || choice === 'none' ? `Add to ${dayLabel}` : `Add to ${choice}`;
    };
    draw();
    sheet.onclick = async (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'g') { choice = b.dataset.v; draw(); }
      if (b.dataset.act === 'go') {
        b.disabled = true;
        for (const e of items) {
          const group = choice === 'keep' ? e.group : choice === 'none' ? null : choice;
          const f = await foodOf(e);
          await addEntry({ ...f, lastUnit: e.unit || f.lastUnit }, e.grams, group, day);
        }
        closeSheet();
        toast(`Added ${items.length} item${items.length === 1 ? '' : 's'}`);
        backToDay();
      }
    };
  }

  // A star was tapped somewhere (a row or the amount sheet): refresh the list, keeping your place
  const onFavChange = async () => {
    if (!el.isConnected || !location.hash.startsWith('#/add')) { window.removeEventListener('favchange', onFavChange); return; }
    foods = await allFoods();
    const body = $('list'), y = body.scrollTop;
    render(); body.scrollTop = y;
  };
  if (favListener) window.removeEventListener('favchange', favListener);
  favListener = onFavChange;
  window.addEventListener('favchange', onFavChange);

  render();
  // Coming back from "Create food" opens the food you just made.
  const preselect = params.get('food') || sessionStorage.getItem('pickFood');
  sessionStorage.removeItem('pickFood');
  if (preselect) { const f = await getFood(preselect); if (f) pick(f); }
}

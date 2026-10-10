// Add food — pick from your saved foods (Recent / Favorites / My foods), or create a new one.
// Choosing a food opens the amount sheet, which adds the entry to today.

import { allFoods, getFood, saveFood, getTargets, targetOn, entriesOn, addEntry } from '../store.js';
import { esc, fmt, r1, sum, scale, dateStr, ICON } from '../util.js';
import { back, replace, amountSheet, toast } from '../ui.js';

export default async function add(el, params) {
  let foods = await allFoods();
  let tab = params.get('tab') || (foods.some((f) => f.lastUsed) ? 'recent' : 'mine');
  let query = '';

  el.innerHTML = `<div class="screen">
    <header class="head row between">
      <button class="link" data-act="cancel">Cancel</button>
      <h1 class="h2">Add food</h1>
      <span style="width:52px"></span>
    </header>
    <div class="stack gap14" style="padding:14px 24px 0">
      <div class="row gap8">
        <label class="search">${ICON.search}<input type="search" placeholder="Search my foods" aria-label="Search my foods" data-o="q" autocomplete="off"></label>
        <button class="iconbtn" data-act="scan" aria-label="Scan barcode">${ICON.barcode}</button>
      </div>
      <div class="chips" data-o="tabs"></div>
    </div>
    <div class="body" data-o="list" style="gap:8px"></div>
  </div>`;

  const $ = (k) => el.querySelector(`[data-o="${k}"]`);

  function visibleFoods() {
    const q = query.trim().toLowerCase();
    if (q) return foods.filter((f) => `${f.name} ${f.brand || ''}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    if (tab === 'recent') return foods.filter((f) => f.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 30);
    if (tab === 'fav') return foods.filter((f) => f.fav).sort((a, b) => a.name.localeCompare(b.name));
    return foods.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  function render() {
    const tabBtn = (key, label) => `<button class="chip ${tab === key && !query ? 'on' : ''}" data-act="tab" data-tab="${key}">${label}</button>`;
    $('tabs').innerHTML = tabBtn('recent', 'Recent') + tabBtn('fav', 'Favorites') + tabBtn('mine', 'My foods')
      + '<a class="chip dashed link-chip" href="#/create">Create</a>';

    const list = visibleFoods();
    if (!foods.length) {
      $('list').innerHTML = `<div class="empty">No foods saved yet.<br>Create one from its nutrition label and it'll be here next time.<a class="btn primary sm" href="#/create">Create a food</a></div>`;
      return;
    }
    if (!list.length) {
      const msg = query ? `No saved food matches “${esc(query)}”.` : tab === 'fav' ? 'Tap the ☆ on a food to make it a favorite.' : 'Foods you log will show up here.';
      $('list').innerHTML = `<div class="empty">${msg}<a class="btn soft sm" href="#/create${query ? `?name=${encodeURIComponent(query)}` : ''}">Create a food</a></div>`;
      return;
    }
    $('list').innerHTML = list.map((f) => {
      const g = f.lastGrams || f.servingG || 100;
      const m = scale(f.per100, g);
      return `<div class="food-row">
        <button class="list-item grow" data-act="pick" data-id="${f.id}">
          <span class="grow"><span class="name">${esc(f.name)}${f.brand ? ` <span class="muted" style="font-weight:400">· ${esc(f.brand)}</span>` : ''}</span>
          <span class="sub">${r1(g)} g · P ${r1(m.p)} · C ${r1(m.c)} · F ${r1(m.f)}</span></span>
          <span class="kcal">${fmt(m.kcal)}</span>
        </button>
        <button class="star ${f.fav ? 'on' : ''}" data-act="fav" data-id="${f.id}" aria-label="${f.fav ? 'Remove from' : 'Add to'} favorites" aria-pressed="${!!f.fav}">${f.fav ? '★' : '☆'}</button>
        ${tab === 'mine' && !query ? `<a class="star" style="display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:13px;color:var(--muted);width:48px" href="#/create?edit=${f.id}" aria-label="Edit ${esc(f.name)}">Edit</a>` : ''}
      </div>`;
    }).join('');
  }

  async function pick(food) {
    const date = dateStr();
    const [targetList, entries] = await Promise.all([getTargets(), entriesOn(date)]);
    const t = targetOn(targetList, date) || { kcal: 0, p: 0 };
    const eaten = sum(entries);
    amountSheet({
      food, grams: food.lastGrams || food.servingG || 100, mode: 'add',
      remaining: { kcal: t.kcal - eaten.kcal, p: t.p - eaten.p },
      onSubmit: async (grams, group) => {
        await addEntry(food, grams, group);
        toast(`Added ${food.name}`);
        replace('#/today');
      },
    });
  }

  $('q').addEventListener('input', (e) => { query = e.target.value; render(); });
  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'cancel') back();
    if (act === 'scan') toast('Barcode scanning is coming in the next update');
    if (act === 'tab') { tab = b.dataset.tab; query = ''; $('q').value = ''; render(); }
    if (act === 'pick') pick(foods.find((f) => f.id === b.dataset.id));
    if (act === 'fav') {
      const f = foods.find((x) => x.id === b.dataset.id);
      f.fav = !f.fav;
      await saveFood(f);
      render();
    }
  };

  render();
  // Coming back from "Create food" with ?food=<id> opens that food straight away.
  const preselect = params.get('food') || sessionStorage.getItem('pickFood');
  sessionStorage.removeItem('pickFood');
  if (preselect) { const f = await getFood(preselect); if (f) pick(f); }
}

// ui.js — shared pieces of interface: navigation, tab bar, bottom sheets, toast,
// and the "amount" sheet used both for adding and for editing an entry.

import { esc, fmt, r1, num, scale, servingLabel, ICON } from './util.js';
import { BUILTIN_GROUPS, getGroups, setGroups } from './store.js';

// ---------- navigation ----------
// Screens are addressed by the part of the URL after '#', e.g. '#/today'.
// Changing the hash fires 'hashchange', which app.js listens to.
export const nav = { depth: 0, replacing: false };
export function go(hash) { location.hash = hash; }
export function replace(hash) { nav.replacing = true; location.replace(hash); }
// Back = the previous screen inside the app; if there isn't one, go to the fallback.
export function back(fallback = '#/today') {
  if (nav.depth > 1) history.back();
  else replace(fallback);
}

// ---------- tab bar ----------
export function tabbar(active) {
  const tab = (key, label) => `<a href="#/${key}" class="tab ${active === key ? 'on' : ''}" ${active === key ? 'aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="tabbar">
    ${tab('today', 'Today')}${tab('week', 'Week')}
    <a href="#/add" class="tab-add" aria-label="Add food">${ICON.plus}</a>
    ${tab('trends', 'Trends')}${tab('settings', 'Settings')}
  </nav>`;
}

// ---------- bottom sheet ----------
export function openSheet(html, { tall = false } = {}) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `<div class="scrim"></div><div class="sheet ${tall ? 'tall' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  root.classList.add('open');
  root.querySelector('.scrim').onclick = closeSheet;
  return root.querySelector('.sheet');
}
export function closeSheet() {
  const root = document.getElementById('sheet-root');
  root.innerHTML = '';
  root.classList.remove('open');
}

// ---------- toast ----------
let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- amount sheet ----------
// Shows a food, lets you set grams and an optional group, previews macros live.
// mode 'add'  -> onSubmit(grams, group) adds a new entry
// mode 'edit' -> onSubmit saves changes, onDelete removes the entry
export async function amountSheet({ food, grams, group = null, mode = 'add', remaining, note = '', onSubmit, onDelete }) {
  const custom = await getGroups();
  const groups = () => BUILTIN_GROUPS.concat(custom);
  const servingG = food.servingG || null;
  const base = food.baseUnit || 'g'; // 'g' or 'ml'
  // Foods with a known serving size can be logged in servings (e.g. 1.5) or grams; everything is saved as grams.
  const state = { grams: grams || 100, group, adding: false, unit: servingG ? 'serv' : 'g' };
  const r2 = (x) => Math.round(x * 100) / 100;
  const shown = () => (state.unit === 'serv' ? r2(state.grams / servingG) : r1(state.grams));

  const sheet = openSheet(`<div class="sheet-pad">
    <div class="handle"></div>
    <div class="row between baseline gap10">
      <span class="h3">${esc(food.name)}</span>
      <span class="big"><span data-o="kcal"></span> <small>kcal</small></span>
    </div>
    ${note ? `<span class="note" style="margin-top:-8px">${esc(note)}</span>` : ''}
    <div class="stack gap6">
      <div class="row gap10 wrap">
        <span class="muted">Amount</span>
        <div class="stepper">
          <button data-act="dec" aria-label="Less">−</button>
          <input data-o="grams" inputmode="decimal" value="${shown()}" aria-label="Amount">
          <button data-act="inc" aria-label="More">+</button>
        </div>
        ${servingG
          ? `<div class="seg" data-o="units"><button data-act="unit" data-u="serv">servings</button><button data-act="unit" data-u="g">${base}</button></div>`
          : `<span class="muted">${base}</span>`}
      </div>
      ${servingG ? '<span class="note" data-o="equiv"></span>' : ''}
    </div>
    <div class="tiles">
      <div class="t-p">Protein<b data-o="p"></b></div>
      <div class="t-c">Carbs<b data-o="c"></b></div>
      <div class="t-f">Fat<b data-o="f"></b></div>
    </div>
    <div class="stack gap8">
      <span class="muted">Group <span class="small">(optional)</span></span>
      <div class="chips" data-o="chips"></div>
      <div data-o="newgroup"></div>
    </div>
    ${mode === 'add' ? '<div class="note center-text" data-o="after"></div>' : ''}
    <button class="btn primary" data-act="submit" data-o="submit"></button>
    ${mode === 'edit' ? '<button class="btn text danger" data-act="delete">Delete entry</button>' : ''}
  </div>`);

  const $ = (k) => sheet.querySelector(`[data-o="${k}"]`);

  function update() {
    const m = scale(food.per100, state.grams);
    if (servingG) {
      sheet.querySelectorAll('[data-act="unit"]').forEach((b) => b.classList.toggle('on', b.dataset.u === state.unit));
      $('equiv').textContent = state.unit === 'serv'
        ? `= ${r1(state.grams)} ${base} · 1 serving is ${servingLabel(food)}`
        : `= ${r2(state.grams / servingG)} servings · 1 serving is ${servingLabel(food)}`;
    }
    $('kcal').textContent = fmt(m.kcal);
    $('p').textContent = `${r1(m.p)} g`;
    $('c').textContent = `${r1(m.c)} g`;
    $('f').textContent = `${r1(m.f)} g`;
    if (mode === 'add' && remaining) {
      const kLeft = remaining.kcal - m.kcal;
      const pLeft = remaining.p - m.p;
      $('after').textContent = 'After this: '
        + (kLeft >= 0 ? `${fmt(kLeft)} kcal left` : `${fmt(-kLeft)} kcal over`) + ' · '
        + (pLeft > 0 ? `${fmt(pLeft)} g protein left` : 'protein goal met') + ' today';
    }
    $('submit').textContent = mode === 'edit' ? 'Save' : (state.group ? `Add to ${state.group}` : 'Add to today');
  }

  function renderGroups() {
    $('chips').innerHTML = groups().map((g) =>
      `<button class="chip ${state.group === g ? 'on' : ''}" data-act="group" data-g="${esc(g)}" aria-pressed="${state.group === g}">${esc(g)}</button>`
    ).join('') + (state.adding ? '' : '<button class="chip dashed" data-act="newgroup">+ New</button>');
    $('newgroup').innerHTML = state.adding
      ? `<div class="row gap8"><input class="field" data-o="gname" placeholder="Name it, e.g. Fun snack" aria-label="New group name" maxlength="30"><button class="btn dark sm" data-act="savegroup">Save</button></div>`
      : '';
    if (state.adding) $('gname').focus();
    update();
  }

  const gramsInput = $('grams');
  gramsInput.addEventListener('focus', () => gramsInput.select());
  gramsInput.addEventListener('input', () => {
    const v = num(gramsInput.value);
    state.grams = state.unit === 'serv' ? v * servingG : v;
    update();
  });

  sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'inc' || act === 'dec') {
      const dir = act === 'inc' ? 1 : -1;
      if (state.unit === 'serv') {
        // half-serving steps, snapping to the nearest half
        const s = Math.max(0, Math.round((state.grams / servingG) * 2 + dir) / 2);
        state.grams = s * servingG;
      } else {
        state.grams = Math.max(0, Math.round(state.grams + dir * 10));
      }
      gramsInput.value = shown(); update();
    } else if (act === 'unit') {
      state.unit = b.dataset.u;
      gramsInput.value = shown(); update();
    } else if (act === 'group') {
      state.group = state.group === b.dataset.g ? null : b.dataset.g; // tap again to ungroup
      renderGroups();
    } else if (act === 'newgroup') {
      state.adding = true; renderGroups();
    } else if (act === 'savegroup') {
      const name = $('gname').value.trim();
      if (name) {
        if (!groups().some((g) => g.toLowerCase() === name.toLowerCase())) { custom.push(name); await setGroups(custom); }
        state.group = groups().find((g) => g.toLowerCase() === name.toLowerCase());
      }
      state.adding = false; renderGroups();
    } else if (act === 'submit') {
      if (state.grams <= 0) { toast('Enter an amount'); return; }
      b.disabled = true;
      await onSubmit(state.grams, state.group);
    } else if (act === 'delete') {
      await onDelete();
    }
  });

  renderGroups();
}

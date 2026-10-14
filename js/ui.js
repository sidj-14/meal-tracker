// ui.js — shared pieces of interface: navigation, tab bar, bottom sheets, toast,
// and the "amount" sheet used both for adding and for editing an entry.

import { esc, fmt, r1, num, scale, servingLabel, amountUnits, ICON } from './util.js';
import { BUILTIN_GROUPS, getGroups, setGroups, getFood, saveFood } from './store.js';

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
  // You can enter the amount in pieces, servings or g/ml (whichever apply to this food).
  // Internally it's always kept in the food's base unit (g, ml or pieces) as `state.grams`.
  const units = amountUnits(food);
  const unitOf = (key) => units.find((u) => u.key === key) || units[0];
  const state = { grams: grams || units[0].per * (units[0].key === 'base' ? 100 : 1), group, adding: false, unit: units[0].key };
  const r2 = (x) => Math.round(x * 100) / 100;
  const shown = () => (state.unit === 'base' ? r1 : r2)(state.grams / unitOf(state.unit).per);
  const hasServing = !!food.servingG;
  state.fav = !!food.fav;

  const sheet = openSheet(`<div class="sheet-pad">
    <div class="handle"></div>
    <div class="row between baseline gap10">
      <span class="h3">${esc(food.name)}</span>
      <span class="big"><span data-o="kcal"></span> <small>kcal</small></span>
    </div>
    ${mode === 'add' && food.id ? '<button class="fav-btn" data-act="fav" data-o="fav"></button>' : ''}
    ${note ? `<span class="note" style="margin-top:-8px">${esc(note)}</span>` : ''}
    <div class="stack gap6">
      <div class="row gap10 wrap">
        <span class="muted">Amount</span>
        <div class="stepper">
          <button data-act="dec" aria-label="Less">−</button>
          <input data-o="grams" inputmode="decimal" value="${shown()}" aria-label="Amount">
          <button data-act="inc" aria-label="More">+</button>
        </div>
        ${units.length > 1
          ? `<div class="seg" data-o="units">${units.map((u) => `<button data-act="unit" data-u="${u.key}">${u.label}</button>`).join('')}</div>`
          : `<span class="muted">${units[0].label}</span>`}
      </div>
      ${hasServing ? '<span class="note" data-o="equiv"></span>' : ''}
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
    sheet.querySelectorAll('[data-act="unit"]').forEach((b) => b.classList.toggle('on', b.dataset.u === state.unit));
    if (hasServing) {
      const others = units.filter((u) => u.key !== state.unit).map((u) => { const n = r2(state.grams / u.per); return `${n} ${n === 1 ? u.label.replace(/s$/, '') : u.label}`; });
      $('equiv').textContent = `${others.length ? `= ${others.join(' = ')} · ` : ''}1 serving is ${servingLabel(food)}`;
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
    const fav = $('fav');
    if (fav) { fav.textContent = state.fav ? '★ Favorite' : '☆ Add to favorites'; fav.classList.toggle('on', state.fav); fav.setAttribute('aria-pressed', state.fav); }
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
    state.grams = num(gramsInput.value) * unitOf(state.unit).per;
    update();
  });

  sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'inc' || act === 'dec') {
      // Steps: 1 piece, ½ serving or 10 g/ml, snapping to the nearest step
      const u = unitOf(state.unit);
      const count = Math.max(0, Math.round(state.grams / u.per / u.step + (act === 'inc' ? 1 : -1)) * u.step);
      state.grams = count * u.per;
      gramsInput.value = shown(); update();
    } else if (act === 'fav') {
      // Favorites live on the saved food; a food from search/scan gets saved to My foods here.
      state.fav = !state.fav;
      const saved = (await getFood(food.id)) || food;
      await saveFood({ ...saved, fav: state.fav });
      food.fav = state.fav;
      toast(state.fav ? 'Added to Favorites' : 'Removed from Favorites');
      update();
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

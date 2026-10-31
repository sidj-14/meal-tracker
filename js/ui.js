// ui.js — shared pieces of interface: navigation, tab bar, bottom sheets, toast,
// and the "amount" sheet used both for adding and for editing an entry.

import { esc, fmt, r1, num, scale, servingLabel, amountUnits, dayQuery, ICON } from './util.js';
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
export function tabbar(active, day) {
  const tab = (key, label) => `<a href="#/${key}" class="tab ${active === key ? 'on' : ''}" ${active === key ? 'aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="tabbar">
    ${tab('today', 'Today')}${tab('week', 'Week')}
    <a href="#/add${dayQuery(day)}" class="tab-add" aria-label="Add food">${ICON.plus}</a>
    ${tab('trends', 'Trends')}${tab('settings', 'Settings')}
  </nav>`;
}

// ---------- bottom sheet ----------
export function openSheet(html, { tall = false } = {}) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `<div class="scrim"></div><div class="sheet ${tall ? 'tall' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  root.classList.add('open');
  root.querySelector('.scrim').onclick = closeSheet;
  const sheet = root.querySelector('.sheet');
  enableSwipeDown(sheet, root.querySelector('.scrim'));
  return sheet;
}

// Swipe down to close, like iPhone sheets. A drag starts from the handle/header,
// or from the list when it's already scrolled to the top (so scrolling still works).
function enableSwipeDown(sheet, scrim) {
  let startY = 0, startX = 0, startT = 0, dy = 0, dragging = false, scroller = null, active = false;

  sheet.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.target.closest('input, select, textarea')) { active = false; return; }
    active = true; dragging = false; dy = 0;
    startY = e.touches[0].clientY; startX = e.touches[0].clientX; startT = Date.now();
    scroller = e.target.closest('.sheet-scroll, .sheet-pad');
  }, { passive: true });

  sheet.addEventListener('touchmove', (e) => {
    if (!active) return;
    dy = e.touches[0].clientY - startY;
    if (!dragging) {
      // sideways = someone swiping a row (e.g. swipe to delete), not pulling the sheet down
      if (Math.abs(e.touches[0].clientX - startX) > Math.abs(dy) && Math.abs(dy) > 2) { active = false; return; }
      const atTop = !scroller || scroller.scrollTop <= 0;
      if (dy > 6 && atTop) dragging = true;          // pulling down at the top → drag the sheet
      else if (Math.abs(dy) > 6) { active = false; return; } // otherwise it's a normal scroll
      else return;
    }
    e.preventDefault(); // stop the list from scrolling while the sheet moves
    const move = Math.max(0, dy);
    sheet.style.transition = 'none';
    sheet.style.transform = `translateY(${move}px)`;
    scrim.style.opacity = String(Math.max(0, 1 - move / sheet.offsetHeight));
  }, { passive: false });

  sheet.addEventListener('touchend', () => {
    if (!active || !dragging) { active = false; return; }
    active = false;
    const fast = dy / Math.max(1, Date.now() - startT) > 0.35; // a quick flick also closes
    sheet.style.transition = 'transform .2s ease-out';
    scrim.style.transition = 'opacity .2s ease-out';
    if (dy > sheet.offsetHeight * 0.25 || (fast && dy > 30)) {
      sheet.style.transform = 'translateY(100%)';
      scrim.style.opacity = '0';
      setTimeout(() => { if (sheet.isConnected) closeSheet(); }, 200);
    } else {
      sheet.style.transform = '';
      scrim.style.opacity = '';
    }
  });
}
export function closeSheet() {
  const root = document.getElementById('sheet-root');
  root.innerHTML = '';
  root.classList.remove('open');
}

// ---------- toast ----------
let toastTimer;
// toast('Saved') or toast('Deleted', { action: 'Undo', onAction }) — the action stays tappable for 4 seconds
export function toast(msg, { action, onAction } = {}) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('has-action', !!action);
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-action'; b.textContent = action;
    b.onclick = () => { el.classList.remove('show'); onAction(); };
    el.append(b);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 4000 : 2200);
}

// ---------- swipe left to delete ----------
// Wraps each row matching `selector` inside `container` so it can slide left to show a red Delete button.
// onDelete(row) runs when Delete is tapped. A plain tap on a row still works as before.
export function enableSwipeDelete(container, selector, onDelete, label = 'Delete') {
  const W = 88; // width of the Delete button
  let open = null; // the row currently slid open
  const close = (row) => {
    if (!row) return;
    row.style.transition = 'transform .2s'; row.style.transform = '';
    setTimeout(() => { if (!row.style.transform) row.parentElement?.classList.remove('moving'); }, 200);
    if (open === row) open = null;
  };
  container.querySelectorAll(selector).forEach((row) => {
    const wrap = document.createElement('div');
    wrap.className = 'swipe';
    wrap.style.borderRadius = getComputedStyle(row).borderRadius; // same rounded corners as the row
    row.replaceWith(wrap);
    const del = document.createElement('button');
    del.className = 'swipe-del'; del.textContent = typeof label === 'function' ? label(row) : label;
    del.onclick = (e) => { e.stopPropagation(); onDelete(row); };
    wrap.append(del, row);
    row.classList.add('swipe-row');

    let x0 = 0, y0 = 0, dx = 0, base = 0, mode = null; // mode: null (undecided) | 'swipe' | 'scroll'
    row.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      if (open && open !== row) close(open);
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; mode = null;
      base = open === row ? -W : 0;
      row.style.transition = 'none';
    }, { passive: true });
    row.addEventListener('touchmove', (e) => {
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if (!mode) { if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; mode = Math.abs(mx) > Math.abs(my) ? 'swipe' : 'scroll'; }
      if (mode !== 'swipe') return;
      e.preventDefault(); // sideways: move the row, don't scroll
      wrap.classList.add('moving');
      dx = mx;
      const x = Math.min(0, Math.max(-W * 1.4, base + dx));
      row.style.transform = `translateX(${x}px)`;
    }, { passive: false });
    row.addEventListener('touchend', () => {
      if (mode !== 'swipe') return;
      row.style.transition = 'transform .2s';
      if (base + dx < -W / 2) { row.style.transform = `translateX(${-W}px)`; open = row; }
      else close(row);
      row.dataset.swiped = '1'; // the tap that ends a swipe shouldn't also open the row
      setTimeout(() => { delete row.dataset.swiped; }, 350);
    });
    // While a row is open (or just swiped), a tap closes it instead of opening the entry
    row.addEventListener('click', (e) => {
      if (row.dataset.swiped || open === row) { e.stopPropagation(); e.preventDefault(); close(row); }
    }, true);
  });
}

// ---------- amount sheet ----------
// Shows a food, lets you set grams and an optional group, previews macros live.
// mode 'add'  -> onSubmit(grams, group, unit) adds a new entry
// mode 'edit' -> onSubmit saves changes, onDelete removes the entry
export async function amountSheet(opts) {
  const { food, grams, group = null, mode = 'add', remaining, note = '', dayLabel = 'today', onSubmit, onDelete, onEditFood } = opts;
  const custom = await getGroups();
  const groups = () => BUILTIN_GROUPS.concat(custom);
  // You can enter the amount in pieces, servings or g/ml (whichever apply to this food).
  // Internally it's always kept in the food's base unit (g, ml or pieces) as `state.grams`.
  const units = amountUnits(food);
  const unitOf = (key) => units.find((u) => u.key === key) || units[0];
  // Start in the unit you asked for, else the one you used last time for this food, else the first one
  const startUnit = [opts.unit, food.lastUnit].find((k) => units.some((u) => u.key === k)) || units[0].key;
  const first = unitOf(startUnit);
  const state = { grams: grams || first.per * (first.key === 'base' ? 100 : 1), group, adding: false, unit: startUnit };
  const r2 = (x) => Math.round(x * 100) / 100;
  const shown = () => (state.unit === 'base' ? r1 : r2)(state.grams / unitOf(state.unit).per);
  const hasServing = !!food.servingG;
  // "Count in pieces": offered when adding a weighed/poured food that has no pieces yet
  const canSetPieces = (food.baseUnit || 'g') !== 'pc' && !units.some((u) => u.key === 'pc');
  const base = food.baseUnit || 'g';

  const sheet = openSheet(`<div class="sheet-pad">
    <div class="handle"></div>
    <div class="row between baseline gap10">
      <span class="h3">${esc(food.name)}</span>
      <span class="big"><span data-o="kcal"></span> <small>kcal</small></span>
    </div>
    ${note || onEditFood ? `<div class="row gap8 wrap" style="margin-top:-8px">${note ? `<span class="note">${esc(note)}</span>` : ''}${onEditFood ? '<button class="link" data-act="editFood" style="font-size:13px;padding:0;color:var(--accent-ink);font-weight:600">Edit calories & macros ›</button>' : ''}</div>` : ''}
    <div class="stack gap6">
      <div class="row gap10 wrap">
        <span class="muted">Amount</span>
        <div class="stepper">
          <button data-act="dec" aria-label="Less">−</button>
          <input data-o="grams" inputmode="decimal" value="${shown()}" aria-label="Amount">
          <button data-act="inc" aria-label="More">+</button>
        </div>
        ${units.length > 1 || canSetPieces
          // A dropdown like on Create food. "pieces" is always offered; if this food doesn't know its pieces yet, picking it asks once.
          ? `<select class="unit-select" data-o="unit" aria-label="Unit" style="width:auto;min-width:96px">
              ${canSetPieces ? '<option value="setpc">pieces</option>' : ''}
              ${units.map((u) => `<option value="${u.key}">${u.label}</option>`).join('')}</select>`
          : `<span class="muted">${units[0].label}</span>`}
      </div>
      ${units.length > 1 ? '<span class="note" data-o="equiv"></span>' : ''}
      ${canSetPieces ? '<div data-o="pieces"></div>' : ''}
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
    if ($('unit') && !state.settingPieces) $('unit').value = state.unit;
    if (units.length > 1) {
      // "= 0.33 servings = 14.2 g = 0.5 oz" (spoons left out to keep it short)
      const cur = unitOf(state.unit);
      const others = units.filter((u) => u.key !== state.unit && !u.spoon).map((u) => { const n = (u.key === 'base' ? r1 : r2)(state.grams / u.per); return `${n} ${n === 1 ? u.label.replace(/s$/, '') : u.label}`; });
      // With a spoon picked, say what one is worth: "1 tbsp ≈ 15 g" (≈ when the weight per spoon is assumed)
      const spoonNote = cur.spoon && base === 'g' ? ` · 1 ${cur.label} ${cur.approx ? '≈' : '='} ${r1(cur.per)} g${cur.approx ? ' (assumes 1 g per ml)' : ''}` : '';
      const servNote = !hasServing ? '' : food.servingUnit === 'pieces' && food.servingQty === 1 ? ` · 1 piece is ${r1(food.servingG)} ${base}` : ` · 1 serving is ${servingLabel(food)}`;
      $('equiv').textContent = `= ${others.join(' = ')}${spoonNote || servNote}`;
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
        + (pLeft > 0 ? `${fmt(pLeft)} g protein left` : 'protein goal met') + (dayLabel === 'today' || dayLabel === 'yesterday' ? ` ${dayLabel}` : ` on ${dayLabel}`);
    }
    $('submit').textContent = mode === 'edit' ? 'Save' : (state.group ? `Add to ${state.group}` : `Add to ${dayLabel}`);
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

  $('unit')?.addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'setpc') {
      // Ask once how pieces relate to this food, e.g. "1 serving = 6 pieces" or "1 piece = 12 g"
      state.settingPieces = true;
      sheet.querySelector('.stepper').style.opacity = '.35'; gramsInput.disabled = true; // the amount waits until pieces are saved
      $('pieces').innerHTML = `<div class="tile stack gap8" style="padding:12px 14px">
        <span style="font-size:14px;font-weight:500">${hasServing ? `How many pieces in 1 serving (${esc(servingLabel(food))})?` : 'How much does 1 piece weigh?'}</span>
        <div class="row gap8" style="align-items:center">
          ${hasServing ? '<span class="note">1 serving =</span>' : '<span class="note">1 piece =</span>'}
          <input class="num-in sm" data-o="pcs" inputmode="decimal" placeholder="${hasServing ? '6' : '30'}" aria-label="${hasServing ? 'Pieces per serving' : `Weight of one piece in ${base}`}" style="width:64px">
          <span class="note">${hasServing ? 'pieces' : base}</span>
          <button class="btn dark sm" data-act="savepieces" style="margin-left:auto">Save</button>
        </div>
        <span class="note" style="font-size:12px">Saved with this food, so you only do this once.</span></div>`;
      $('pcs').focus();
      return;
    }
    if (state.settingPieces) { state.settingPieces = false; $('pieces').innerHTML = ''; sheet.querySelector('.stepper').style.opacity = ''; gramsInput.disabled = false; }
    state.unit = v;
    gramsInput.value = shown(); update();
  });

  sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if ((act === 'inc' || act === 'dec') && state.settingPieces) return;
    if (act === 'inc' || act === 'dec') {
      // Steps: 1 piece, ½ serving or 10 g/ml, snapping to the nearest step
      const u = unitOf(state.unit);
      const count = Math.max(0, Math.round(state.grams / u.per / u.step + (act === 'inc' ? 1 : -1)) * u.step);
      state.grams = count * u.per;
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
      if (state.settingPieces) { toast('Enter how many pieces are in a serving, then tap Save'); $('pcs').focus(); return; }
      if (state.grams <= 0) { toast('Enter an amount'); return; }
      b.disabled = true;
      await onSubmit(state.grams, state.group, state.unit, food); // food may now include pieces
    } else if (act === 'editFood') {
      onEditFood(food);
    } else if (act === 'savepieces') {
      const n = num($('pcs').value);
      if (!n) { toast(hasServing ? 'How many pieces in one serving?' : 'How much does one piece weigh?'); return; }
      const updated = hasServing
        ? { ...food, servingUnit: 'pieces', servingQty: n }
        : { ...food, servingG: n, servingUnit: 'pieces', servingQty: 1 };
      // Already in My foods: remember it there now (new foods are saved when you add them)
      const stored = food.id && await getFood(food.id);
      if (stored) await saveFood({ ...stored, servingG: updated.servingG, servingUnit: 'pieces', servingQty: updated.servingQty });
      const perPiece = updated.servingG / updated.servingQty;
      const count = Math.max(1, Math.round(state.grams / perPiece)); // start on a whole number of pieces
      amountSheet({ ...opts, food: updated, grams: count * perPiece, group: state.group, unit: 'pc' });
    } else if (act === 'delete') {
      await onDelete();
    }
  });

  renderGroups();
}

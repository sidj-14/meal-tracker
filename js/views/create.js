// Create food — enter a food from its nutrition label, per 100 g or per serving.
// Everything is stored per 100 g so any amount can be scaled later.
// Also used to edit an existing food: '#/create?edit=<id>'.

import { getFood, saveFood, deleteFood } from '../store.js';
import { esc, fmt, r1, num, kcalFromMacros } from '../util.js';
import { back, toast } from '../ui.js';

export default async function create(el, params) {
  const editing = params.get('edit') ? await getFood(params.get('edit')) : null;
  const s = editing
    ? { name: editing.name, brand: editing.brand || '', basis: '100', servingG: editing.servingG ? String(editing.servingG) : '',
        kcal: String(editing.per100.kcal), p: String(editing.per100.p), c: String(editing.per100.c), f: String(editing.per100.f) }
    : { name: params.get('name') || '', brand: params.get('brand') || '', basis: params.get('barcode') ? 'serving' : '100', servingG: '', kcal: '', p: '', c: '', f: '' };
  const barcode = editing?.barcode || params.get('barcode') || null; // set when you came here from a scan

  const numRow = (key, label, unit, color) => `
    <label class="form-row">
      <span class="row gap8">${color ? `<span class="dot" style="background:${color}"></span>` : ''}${label}</span>
      <span class="row gap6"><input class="num-in" data-k="${key}" inputmode="decimal" value="${esc(s[key])}" aria-label="${label}"><span class="unit">${unit}</span></span>
    </label>`;

  el.innerHTML = `<div class="screen">
    <header class="head row between">
      <button class="link" data-act="cancel">Cancel</button>
      <h1 class="h2">${editing ? 'Edit food' : 'Create food'}</h1>
      <span style="width:52px"></span>
    </header>
    <div class="body">
      ${barcode && !editing ? `<div class="tile stack gap6" style="background:var(--f-bg);color:var(--f-ink)"><span style="font-weight:600;font-size:14px">Barcode ${esc(barcode)}</span><span class="small">Enter the label once. Next time you scan it, this food comes up instantly.</span></div>` : ''}
      <div class="card" style="gap:12px">
        <label class="label">Name<input class="field" data-k="name" value="${esc(s.name)}" placeholder="e.g. Mom's dal" maxlength="60"></label>
        <label class="label">Brand <span class="small" style="margin-top:-6px">(optional)</span><input class="field" data-k="brand" value="${esc(s.brand)}" placeholder="e.g. Trader Joe's" maxlength="40"></label>
      </div>
      <div class="card">
        <div class="row between">
          <span class="title">Nutrition</span>
          <div class="seg" data-o="seg"></div>
        </div>
        <div data-o="servingRow"></div>
        ${numRow('kcal', 'Calories', 'kcal')}
        ${numRow('p', 'Protein', 'g', 'var(--p)')}
        ${numRow('c', 'Carbs', 'g', 'var(--c)')}
        ${numRow('f', 'Fat', 'g', 'var(--f)')}
        <div class="tile stack gap6"><span class="small" style="color:#4A4E4B" data-o="check"></span><span class="note" data-o="per100"></span></div>
      </div>
      <span class="note center-text" style="padding:0 12px">Saved to My foods. When you log it, enter any amount in grams and the macros scale automatically.</span>
      ${editing ? '<button class="btn text danger" data-act="delete">Delete this food</button>' : ''}
    </div>
    <div style="flex-shrink:0;padding:12px 24px calc(16px + var(--bottom))"><button class="btn primary" style="width:100%" data-act="save">Save food</button></div>
  </div>`;

  const $ = (k) => el.querySelector(`[data-o="${k}"]`);

  function per100() {
    const isServing = s.basis === 'serving';
    const sg = num(s.servingG);
    const factor = isServing ? (sg ? 100 / sg : 0) : 1;
    const p = num(s.p), c = num(s.c), f = num(s.f);
    const kcal = num(s.kcal) || kcalFromMacros(p, c, f); // blank calories -> computed from macros
    return { kcal: r1(kcal * factor), p: r1(p * factor), c: r1(c * factor), f: r1(f * factor) };
  }

  function renderBasis() {
    const isServing = s.basis === 'serving';
    $('seg').innerHTML = `<button class="${isServing ? '' : 'on'}" data-act="basis" data-v="100">Per 100 g</button><button class="${isServing ? 'on' : ''}" data-act="basis" data-v="serving">Per serving</button>`;
    $('servingRow').innerHTML = isServing ? numRow('servingG', 'Serving size', 'g') : '';
    $('servingRow').hidden = !isServing;
    bindInputs();
    update();
  }

  function update() {
    const p = num(s.p), c = num(s.c), f = num(s.f), k = num(s.kcal);
    const fromMacros = Math.round(kcalFromMacros(p, c, f));
    let msg;
    if (!p && !c && !f) msg = 'Enter the macros from the label. Leave calories blank and they fill in from the macros.';
    else if (!k) msg = `Calories from macros: ${fmt(fromMacros)} kcal (used because calories is blank)`;
    else msg = Math.abs(k - fromMacros) <= Math.max(10, k * 0.1) ? `Calories match the macros (${fmt(fromMacros)} kcal) ✓` : `Heads up: macros add up to ${fmt(fromMacros)} kcal, you entered ${fmt(k)}`;
    $('check').textContent = msg;
    const v = per100();
    $('per100').textContent = s.basis === 'serving'
      ? (num(s.servingG) ? `Stored per 100 g: ${fmt(v.kcal)} kcal · P ${v.p} · C ${v.c} · F ${v.f}` : 'Enter the serving size in grams (it\'s on the label next to the serving).')
      : 'US labels list values per serving. Switch to "Per serving" to type them as printed.';
  }

  function bindInputs() {
    el.querySelectorAll('[data-k]').forEach((input) => {
      input.oninput = () => { s[input.dataset.k] = input.value; update(); };
    });
  }

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'cancel') back('#/add');
    if (act === 'basis') { s.basis = b.dataset.v; renderBasis(); }
    if (act === 'delete') {
      await deleteFood(editing.id);
      toast('Food deleted');
      back('#/add');
    }
    if (act === 'save') {
      const name = s.name.trim();
      if (!name) { toast('Give the food a name'); return; }
      if (s.basis === 'serving' && !num(s.servingG)) { toast('Enter the serving size in grams'); return; }
      const v = per100();
      if (!v.kcal) { toast('Enter calories or macros'); return; }
      const food = await saveFood({
        ...(editing || {}), name, brand: s.brand.trim(), per100: v, barcode,
        servingG: s.basis === 'serving' ? num(s.servingG) : (editing?.servingG || null),
      });
      toast(editing ? 'Food updated' : 'Food saved');
      if (editing) back('#/add?tab=mine');
      else { sessionStorage.setItem('pickFood', food.id); back('#/add'); } // add screen opens it
    }
  };

  renderBasis();
}

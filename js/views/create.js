// Create food — enter a food from its nutrition label: per 100 g, per 100 ml, or per serving.
// Serving sizes can be in g, ml, oz or fl oz. Everything is stored per 100 g (or per 100 ml
// for drinks) so any amount can be scaled later.
// Also used to edit an existing food: '#/create?edit=<id>'.

import { getFood, saveFood, deleteFood } from '../store.js';
import { esc, fmt, r1, num, kcalFromMacros, SERVING_UNITS, baseOf, toBase } from '../util.js';
import { back, toast } from '../ui.js';
import { readLabel } from '../label-reader.js';

export default async function create(el, params) {
  const editing = params.get('edit') ? await getFood(params.get('edit')) : null;
  // basis: 'g100' (per 100 g), 'ml100' (per 100 ml) or 'serving' (per serving, as US labels print it)
  const s = editing
    ? { name: editing.name, brand: editing.brand || '', basis: editing.baseUnit === 'ml' ? 'ml100' : 'g100',
        servingQty: editing.servingG ? String(r1(editing.servingQty || editing.servingG)) : '',
        servingUnit: editing.servingUnit || editing.baseUnit || 'g',
        kcal: String(editing.per100.kcal), p: String(editing.per100.p), c: String(editing.per100.c), f: String(editing.per100.f) }
    : { name: params.get('name') || '', brand: params.get('brand') || '', basis: params.get('barcode') ? 'serving' : 'g100',
        servingQty: '', servingUnit: 'g', kcal: '', p: '', c: '', f: '' };
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
        <label class="btn soft" style="cursor:pointer;font-size:15px" data-o="photoBtn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
          Fill from a label photo
          <input type="file" accept="image/*" data-o="photo" hidden>
        </label>
        <span class="note center-text" data-o="photoStatus" hidden></span>
        <span class="title">Nutrition values are</span>
        <div class="seg" data-o="seg" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr))"></div>
        <div data-o="servingRow"></div>
        ${numRow('kcal', 'Calories', 'kcal')}
        ${numRow('p', 'Protein', 'g', 'var(--p)')}
        ${numRow('c', 'Carbs', 'g', 'var(--c)')}
        ${numRow('f', 'Fat', 'g', 'var(--f)')}
        <div class="tile stack gap6"><span class="small" style="color:#4A4E4B" data-o="check"></span><span class="note" data-o="per100"></span></div>
      </div>
      <span class="note center-text" style="padding:0 12px">Saved to My foods. When you log it, enter servings or any amount in g / ml and the macros scale automatically.</span>
      ${editing ? '<button class="btn text danger" data-act="delete">Delete this food</button>' : ''}
    </div>
    <div style="flex-shrink:0;padding:12px 24px calc(16px + var(--bottom))"><button class="btn primary" style="width:100%" data-act="save">Save food</button></div>
  </div>`;

  const $ = (k) => el.querySelector(`[data-o="${k}"]`);

  // Base unit: millilitres for drinks (per 100 ml, or a serving in ml / fl oz), otherwise grams.
  const baseUnit = () => (s.basis === 'ml100' ? 'ml' : s.basis === 'g100' ? 'g' : baseOf(s.servingUnit));
  const servingBase = () => toBase(num(s.servingQty), s.servingUnit); // serving size in g or ml

  function per100() {
    const isServing = s.basis === 'serving';
    const sg = servingBase();
    const factor = isServing ? (sg ? 100 / sg : 0) : 1;
    const p = num(s.p), c = num(s.c), f = num(s.f);
    const kcal = num(s.kcal) || kcalFromMacros(p, c, f); // blank calories -> computed from macros
    return { kcal: r1(kcal * factor), p: r1(p * factor), c: r1(c * factor), f: r1(f * factor) };
  }

  function renderBasis() {
    const isServing = s.basis === 'serving';
    const opt = (v, label) => `<button class="${s.basis === v ? 'on' : ''}" data-act="basis" data-v="${v}" style="padding:8px 0">${label}</button>`;
    $('seg').innerHTML = opt('serving', 'Per serving') + opt('g100', 'Per 100 g') + opt('ml100', 'Per 100 ml');
    // Serving size: required for "per serving", optional otherwise (lets you log in servings later)
    $('servingRow').innerHTML = `
      <div class="form-row">
        <span>Serving size${isServing ? '' : ' <span class="small muted">(optional)</span>'}</span>
        <span class="row gap6">
          <input class="num-in" style="width:72px" data-k="servingQty" inputmode="decimal" value="${esc(s.servingQty)}" aria-label="Serving size">
          <select class="unit-select" data-k="servingUnit" aria-label="Serving size unit">
            ${SERVING_UNITS.map((u) => `<option value="${u}" ${s.servingUnit === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </span>
      </div>`;
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
    const b = baseUnit();
    const conv = num(s.servingQty) && s.servingUnit !== b ? ` (${num(s.servingQty)} ${s.servingUnit} = ${Math.round(servingBase())} ${b})` : '';
    $('per100').textContent = s.basis === 'serving'
      ? (num(s.servingQty) ? `Stored per 100 ${b}: ${fmt(v.kcal)} kcal · P ${v.p} · C ${v.c} · F ${v.f}${conv}` : 'Enter the serving size from the label (g, ml, oz or fl oz).')
      : 'US labels list values per serving. Pick "Per serving" to type them as printed.';
  }

  // ----- Fill from a photo of the Nutrition Facts label -----
  $('photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const status = $('photoStatus');
    status.hidden = false;
    $('photoBtn').style.pointerEvents = 'none';
    $('photoBtn').style.opacity = '.6';
    try {
      const r = await readLabel(file, (msg) => { status.textContent = msg; });
      const got = ['kcal', 'p', 'c', 'f'].filter((k) => r[k] !== null);
      if (!got.length) {
        status.textContent = "Couldn't read the numbers. Try a straight-on, well-lit photo of just the Nutrition Facts box, or type them in.";
        return;
      }
      s.basis = r.basis;
      if (r.servingQty) { s.servingQty = String(r.servingQty); s.servingUnit = r.servingUnit; }
      for (const k of got) s[k] = String(r[k]);
      renderBasis();
      for (const k of ['kcal', 'p', 'c', 'f']) {
        const input = el.querySelector(`[data-k="${k}"]`);
        input.value = s[k];
        input.style.boxShadow = r[k] !== null ? 'inset 0 0 0 2px var(--accent)' : 'inset 0 0 0 2px var(--over)';
      }
      if (r.basis === 'serving') el.querySelector('[data-k="servingQty"]').style.boxShadow = r.servingQty ? 'inset 0 0 0 2px var(--accent)' : 'inset 0 0 0 2px var(--over)';
      const missing = ['kcal', 'p', 'c', 'f'].filter((k) => r[k] === null).map((k) => ({ kcal: 'calories', p: 'protein', c: 'carbs', f: 'fat' }[k]));
      if (r.basis === 'serving' && !r.servingQty) missing.push('serving size');
      status.textContent = missing.length
        ? `Filled what I could read (green). Please add: ${missing.join(', ')}.`
        : 'Filled from the photo (green). Check each number against the label before saving.';
    } catch (err) {
      status.textContent = err.message || "Couldn't read that photo. Try again or type the numbers.";
    } finally {
      $('photoBtn').style.pointerEvents = '';
      $('photoBtn').style.opacity = '';
    }
  });

  function bindInputs() {
    el.querySelectorAll('[data-k]').forEach((input) => {
      input.oninput = () => { s[input.dataset.k] = input.value; input.style.boxShadow = ''; update(); };
      if (input.tagName === 'SELECT') input.onchange = input.oninput;
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
      if (s.basis === 'serving' && !num(s.servingQty)) { toast('Enter the serving size'); return; }
      const v = per100();
      if (!v.kcal) { toast('Enter calories or macros'); return; }
      const food = await saveFood({
        ...(editing || {}), name, brand: s.brand.trim(), per100: v, barcode, baseUnit: baseUnit(),
        servingG: num(s.servingQty) ? servingBase() : null,     // serving in g or ml
        servingQty: num(s.servingQty) || null, servingUnit: num(s.servingQty) ? s.servingUnit : null, // as printed
      });
      toast(editing ? 'Food updated' : 'Food saved');
      if (editing) back('#/add?tab=mine');
      else { sessionStorage.setItem('pickFood', food.id); back('#/add'); } // add screen opens it
    }
  };

  renderBasis();
}

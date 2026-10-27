// Targets — daily calories plus grams of protein, carbs and fat.
// Saving creates a target that applies from today onward; past days keep their old targets.

import { getTargets, targetOn, saveTarget, setKV, kv } from '../store.js';
import { esc, fmt, num, dateStr, addDays, shortDate, kcalFromMacros } from '../util.js';
import { back, replace, toast } from '../ui.js';

export default async function targets(el, params) {
  const setup = params.get('setup') === '1';
  const list = await getTargets();
  let goal = await kv('goal', null); // 'deficit' | 'surplus' | null: what you're aiming for (used on Trends)
  const current = targetOn(list, dateStr()) || { kcal: 2000, p: 125, c: 225, f: 67 };
  const form = { kcal: String(current.kcal), p: String(current.p), c: String(current.c), f: String(current.f) };

  const field = (key, label, unit, color) => `
    <label class="form-row">
      <span class="row gap8">${color ? `<span class="dot" style="background:${color}"></span>` : ''}${label}</span>
      <span class="row gap6"><input class="num-in" data-k="${key}" inputmode="decimal" value="${esc(form[key])}" aria-label="${label} target"><span class="unit">${unit}</span></span>
    </label>`;

  el.innerHTML = `<div class="screen">
    <header class="head">
      ${setup ? '' : '<button class="link" data-act="back" style="padding:4px 0 6px">‹ Back</button>'}
      <h1 class="h1">${setup ? 'Set your targets' : 'Targets'}</h1>
      ${setup ? '<p class="muted" style="margin:6px 0 0">You can change these any time.</p>' : ''}
    </header>
    <div class="body">
      <div class="card" style="gap:12px">
        <span class="title">What's your goal with calorie tracking?</span>
        <div class="goal-toggle" data-o="goal"></div>
        <span class="note">Trends uses this to tell you if your average is on track.</span>
      </div>
      <div class="card">
        <div class="row between baseline"><span class="title">Daily targets</span><span class="note">from ${shortDate(dateStr())}</span></div>
        ${field('kcal', 'Calories', 'kcal')}
        ${field('p', 'Protein', 'g', 'var(--p)')}
        ${field('c', 'Carbs', 'g', 'var(--c)')}
        ${field('f', 'Fat', 'g', 'var(--f)')}
        <div class="tile stack gap8">
          <div class="split" data-o="split"></div>
          <span class="small" style="color:#4A4E4B" data-o="splitText"></span>
          <span class="note" data-o="check"></span>
          <button class="chip" data-act="match" data-o="match" style="align-self:flex-start"></button>
        </div>
        <button class="btn primary" data-act="save">${setup ? 'Save and continue' : 'Save targets'}</button>
        <span class="note center-text">New targets apply from today onward. Past days keep the targets they had.</span>
      </div>
      ${list.length ? `<div class="card" style="gap:10px">
        <span class="title">Target history</span>
        ${list.slice().reverse().map((t, i, arr) => {
          const nextFrom = i > 0 ? arr[i - 1].from : null;
          const range = nextFrom ? `${shortDate(t.from)} – ${shortDate(addDays(nextFrom, -1))}` : `Since ${shortDate(t.from)}`;
          return `<div class="tile row between"><span class="stack gap6"><span style="font-size:13px;font-weight:500">${range}</span><span class="note">P ${t.p} g · C ${t.c} g · F ${t.f} g</span></span><span class="title">${fmt(t.kcal)} kcal</span></div>`;
        }).join('')}
      </div>` : ''}
    </div>
  </div>`;

  const $ = (k) => el.querySelector(`[data-o="${k}"]`);
  function renderGoal() {
    const opt = (v, arrow, title, sub) => `<button class="goal-opt ${goal === v ? 'on' : ''}" data-act="goal" data-v="${v}" aria-pressed="${goal === v}">
      <span class="goal-arrow" aria-hidden="true">${arrow}</span><span style="font-weight:600;font-size:15px">${title}</span><span class="small muted">${sub}</span></button>`;
    $('goal').innerHTML = opt('deficit', '↓', 'Deficit', 'Eat less, to lose weight') + opt('surplus', '↑', 'Surplus', 'Eat more, to gain weight');
  }
  function update() {
    const k = num(form.kcal), p = num(form.p), c = num(form.c), f = num(form.f);
    const fromMacros = Math.round(kcalFromMacros(p, c, f));
    const total = fromMacros || 1;
    const pp = Math.round((p * 4 / total) * 100), cp = Math.round((c * 4 / total) * 100), fp = Math.max(0, 100 - pp - cp);
    $('split').innerHTML = `<div style="width:${pp}%;background:var(--p)"></div><div style="width:${cp}%;background:var(--c)"></div><div style="width:${fp}%;background:var(--f)"></div>`;
    $('splitText').textContent = `Split: Protein ${pp}% · Carbs ${cp}% · Fat ${fp}% of calories`;
    const diff = fromMacros - k;
    const mismatch = Math.abs(diff) > 50;
    $('check').textContent = `Your macros add up to ${fmt(fromMacros)} kcal` + (mismatch ? ` · ${fmt(Math.abs(diff))} ${diff > 0 ? 'over' : 'under'} your calorie target` : ' · matches your calorie target');
    $('match').hidden = !mismatch;
    $('match').textContent = `Set calories to ${fmt(fromMacros)}`;
    $('match').dataset.v = fromMacros;
  }

  el.querySelectorAll('[data-k]').forEach((input) => {
    input.addEventListener('focus', () => input.select());
    input.addEventListener('input', () => { form[input.dataset.k] = input.value; update(); });
  });

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'back') back();
    if (b.dataset.act === 'goal') {
      goal = goal === b.dataset.v ? null : b.dataset.v; // tap again to clear
      await setKV('goal', goal); // saved right away
      renderGoal();
    }
    if (b.dataset.act === 'match') {
      form.kcal = b.dataset.v;
      el.querySelector('[data-k="kcal"]').value = form.kcal;
      update();
    }
    if (b.dataset.act === 'save') {
      const t = { kcal: Math.round(num(form.kcal)), p: Math.round(num(form.p)), c: Math.round(num(form.c)), f: Math.round(num(form.f)) };
      if (!t.kcal) { toast('Enter a calorie target'); return; }
      await saveTarget(t);
      if (setup) { await setKV('onboarded', true); replace('#/today'); }
      else { toast('Targets saved'); back(); }
    }
  };

  renderGoal();
  update();
}

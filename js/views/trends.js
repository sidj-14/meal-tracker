// Trends — calories against your (stepped) target line over the last week, month or year,
// plus days within target, protein goal days, and your macro split vs target.
//
// Only "logged" days count toward averages: a day with no entries is treated as
// "not tracked", not as "ate nothing", so a forgotten day doesn't drag your average down.

import { getTargets, targetOn, entriesBetween, kv, setKV } from '../store.js';
import { fmt, sum, dateStr, addDays, parseDate, shortDate, kcalFromMacros } from '../util.js';
import { tabbar, openSheet, closeSheet } from '../ui.js';

const RANGES = { week: 'Week', month: 'Month', year: 'Year' };
let range = 'month'; // remembered while the app is open
const monthYear = (d) => parseDate(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

export default async function trends(el) {
  const today = dateStr();
  const yearStart = (() => { const d = parseDate(today); d.setMonth(d.getMonth() - 11, 1); return dateStr(d); })();
  const [targetList, entries, goal, skippedList] = await Promise.all([getTargets(), entriesBetween(yearStart, today), kv('goal', null), kv('skipDays', [])]);
  // Days you chose not to count in the deficit/surplus number (press and hold the number to choose). Remembered.
  const skipped = new Set(skippedList);

  // Totals per day: { 'YYYY-MM-DD': {kcal,p,c,f} }
  const byDay = {};
  for (const e of entries) byDay[e.date] = sum([byDay[e.date] || { kcal: 0, p: 0, c: 0, f: 0 }, e]);
  const targetFor = (d) => targetOn(targetList, d) || { kcal: 0, p: 0, c: 0, f: 0 };

  function buildBuckets() {
    if (range === 'year') {
      // One bar per month = average per logged day in that month.
      return Array.from({ length: 12 }, (_, i) => {
        const d = parseDate(yearStart); d.setMonth(d.getMonth() + i, 1);
        const first = dateStr(d);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const last = dateStr(end) > today ? today : dateStr(end);
        const days = Object.keys(byDay).filter((x) => x >= first && x <= last);
        const avg = days.length ? sum(days.map((x) => byDay[x])).kcal / days.length : null;
        const tgt = days.length ? days.reduce((a, x) => a + targetFor(x).kcal, 0) / days.length : targetFor(last).kcal;
        return {
          value: avg, target: tgt, days: days.length,
          label: d.toLocaleDateString('en-US', { month: 'short' }),
          detail: days.length ? `${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · avg ${fmt(avg)} kcal/day over ${days.length} logged day${days.length === 1 ? '' : 's'}` : `${d.toLocaleDateString('en-US', { month: 'long' })} · nothing logged`,
        };
      });
    }
    const n = range === 'week' ? 7 : 30;
    return Array.from({ length: n }, (_, i) => {
      const d = addDays(today, i - n + 1);
      const v = byDay[d] ? byDay[d].kcal : null;
      const t = targetFor(d).kcal;
      return {
        value: v, target: t, date: d,
        label: range === 'week' ? parseDate(d).toLocaleDateString('en-US', { weekday: 'short' }) : shortDate(d),
        detail: v === null ? `${shortDate(d)} · nothing logged` : `${shortDate(d)} · ${fmt(v)} kcal · target ${fmt(t)}`,
      };
    });
  }

  function stats() {
    const n = range === 'week' ? 7 : range === 'month' ? 30 : 365;
    const from = range === 'year' ? yearStart : addDays(today, -n + 1);
    const days = Object.keys(byDay).filter((d) => d >= from && d <= today);
    const tot = sum(days.map((d) => byDay[d]));
    const within = days.filter((d) => { const t = targetFor(d).kcal; return t && Math.abs(byDay[d].kcal - t) <= t * 0.1; }).length;
    const protein = days.filter((d) => byDay[d].p >= targetFor(d).p && targetFor(d).p > 0).length;
    const avgTarget = days.length ? days.reduce((a, d) => a + targetFor(d).kcal, 0) / days.length : targetFor(today).kcal;
    // Calorie balance vs target, per logged day: negative = under target (deficit), positive = over (surplus)
    // (only the days you chose to count)
    const counted = days.filter((d) => !skipped.has(d));
    const net = counted.reduce((a, d) => a + byDay[d].kcal - targetFor(d).kcal, 0);
    return { days: days.length, list: days, counted: counted.length, tot, within, protein, avgTarget, from, net, avgNet: counted.length ? net / counted.length : 0 };
  }

  // ----- Compact box: average deficit / surplus vs target (logged days only) + how many days you logged -----
  // "Could have logged" counts from when you started (first target or first entry) up to today.
  const firstEntry = entries.reduce((a, e) => (e.date < a ? e.date : a), today);
  const started = targetList.length && targetList[0].from < firstEntry ? targetList[0].from : firstEntry;
  const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000) + 1;
  // Average kcal/day above or below target -> { text: '300', word: 'deficit', cls: 'good' | 'off' | '' }
  function balanceOf(avgNet, counted) {
    const avg = Math.round(avgNet);
    if (!counted) return { num: '–', word: 'no days counted', cls: '' };
    if (Math.abs(avg) < 25) return { num: '', word: 'on target', cls: goal ? 'good' : '' };
    const kind = avg < 0 ? 'deficit' : 'surplus';
    return { num: fmt(Math.abs(avg)), word: kind, cls: !goal ? '' : kind === goal ? 'good' : 'off' };
  }
  function balanceBox(s) {
    const b = balanceOf(s.avgNet, s.counted);
    return `<div class="balance-wrap"><div class="balance ${b.cls}" data-o="balance" role="button" tabindex="0"
        aria-label="Average ${b.num} kcal a day ${b.word}. Press and hold to choose which days count.">
      ${b.num ? `<span class="big-num">${b.num}</span>` : ''}<span class="word">${b.word}</span>
    </div>${s.counted < s.days ? `<span class="note" style="font-size:12px">${s.counted} of ${s.days} days counted</span>` : ''}</div>`;
  }
  // Fill rate: days logged out of days you could have logged in this period
  function fillRate(s) {
    const possible = Math.max(1, daysBetween(s.from > started ? s.from : started, today));
    return { possible, rate: Math.round((s.days / possible) * 100) };
  }

  function chart(buckets, selected) {
    const W = 342, H = 140, top = 12, gap = 2;
    const max = Math.max(...buckets.map((b) => Math.max(b.value || 0, b.target || 0)), 1) * 1.1;
    const bw = (W - gap * (buckets.length - 1)) / buckets.length;
    const y = (v) => top + (H - top) * (1 - v / max);
    const x = (i) => i * (bw + gap);
    const r = Math.min(4, bw / 2);
    const bar = (i, v) => {
      const x0 = x(i), x1 = x0 + bw, y0 = y(v), h = H - y0;
      const rr = Math.min(r, h);
      return `M${x0},${H}V${y0 + rr}Q${x0},${y0} ${x0 + rr},${y0}H${x1 - rr}Q${x1},${y0} ${x1},${y0 + rr}V${H}Z`;
    };
    // Target as a stepped dashed line: flat across each bar, stepping where the target changed.
    let step = '';
    buckets.forEach((b, i) => {
      if (!b.target) return;
      const yy = y(b.target).toFixed(1);
      step += `${step ? 'L' : 'M'}${x(i).toFixed(1)},${yy}H${(x(i) + bw + (i < buckets.length - 1 ? gap : 0)).toFixed(1)}`;
    });
    const bars = buckets.map((b, i) => b.value === null
      ? `<rect x="${x(i)}" y="${H - 3}" width="${bw}" height="3" rx="1.5" fill="var(--line)"/>`
      : `<path d="${bar(i, b.value)}" fill="${i === selected ? 'var(--accent-ink)' : 'var(--accent)'}" opacity="${i === selected || selected === null ? 1 : 0.75}"/>`).join('');
    // Invisible, full-height tap targets bigger than the bars.
    const hits = buckets.map((b, i) => `<rect x="${x(i) - gap / 2}" y="0" width="${bw + gap}" height="${H}" fill="transparent" data-act="pick" data-i="${i}" style="cursor:pointer"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible" role="img" aria-label="Daily calories against target">
      <line x1="0" x2="${W}" y1="${H}" y2="${H}" stroke="var(--line)"/>
      ${bars}
      <path d="${step}" fill="none" stroke="#9A968E" stroke-width="1.5" stroke-dasharray="4 4"/>
      ${hits}
    </svg>`;
  }

  function render(selected = null) {
    const buckets = buildBuckets();
    if (selected === null) { for (let i = buckets.length - 1; i >= 0; i--) if (buckets[i].value !== null) { selected = i; break; } }
    const s = stats();
    const current = targetFor(today);
    const labelIdx = [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1];
    const macroKcal = { p: s.tot.p * 4, c: s.tot.c * 4, f: s.tot.f * 9 };
    const totalMacroKcal = macroKcal.p + macroKcal.c + macroKcal.f || 1;
    const pct = (v) => Math.round((v / totalMacroKcal) * 100);
    const actual = { p: pct(macroKcal.p), c: pct(macroKcal.c) }; actual.f = Math.max(0, 100 - actual.p - actual.c);
    const tK = kcalFromMacros(current.p, current.c, current.f) || 1;
    const target = { p: Math.round(current.p * 4 / tK * 100), c: Math.round(current.c * 4 / tK * 100) }; target.f = Math.max(0, 100 - target.p - target.c);
    const splitBar = (v) => `<div class="split" style="height:14px"><div style="width:${v.p}%;background:var(--p)"></div><div style="width:${v.c}%;background:var(--c)"></div><div style="width:${v.f}%;background:var(--f)"></div></div>`;
    const changed = targetList.some((t, i) => i > 0 && t.from > s.from && t.from <= today); // the first target isn't a change

    el.innerHTML = `<div class="screen">
      <header class="head stack gap6">
        <span class="eyebrow">${range === 'year' ? `${monthYear(yearStart)} – ${monthYear(today)}` : `${shortDate(addDays(today, -(range === 'week' ? 6 : 29)))} – ${shortDate(today)}`}</span>
        <h1 class="h1">Trends</h1>
      </header>
      <div class="body">
        <div class="seg" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr))">
          ${Object.entries(RANGES).map(([k, v]) => `<button class="${range === k ? 'on' : ''}" data-act="range" data-r="${k}" style="padding:8px 0">${v}</button>`).join('')}
        </div>
        ${s.days ? `
        ${balanceBox(s)}
        <div class="card" style="gap:12px">
          <div class="row between baseline">
            <div class="stack"><span class="small muted">Avg daily calories</span><span class="h1" style="font-size:26px">${fmt(s.tot.kcal / s.days)}</span></div>
            <span class="stack small muted" style="align-items:flex-end"><span>target ${fmt(current.kcal)}</span>${changed ? '<span>target changed in this range</span>' : ''}</span>
          </div>
          <div class="note" style="font-size:13px;color:var(--ink);min-height:18px" data-o="detail">${selected !== null ? buckets[selected].detail : ''}</div>
          ${chart(buckets, selected)}
          <div class="row between note">${labelIdx.map((i) => `<span>${buckets[i].label}</span>`).join('')}</div>
          <span class="note">${range === 'year' ? 'Bars = average per logged day each month' : 'Bars = calories per day'} · dashes = your target · tap a bar for details</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
          <div class="card stat"><span class="small muted">Fill rate</span><span class="stat-num">${fillRate(s).rate}%</span><span class="small muted">${s.days} of ${fillRate(s).possible} days logged</span></div>
          <div class="card stat"><span class="small muted">On target</span><span class="stat-num">${s.within} / ${s.days}</span><span class="small muted">days within ±10%</span></div>
          <div class="card stat"><span class="small muted">Protein hit</span><span class="stat-num">${s.protein} day${s.protein === 1 ? '' : 's'}</span><span class="small muted">avg ${fmt(s.tot.p / s.days)} g a day</span></div>
        </div>
        <div class="card" style="gap:10px">
          <span class="title">Macro split</span>
          <span class="small muted">Actual (share of calories)</span>${splitBar(actual)}
          <span class="small muted" style="margin-top:4px">Target</span><div style="opacity:.55">${splitBar(target)}</div>
          <div class="row gap14 wrap small" style="color:#4A4E4B">
            <span class="row gap6"><span class="dot" style="background:var(--p)"></span>Protein ${actual.p}% <span class="muted">(${target.p}%)</span></span>
            <span class="row gap6"><span class="dot" style="background:var(--c)"></span>Carbs ${actual.c}% <span class="muted">(${target.c}%)</span></span>
            <span class="row gap6"><span class="dot" style="background:var(--f)"></span>Fat ${actual.f}% <span class="muted">(${target.f}%)</span></span>
          </div>
        </div>
        <span class="note center-text">${s.days} logged day${s.days === 1 ? '' : 's'} in this range. Days with nothing logged aren't counted.</span>
        ` : `<div class="card"><span class="title">Nothing logged in this range yet</span><span class="muted">Log a few days and your trends will show up here.</span></div>`}
      </div>
      ${tabbar('trends')}
    </div>`;
  }

  el.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const scroll = el.querySelector('.body')?.scrollTop || 0;  // keep your place when redrawing
    if (b.dataset.act === 'range') { range = b.dataset.r; render(); }
    if (b.dataset.act === 'pick') render(Number(b.dataset.i));
    const body = el.querySelector('.body'); if (body) body.scrollTop = scroll;
  };

  // ----- Press and hold the deficit/surplus number to choose which days count -----
  let holdTimer = null, holdAt = null;
  el.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('[data-o="balance"]')) return;
    holdAt = { x: e.clientX, y: e.clientY };
    holdTimer = setTimeout(() => { holdTimer = null; chooseDays(); }, 450);
  });
  const stopHold = () => { clearTimeout(holdTimer); holdTimer = null; };
  el.addEventListener('pointermove', (e) => { if (holdTimer && Math.hypot(e.clientX - holdAt.x, e.clientY - holdAt.y) > 10) stopHold(); });
  el.addEventListener('pointerup', stopHold);
  el.addEventListener('pointercancel', stopHold);
  el.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-o="balance"]')) e.preventDefault(); });

  function chooseDays() {
    const s = stats();
    const days = s.list.slice().sort().reverse(); // newest first
    const picked = new Set(days.filter((d) => !skipped.has(d)));
    const dayLine = (d) => {
      const diff = Math.round(byDay[d].kcal - targetFor(d).kcal);
      const label = parseDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return `<button class="tile row between day-pick ${picked.has(d) ? 'on' : ''}" data-act="day" data-d="${d}" aria-pressed="${picked.has(d)}" style="border:0;width:100%;text-align:left">
        <span class="row gap10"><span class="tick" aria-hidden="true"></span><span style="font-size:14px;font-weight:500">${label}</span></span>
        <span class="note">${fmt(byDay[d].kcal)} kcal · ${Math.abs(diff) < 25 ? 'on target' : `${fmt(Math.abs(diff))} ${diff < 0 ? 'under' : 'over'}`}</span></button>`;
    };
    const head = () => {
      const counted = days.filter((d) => picked.has(d));
      const net = counted.reduce((a, d) => a + byDay[d].kcal - targetFor(d).kcal, 0);
      const b = balanceOf(counted.length ? net / counted.length : 0, counted.length);
      return `<span class="h2">Days to count</span>
        <span class="note" style="font-size:13px">${b.num ? `${b.num} ${b.word}` : b.word} · ${counted.length} of ${days.length} days</span>`;
    };
    const sheet = openSheet(`
      <div style="padding:10px 24px 8px" class="stack gap10">
        <div class="handle"></div>
        <div class="row between"><div class="stack" data-o="dhead">${head()}</div>
          <button class="link" data-act="all" style="font-size:13px">${picked.size === days.length ? 'Count none' : 'Count all'}</button></div>
      </div>
      <div class="sheet-scroll" style="gap:8px" data-o="dlist">${days.map(dayLine).join('')}
        <span class="note center-text">Untick days you don't want in the average, like a sick day or a party. Only changes the deficit/surplus number.</span></div>
      <div class="sheet-foot"><button class="btn primary" data-act="done" style="width:100%">Done</button></div>`, { tall: true });
    // The finger is still down when this opens; don't let lifting it close the sheet via the backdrop
    const scrim = document.querySelector('#sheet-root .scrim');
    scrim.style.pointerEvents = 'none'; setTimeout(() => { scrim.style.pointerEvents = ''; }, 500);
    const redraw = () => {
      sheet.querySelector('[data-o="dhead"]').innerHTML = head();
      sheet.querySelectorAll('[data-act="day"]').forEach((b) => { const on = picked.has(b.dataset.d); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      sheet.querySelector('[data-act="all"]').textContent = picked.size === days.length ? 'Count none' : 'Count all';
    };
    sheet.onclick = async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'day') { const d = b.dataset.d; if (picked.has(d)) picked.delete(d); else picked.add(d); redraw(); }
      if (b.dataset.act === 'all') { const all = picked.size !== days.length; days.forEach((d) => (all ? picked.add(d) : picked.delete(d))); redraw(); }
      if (b.dataset.act === 'done') {
        days.forEach((d) => (picked.has(d) ? skipped.delete(d) : skipped.add(d)));
        await setKV('skipDays', [...skipped].filter((d) => byDay[d])); // keep only days that still have entries
        closeSheet(); render();
      }
    };
  }

  render();
}

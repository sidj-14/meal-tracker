// Week to date — weekly calorie budget, per-day bars against each day's target, and macro averages.

import { getTargets, targetOn, entriesBetween, getWeekStart } from '../store.js';
import { fmt, sum, dateStr, addDays, parseDate, shortDate, dayQuery } from '../util.js';
import { tabbar } from '../ui.js';

export default async function week(el) {
  const today = dateStr();
  const weekStart = await getWeekStart(); // 'mon' or 'sun'
  const dow = parseDate(today).getDay();  // 0 = Sunday
  const offset = weekStart === 'mon' ? (dow + 6) % 7 : dow;
  const start = addDays(today, -offset);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const [targetList, entries] = await Promise.all([getTargets(), entriesBetween(days[0], days[6])]);
  const fallback = { kcal: 2000, p: 0, c: 0, f: 0 };
  const none = { kcal: 0, p: 0, c: 0, f: 0 };
  const startedOn = targetList.length ? targetList[0].from : today; // the day you set your first target
  const perDay = days.map((d) => ({
    date: d,
    tracked: d >= startedOn,            // days before you started don't count toward the week
    target: d >= startedOn ? (targetOn(targetList, d) || fallback) : none,
    eaten: sum(entries.filter((e) => e.date === d)),
  }));

  const weekTarget = sum(perDay.map((x) => x.target));
  const eaten = sum(perDay.map((x) => x.eaten));
  const left = weekTarget.kcal - eaten.kcal;
  const daysLeft = days.filter((d) => d >= today).length;             // includes today
  const elapsed = Math.max(1, days.filter((d) => d <= today && d >= startedOn).length); // includes today
  const pct = weekTarget.kcal ? Math.min(100, (eaten.kcal / weekTarget.kcal) * 100) : 0;

  const max = Math.max(...perDay.map((x) => Math.max(x.target.kcal, x.eaten.kcal)), 1) * 1.1;
  const H = 120;
  const bars = perDay.map((x) => {
    const empty = x.date > today || !x.eaten.kcal;
    const h = empty ? 8 : Math.max(6, (x.eaten.kcal / max) * H);
    const color = empty ? 'var(--line)' : 'var(--accent)';
    const opacity = x.date === today ? 0.6 : 1;
    // Past days and today open that day on the Today screen
    const tag = x.date > today ? 'div' : 'a';
    return `<${tag} class="bar-col" ${tag === 'a' ? `href="#/today${dayQuery(x.date)}"` : ''} aria-label="${shortDate(x.date)}: ${fmt(x.eaten.kcal)} kcal">
      ${x.tracked ? `<div class="target-tick" style="bottom:${(x.target.kcal / max) * H}px"></div>` : ''}
      <div class="bar" style="height:${h}px;background:${color};opacity:${opacity}"></div></${tag}>`;
  }).join('');
  const labels = days.map((d) => {
    const letter = parseDate(d).toLocaleDateString('en-US', { weekday: 'narrow' });
    return `<span style="${d === today ? 'color:var(--ink);font-weight:600' : ''}">${letter}</span>`;
  }).join('');

  const t = targetOn(targetList, today) || fallback;
  const macroTile = (cls, label, key) => {
    const avg = eaten[key] / elapsed;
    const weekLeft = weekTarget[key] - eaten[key];
    return `<div class="${cls}" style="border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:4px;text-align:left">
      <span class="small">${label}</span><span style="font-weight:600;font-size:20px;color:var(--ink)">${fmt(avg)} g</span>
      <span class="small">of ${fmt(t[key])} · ${weekLeft >= 0 ? `${fmt(weekLeft)} g left` : `${fmt(-weekLeft)} g over`}</span></div>`;
  };

  el.innerHTML = `<div class="screen">
    <header class="head row between" style="align-items:flex-end">
      <div class="stack gap6"><span class="eyebrow">${shortDate(days[0])} – ${shortDate(days[6])}</span><h1 class="h1">This week</h1></div>
      <div class="seg"><a href="#/today">Day</a><span class="on">Week</span></div>
    </header>
    <div class="body">
      <div class="card">
        <div class="row between baseline">
          <div class="stack"><span class="small muted">${left >= 0 ? 'Week budget left' : 'Over week budget'}</span>
            <span class="h1">${fmt(Math.abs(left))} <span class="muted" style="font-family:var(--sans);font-size:14px;font-weight:500">kcal</span></span></div>
          <div class="stack" style="align-items:flex-end"><span class="small muted">Per remaining day</span>
            <span style="font-weight:600;font-size:18px">≈ ${fmt(Math.max(0, left) / daysLeft)}</span></div>
        </div>
        <div class="track"><div class="fill" style="width:${pct}%;background:var(--accent)"></div></div>
        <div class="row between note" style="font-size:13px"><span>${fmt(eaten.kcal)} of ${fmt(weekTarget.kcal)} eaten</span><span>Avg ${fmt(eaten.kcal / elapsed)} / day</span></div>
      </div>
      <div class="card" style="gap:12px">
        <span class="title">Daily calories</span>
        <div class="bars">${bars}</div>
        <div class="days">${labels}</div>
        <span class="note">Dashes = each day's target · tap a day to see or edit it</span>
      </div>
      <div class="card">
        <div class="row between"><span class="title">Macros, week to date</span><span class="note">avg / day vs target</span></div>
        <div class="tiles">
          ${macroTile('t-p', 'Protein', 'p')}${macroTile('t-c', 'Carbs', 'c')}${macroTile('t-f', 'Fat', 'f')}
        </div>
      </div>
    </div>
    ${tabbar('week')}
  </div>`;
}

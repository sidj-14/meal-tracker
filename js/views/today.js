// Today — calories left, macros left, and today's entries.

import { getTargets, targetOn, entriesOn, updateEntry, deleteEntry } from '../store.js';
import { esc, fmt, r1, sum, dateStr, longDate, amountText, ICON } from '../util.js';
import { tabbar, openSheet, closeSheet, amountSheet, toast } from '../ui.js';

const RING = 2 * Math.PI * 56; // circumference of the calorie ring

export default async function today(el) {
  const date = dateStr();
  const [targetList, entries] = await Promise.all([getTargets(), entriesOn(date)]);
  const t = targetOn(targetList, date) || { kcal: 2000, p: 0, c: 0, f: 0 };
  entries.sort((a, b) => a.createdAt - b.createdAt);
  const eaten = sum(entries);
  const kLeft = t.kcal - eaten.kcal;
  const over = kLeft < 0;

  // Cards on Today: one card per group (combined), and one card per ungrouped entry.
  const cards = [];
  const byGroup = {};
  for (const e of entries) {
    if (e.group) {
      if (!byGroup[e.group]) { byGroup[e.group] = { name: e.group, items: [] }; cards.push(byGroup[e.group]); }
      byGroup[e.group].items.push(e);
    } else {
      cards.push({ name: e.name, items: [e], single: true });
    }
  }

  const macro = (label, color, got, target) => {
    const left = target - got;
    const pct = target ? Math.min(100, (got / target) * 100) : 0;
    return `<div class="stack gap6">
      <div class="row between" style="font-size:14px"><span>${label}</span>
        <span><b>${fmt(got)}</b> / ${fmt(target)} g · <span class="muted">${left >= 0 ? `${fmt(left)} g left` : `${fmt(-left)} g over`}</span></span></div>
      <div class="track"><div class="fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;
  };

  el.innerHTML = `<div class="screen">
    <header class="head row between" style="align-items:flex-end">
      <div class="stack gap6"><span class="eyebrow">${longDate(date)}</span><h1 class="h1">Today</h1></div>
      <div class="seg"><span class="on">Day</span><a href="#/week">Week</a></div>
    </header>
    <div class="fixed-body">
      <div class="card row gap20" style="flex-direction:row;align-items:center">
        <div class="ring-wrap">
          <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
            <circle cx="66" cy="66" r="56" fill="none" stroke="#ECEAE5" stroke-width="12"/>
            <circle cx="66" cy="66" r="56" fill="none" stroke="${over ? 'var(--over)' : 'var(--accent)'}" stroke-width="12" stroke-linecap="round"
              stroke-dasharray="${Math.min(1, eaten.kcal / (t.kcal || 1)) * RING} ${RING}" transform="rotate(-90 66 66)"/>
          </svg>
          <div class="inner"><span class="num">${fmt(Math.abs(kLeft))}</span><span class="small muted">${over ? 'kcal over' : 'kcal left'}</span></div>
        </div>
        <div class="stack gap10">
          <div class="stack"><span class="small muted">Eaten</span><span style="font-weight:600;font-size:18px">${fmt(eaten.kcal)} kcal</span></div>
          <a href="#/targets" class="stack" style="text-decoration:none">
            <span class="small muted">Daily target <span style="color:var(--accent-ink);font-weight:600">· Edit</span></span>
            <span style="font-weight:600;font-size:18px">${fmt(t.kcal)} kcal</span></a>
        </div>
      </div>
      <div class="card" style="gap:16px">
        <span class="title">Macros</span>
        ${macro('Protein', 'var(--p)', eaten.p, t.p)}
        ${macro('Carbs', 'var(--c)', eaten.c, t.c)}
        ${macro('Fat', 'var(--f)', eaten.f, t.f)}
      </div>
      <div class="stack gap8" style="flex:1 1 0;min-height:150px">
        <div class="row between"><span class="title">Entries</span>${entries.length ? '<button class="link" data-act="all" style="font-size:13px;padding:6px 0">View all ›</button>' : ''}</div>
        <div class="entries">
          ${cards.length ? cards.map((card) => {
            const k = sum(card.items).kcal;
            const sub = card.single ? `${amountText(card.items[0].grams, card.items[0])} · P ${r1(card.items[0].p)} · C ${r1(card.items[0].c)} · F ${r1(card.items[0].f)}` : card.items.map((i) => i.name).join(', ');
            return `<button class="list-item" data-act="all"><span class="grow"><span class="name">${esc(card.name)}</span><span class="sub">${esc(sub)}</span></span><span class="kcal">${fmt(k)}</span></button>`;
          }).join('') : `<div class="empty">Nothing logged yet today.<br>Tap + below to add food.</div>`}
        </div>
      </div>
    </div>
    ${tabbar('today')}
  </div>`;

  el.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (b && b.dataset.act === 'all') openAll();
  };

  // ----- "Today's entries" sheet: everything, grouped, tap an item to edit it -----
  function openAll() {
    const groups = [];
    const loose = [];
    for (const c of cards) (c.single ? loose : groups).push(...(c.single ? c.items : [c]));
    const sections = groups.map((g) => ({ name: g.name, items: g.items }));
    if (loose.length) sections.push({ name: 'Not grouped', items: loose });

    const sheet = openSheet(`
      <div style="padding:10px 24px 8px" class="stack gap10">
        <div class="handle"></div>
        <div class="row between">
          <div class="stack"><span class="h2">Today's entries</span>
            <span class="note" style="font-size:13px">${entries.length} item${entries.length === 1 ? '' : 's'} · ${fmt(eaten.kcal)} kcal · P ${fmt(eaten.p)} · C ${fmt(eaten.c)} · F ${fmt(eaten.f)}</span></div>
          <button class="close" data-act="close" aria-label="Close">${ICON.close}</button>
        </div>
      </div>
      <div class="sheet-scroll">
        ${sections.map((s) => `<div class="stack gap6">
          <div class="row between baseline" style="padding:8px 0 2px"><span class="title">${esc(s.name)}</span><span class="note" style="font-size:13px">${fmt(sum(s.items).kcal)} kcal</span></div>
          ${s.items.map((i) => `<button class="tile row between" style="border:0;text-align:left;width:100%" data-act="edit" data-id="${i.id}">
            <span class="stack gap6"><span style="font-weight:500;font-size:14px">${esc(i.name)}</span><span class="note">${amountText(i.grams, i)} · P ${r1(i.p)} · C ${r1(i.c)} · F ${r1(i.f)}</span></span>
            <span style="font-weight:600;font-size:14px">${fmt(i.kcal)}</span></button>`).join('')}
        </div>`).join('')}
        <span class="note center-text">Tap an item to change the amount or group, or to delete it.</span>
      </div>
      <div class="sheet-foot"><a class="btn primary" href="#/add">${ICON.plusSm} Add food</a></div>`, { tall: true });

    sheet.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'close') closeSheet();
      if (b.dataset.act === 'edit') {
        const entry = entries.find((x) => x.id === b.dataset.id);
        amountSheet({
          food: { name: entry.name, per100: entry.per100, servingG: entry.servingG, baseUnit: entry.baseUnit, servingQty: entry.servingQty, servingUnit: entry.servingUnit }, grams: entry.grams, group: entry.group, mode: 'edit',
          onSubmit: async (grams, group) => { await updateEntry(entry, grams, group); closeSheet(); toast('Saved'); today(el); },
          onDelete: async () => { await deleteEntry(entry.id); closeSheet(); toast('Deleted'); today(el); },
        });
      }
    };
  }
}

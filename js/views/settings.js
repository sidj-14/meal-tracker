// Settings — profile, links to targets and meal groups, week start, backup and restore.

import { kv, getProfile, setProfile, getTargets, targetOn, getWeekStart, setKV, getGroups, setGroups, BUILTIN_GROUPS, exportAll, importAll } from '../store.js';
import { esc, fmt, dateStr, ICON } from '../util.js';
import { tabbar, openSheet, closeSheet, toast } from '../ui.js';

export default async function settings(el) {
  const [profile, targetList, weekStart] = await Promise.all([getProfile(), getTargets(), getWeekStart()]);
  const t = targetOn(targetList, dateStr());
  const groups = await getGroups();
  const usdaKey = await kv('usdaKey', '');

  const input = (key, label, unit, width = 72, mode = 'numeric') => `
    <label class="form-row"><span>${label}</span>
      <span class="row gap6"><input class="num-in" style="width:${width}px" data-k="${key}" inputmode="${mode}" value="${esc(profile[key])}" aria-label="${label}">${unit ? `<span class="unit" style="width:22px">${unit}</span>` : ''}</span>
    </label>`;

  el.innerHTML = `<div class="screen">
    <header class="head"><h1 class="h1">Settings</h1></header>
    <div class="body">
      <div class="card row gap14" style="flex-direction:row;padding:18px 20px">
        <div data-o="avatar" style="width:52px;height:52px;border-radius:999px;background:#E4ECE2;color:var(--accent-ink);display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-weight:600;font-size:20px;flex-shrink:0"></div>
        <div class="stack"><span data-o="name" style="font-weight:600;font-size:16px"></span><span class="note" style="font-size:13px">Data saved on this phone</span></div>
      </div>

      <div class="card" style="gap:12px;padding:18px 20px">
        <span class="title">Profile</span>
        <label class="form-row"><span>Name</span><input class="num-in" style="width:170px;font-weight:500" data-k="name" value="${esc(profile.name)}" aria-label="Name" inputmode="text" maxlength="40"></label>
        ${input('age', 'Age', 'yrs')}
        <div class="form-row"><span>Height</span>
          <span class="row gap6"><input class="num-in sm" data-k="ft" inputmode="numeric" value="${esc(profile.ft)}" aria-label="Height, feet"><span class="unit" style="width:auto">ft</span>
          <input class="num-in sm" data-k="inch" inputmode="numeric" value="${esc(profile.inch)}" aria-label="Height, inches"><span class="unit" style="width:22px">in</span></span></div>
        ${input('lb', 'Weight', 'lb', 72, 'decimal')}
      </div>

      <div class="card tight">
        <a class="setting-row" href="#/targets"><span>Daily targets</span><span class="val">${t ? `${fmt(t.kcal)} kcal` : 'Not set'} ›</span></a>
        <button class="setting-row" data-act="groups"><span>Meal groups</span><span class="val">${BUILTIN_GROUPS.length + groups.length} groups ›</span></button>
        <div class="setting-row"><span>Week starts on</span>
          <div class="seg"><button class="${weekStart === 'mon' ? 'on' : ''}" data-act="ws" data-v="mon">Mon</button><button class="${weekStart === 'sun' ? 'on' : ''}" data-act="ws" data-v="sun">Sun</button></div></div>
      </div>

      <div class="card" style="gap:10px;padding:18px 20px">
        <span class="title">Food search key <span class="small muted" style="font-weight:400">(optional)</span></span>
        <span class="note">Food search uses USDA's free database and works without setup. If you ever see a search limit message, get your own free key at <a href="https://api.data.gov/signup/" target="_blank" rel="noopener">api.data.gov/signup</a> and paste it here.</span>
        <input class="field" data-key="usda" value="${esc(usdaKey)}" placeholder="Paste your key" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="USDA API key">
      </div>

      <div class="card tight">
        <button class="setting-row" data-act="export"><span>Back up my data</span><span class="val">Export ›</span></button>
        <label class="setting-row" style="cursor:pointer"><span>Restore from a backup</span><span class="val">Import ›</span>
          <input type="file" accept="application/json,.json" data-act="import" hidden></label>
      </div>
      <span class="note center-text">Meal Tracker · version 2.8</span>
    </div>
    ${tabbar('settings')}
  </div>`;

  const $ = (k) => el.querySelector(`[data-o="${k}"]`);
  const showName = () => {
    const n = (profile.name || '').trim();
    $('name').textContent = n || 'Your profile';
    $('avatar').textContent = n ? n[0].toUpperCase() : '·';
  };
  showName();

  el.querySelector('[data-key="usda"]').addEventListener('change', async (e) => { await setKV('usdaKey', e.target.value.trim()); toast('Key saved'); });

  // Profile fields save as you type.
  el.querySelectorAll('[data-k]').forEach((inp) => {
    inp.addEventListener('input', () => { profile[inp.dataset.k] = inp.value; showName(); setProfile(profile); });
  });

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'ws') { await setKV('weekStart', b.dataset.v); settings(el); }
    if (act === 'groups') manageGroups();
    if (act === 'export') exportBackup();
  };

  el.querySelector('[data-act="import"]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const sheet = openSheet(`<div class="sheet-pad"><div class="handle"></div>
      <span class="h2">Restore backup?</span>
      <span class="muted">This replaces everything on this phone with the contents of <b>${esc(file.name)}</b>.</span>
      <button class="btn primary" data-act="yes">Replace my data</button><button class="btn text" data-act="no">Cancel</button></div>`);
    sheet.onclick = async (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'no') { closeSheet(); e.target.value = ''; return; }
      try {
        await importAll(JSON.parse(await file.text()));
        closeSheet(); toast('Backup restored'); settings(el);
      } catch (err) { closeSheet(); toast(err.message || 'Could not read that file'); }
    };
  });

  async function exportBackup() {
    const data = JSON.stringify(await exportAll(), null, 1);
    const name = `meal-tracker-backup-${dateStr()}.json`;
    const file = new File([data], name, { type: 'application/json' });
    // On iPhone, the share sheet lets you save to Files, AirDrop it, or email it to yourself.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function manageGroups() {
    const render = () => `<div class="sheet-pad"><div class="handle"></div>
      <div class="row between"><span class="h2">Meal groups</span><button class="close" data-act="close" aria-label="Close">${ICON.close}</button></div>
      <span class="note">Optional tags for grouping entries. Breakfast, Lunch and Dinner are built in.</span>
      <div class="chips">${BUILTIN_GROUPS.map((g) => `<span class="chip">${g}</span>`).join('')}</div>
      ${groups.length ? `<div class="stack gap8">${groups.map((g, i) => `<div class="tile row between"><span>${esc(g)}</span><button class="btn text danger" style="height:32px" data-act="del" data-i="${i}">Delete</button></div>`).join('')}</div>` : ''}
      <div class="row gap8"><input class="field" data-o="newg" placeholder="New group, e.g. Evening snack" maxlength="30" aria-label="New group name"><button class="btn dark sm" data-act="addg">Add</button></div>
      <span class="note">Deleting a group doesn't change entries you've already logged.</span></div>`;
    const sheet = openSheet(render());
    sheet.onclick = async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'close') { closeSheet(); settings(el); return; }
      if (b.dataset.act === 'del') groups.splice(Number(b.dataset.i), 1);
      if (b.dataset.act === 'addg') {
        const name = sheet.querySelector('[data-o="newg"]').value.trim();
        const exists = BUILTIN_GROUPS.concat(groups).some((g) => g.toLowerCase() === name.toLowerCase());
        if (!name || exists) { toast(exists ? 'That group already exists' : 'Type a name first'); return; }
        groups.push(name);
      }
      await setGroups(groups);
      sheet.innerHTML = render();
    };
  }
}

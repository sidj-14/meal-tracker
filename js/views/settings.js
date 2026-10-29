// Settings — profile, links to targets and meal groups, week start, backup and restore.

import { kv, getProfile, setProfile, getTargets, targetOn, getWeekStart, setKV, getGroups, setGroups, BUILTIN_GROUPS, exportAll, importAll } from '../store.js';
import { esc, fmt, dateStr, ICON } from '../util.js';
import { tabbar, openSheet, closeSheet, toast } from '../ui.js';

export default async function settings(el) {
  const [profile, targetList, weekStart] = await Promise.all([getProfile(), getTargets(), getWeekStart()]);
  const t = targetOn(targetList, dateStr());
  const groups = await getGroups();
  const usdaKey = await kv('usdaKey', '');
  // Profile picture: { type: 'emoji', value: '🥑' } or { type: 'photo', value: 'data:image/jpeg;base64,...' } or null
  let avatar = await kv('avatar', null);
  // Weight is stored in pounds (profile.lb); you can view and type it in kg instead.
  let wUnit = profile.weightUnit || 'lb';
  const LB_PER_KG = 2.20462;
  const round1 = (x) => Math.round(x * 10) / 10;
  function shownWeight() {
    const lb = parseFloat(profile.lb);
    if (!Number.isFinite(lb)) return profile.lb || '';
    return String(wUnit === 'kg' ? round1(lb / LB_PER_KG) : round1(lb));
  }

  const input = (key, label, unit, width = 72, mode = 'numeric') => `
    <label class="form-row"><span>${label}</span>
      <span class="row gap6"><input class="num-in" style="width:${width}px" data-k="${key}" inputmode="${mode}" value="${esc(profile[key])}" aria-label="${label}">${unit ? `<span class="unit" style="width:22px">${unit}</span>` : ''}</span>
    </label>`;

  el.innerHTML = `<div class="screen">
    <header class="head"><h1 class="h1">Settings</h1></header>
    <div class="body">
      <div class="card row gap14" style="flex-direction:row;padding:18px 20px">
        <button class="avatar" data-act="avatar" aria-label="Change profile picture"><span data-o="avatar" class="avatar-face"></span><span class="avatar-edit" aria-hidden="true">✎</span></button>
        <div class="stack"><span data-o="name" style="font-weight:600;font-size:16px"></span><span class="note" style="font-size:13px">Data saved on this phone</span></div>
      </div>

      <div class="card" style="gap:12px;padding:18px 20px">
        <span class="title">Profile</span>
        <label class="form-row"><span>Name</span><input class="num-in" style="width:170px;font-weight:500" data-k="name" value="${esc(profile.name)}" aria-label="Name" inputmode="text" maxlength="40"></label>
        ${input('age', 'Age', 'yrs')}
        <div class="form-row"><span>Height</span>
          <span class="row gap6"><input class="num-in sm" data-k="ft" inputmode="numeric" value="${esc(profile.ft)}" aria-label="Height, feet"><span class="unit" style="width:auto">ft</span>
          <input class="num-in sm" data-k="inch" inputmode="numeric" value="${esc(profile.inch)}" aria-label="Height, inches"><span class="unit" style="width:22px">in</span></span></div>
        <div class="form-row"><span>Weight</span>
          <span class="row gap6"><input class="num-in" style="width:72px" data-o="weight" inputmode="decimal" value="${esc(shownWeight())}" aria-label="Weight in ${wUnit}">
          <div class="seg" style="padding:2px"><button class="${wUnit === 'lb' ? 'on' : ''}" data-act="wunit" data-v="lb" style="padding:5px 10px">lb</button><button class="${wUnit === 'kg' ? 'on' : ''}" data-act="wunit" data-v="kg" style="padding:5px 10px">kg</button></div></span></div>
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
      <span class="note center-text">Meal Tracker · version 2.16</span>
    </div>
    ${tabbar('settings')}
  </div>`;

  const $ = (k) => el.querySelector(`[data-o="${k}"]`);
  const showName = () => {
    const n = (profile.name || '').trim();
    $('name').textContent = n || 'Your profile';
    // Photo, emoji, or the first letter of your name
    const a = $('avatar');
    if (avatar?.type === 'photo') a.innerHTML = `<img src="${avatar.value}" alt="">`;
    else if (avatar?.type === 'emoji') { a.textContent = avatar.value; a.className = 'avatar-face emoji'; return; }
    else a.textContent = n ? n[0].toUpperCase() : '·';
    a.className = 'avatar-face';
  };
  showName();

  el.querySelector('[data-key="usda"]').addEventListener('change', async (e) => { await setKV('usdaKey', e.target.value.trim()); toast('Key saved'); });

  // Profile fields save as you type.
  el.querySelector('[data-o="weight"]').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    profile.lb = Number.isFinite(v) ? String(wUnit === 'kg' ? round1(v * LB_PER_KG) : v) : e.target.value;
    setProfile(profile);
  });
  el.querySelectorAll('[data-k]').forEach((inp) => {
    inp.addEventListener('input', () => { profile[inp.dataset.k] = inp.value; showName(); setProfile(profile); });
  });

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'ws') { await setKV('weekStart', b.dataset.v); settings(el); }
    if (act === 'wunit') {
      wUnit = b.dataset.v; profile.weightUnit = wUnit; await setProfile(profile);
      el.querySelector('[data-o="weight"]').value = shownWeight();
      el.querySelectorAll('[data-act="wunit"]').forEach((x) => x.classList.toggle('on', x.dataset.v === wUnit));
    }
    if (act === 'groups') manageGroups();
    if (act === 'avatar') pickAvatar();
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

  // ----- Profile picture: pick an emoji, type any emoji, or choose a photo (e.g. a cartoon of yourself) -----
  const EMOJIS = ['😀', '😎', '🤓', '🥳', '😇', '🙂', '🧑', '👩', '👨', '🧕', '👩‍🦱', '👨‍🦱', '👩‍🦰', '👱‍♀️', '🧔', '👵',
    '🏃‍♀️', '🏋️‍♀️', '🧘‍♀️', '🚴‍♀️', '💃', '🥑', '🥗', '🍓', '🍑', '🥦', '🍳', '🍜', '🐱', '🐶', '🦊', '🐼'];
  function pickAvatar() {
    const sheet = openSheet(`<div class="sheet-pad">
      <div class="handle"></div>
      <div class="row between"><span class="h2">Profile picture</span><button class="close" data-act="close" aria-label="Close">${ICON.close}</button></div>
      <div class="emoji-grid">${EMOJIS.map((e) => `<button class="emoji-btn" data-act="emoji" data-e="${e}" aria-label="${e}">${e}</button>`).join('')}</div>
      <div class="row gap8"><input class="field" data-o="ownEmoji" placeholder="Or type any emoji" aria-label="Type an emoji" maxlength="16" style="flex:1"><button class="btn dark sm" data-act="useOwn">Use</button></div>
      <label class="btn soft" style="cursor:pointer">Choose a photo or cartoon<input type="file" accept="image/*" hidden data-o="photo"></label>
      ${avatar ? '<button class="btn text danger" data-act="remove">Remove picture</button>' : ''}
      <span class="note center-text">Saved on this phone only. Tip: save a Memoji or Bitmoji image to Photos, then choose it here.</span>
    </div>`);
    const save = async (a) => { avatar = a; await setKV('avatar', a); closeSheet(); showName(); toast(a ? 'Picture updated' : 'Picture removed'); };
    sheet.querySelector('[data-o="photo"]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try { await save({ type: 'photo', value: await squarePhoto(file) }); } catch { toast("Couldn't open that picture"); }
    });
    sheet.onclick = async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'close') closeSheet();
      if (b.dataset.act === 'emoji') save({ type: 'emoji', value: b.dataset.e });
      if (b.dataset.act === 'useOwn') {
        const v = sheet.querySelector('[data-o="ownEmoji"]').value.trim();
        // keep just the first emoji/character typed (emoji can be several code points, so use the browser's splitter)
        const first = v && (window.Intl?.Segmenter ? [...new Intl.Segmenter().segment(v)][0].segment : [...v][0]);
        if (!first) { toast('Type an emoji first'); return; }
        save({ type: 'emoji', value: first });
      }
      if (b.dataset.act === 'remove') save(null);
    };
  }
  // Crop a photo to a centered square and shrink it to 256×256, so it's small enough to keep in the app's storage
  async function squarePhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 256); // transparent stickers get a white background
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
      return c.toDataURL('image/jpeg', 0.85);
    } finally { URL.revokeObjectURL(url); }
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

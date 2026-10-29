// scanner.js — reads a barcode from a photo.
//
// Why a photo instead of a live camera view? iPhone Home Screen web apps ask for camera
// permission every time a page opens the camera itself. Taking a photo through the phone's
// own camera (a file input with capture="environment") needs no permission at all.
//
// ZXing (vendor/zxing-browser.min.js) finds the barcode in the photo. It's loaded the first
// time you scan.

import { esc, ICON } from './util.js';
import { closeSheet, openSheet } from './ui.js';

let libPromise;
function loadLibrary() {
  if (window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/zxing-browser.min.js';
      s.onload = () => resolve(window.ZXingBrowser);
      s.onerror = () => { libPromise = null; reject(new Error('Could not load the barcode reader')); };
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't open that photo")); };
    img.src = url; // <img> applies the photo's rotation for us
  });
}

// Draw (part of) the photo onto a canvas at a size ZXing handles quickly.
function toCanvas(img, crop = 1, maxSide = 1600) {
  const sw = img.naturalWidth * crop, sh = img.naturalHeight * crop;
  const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

// Returns the barcode digits, or null if none was found.
export async function decodePhoto(file) {
  const ZX = await loadLibrary();
  const F = ZX.BarcodeFormat;
  // Hint 2 = which formats (food barcodes only), hint 3 = "try harder" (also tries the photo turned 90°)
  const reader = new ZX.BrowserMultiFormatReader(new Map([[2, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E]], [3, true]]));
  const { img, url } = await loadImage(file);
  try {
    // Whole photo first, then zoom into the middle (where people usually aim).
    for (const [crop, size] of [[1, 1600], [0.6, 1600], [0.4, 1200], [1, 2400]]) {
      try { return reader.decodeFromCanvas(toCanvas(img, crop, size)).getText(); } catch { /* not found at this zoom */ }
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The sheet shown after you take the photo: progress, then retry / type-the-number if needed.
// onCode(code, setStatus) runs once a barcode is found or typed.
export async function scanFromPhoto(file, onCode) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `<div class="scrim"></div><div class="sheet" role="dialog" aria-label="Barcode"><div class="sheet-pad">
    <div class="handle"></div>
    <div class="row between"><span class="h2">Barcode</span><button class="close" data-act="close" aria-label="Close">${ICON.close}</button></div>
    <span data-o="status" class="muted">Reading barcode…</span>
    <div data-o="retry" hidden class="stack gap10">
      <label class="btn primary" style="cursor:pointer">${ICON.barcode} Take another photo
        <input type="file" accept="image/*" capture="environment" hidden data-o="again"></label>
      <span class="note">Tip: fill most of the photo with the barcode, hold the phone flat and avoid glare.</span>
    </div>
    <form class="row gap8" data-o="manual">
      <input class="field" inputmode="numeric" pattern="[0-9]*" placeholder="Or type the barcode number" aria-label="Barcode number" maxlength="14">
      <button class="btn dark sm" type="submit">Look up</button>
    </form>
  </div></div>`;
  root.classList.add('open');
  root.querySelector('.scrim').onclick = closeSheet;
  root.querySelector('[data-act="close"]').onclick = closeSheet;

  const status = root.querySelector('[data-o="status"]');
  const setStatus = (msg) => { status.innerHTML = esc(msg); };
  const found = (code) => { root.querySelector('[data-o="retry"]').hidden = true; setStatus(`Found ${code} — looking it up…`); onCode(code, setStatus); };

  root.querySelector('[data-o="manual"]').onsubmit = (e) => {
    e.preventDefault();
    const code = e.target.querySelector('input').value.replace(/\D/g, '');
    if (code.length >= 6) found(code); else setStatus('Barcodes are usually 8–13 digits.');
  };
  root.querySelector('[data-o="again"]').onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) tryDecode(f);
  };

  async function tryDecode(f) {
    root.querySelector('[data-o="retry"]').hidden = true;
    setStatus('Reading barcode…');
    try {
      const code = await decodePhoto(f);
      if (code) { found(code); return; }
      setStatus("Couldn't find a barcode in that photo.");
    } catch (err) {
      setStatus(err.message || "Couldn't read that photo.");
    }
    root.querySelector('[data-o="retry"]').hidden = false;
  }

  tryDecode(file);
}

// The menu behind the barcode button: take a photo, pick one from Photos (e.g. a screenshot), or type the number.
// onCode(code, setStatus) runs once a barcode is found or typed.
export function barcodeMenu(onCode) {
  const camera = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  const photos = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>';
  const keys = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8"/></svg>';
  const sheet = openSheet(`<div class="sheet-pad">
    <div class="handle"></div>
    <div class="row between"><span class="h2">Barcode</span><button class="close" data-act="close" aria-label="Close">${ICON.close}</button></div>
    <div class="stack gap8">
      <label class="tile menu-opt">${camera}<span class="grow"><b>Take a photo</b><span class="note">Point at the barcode and snap</span></span><span class="muted">›</span>
        <input type="file" accept="image/*" capture="environment" hidden data-o="cam"></label>
      <label class="tile menu-opt">${photos}<span class="grow"><b>Choose from Photos</b><span class="note">A photo or screenshot of a barcode</span></span><span class="muted">›</span>
        <input type="file" accept="image/*" hidden data-o="lib"></label>
      <button class="tile menu-opt" data-act="type">${keys}<span class="grow"><b>Type the barcode number</b><span class="note">The digits under the bars</span></span><span class="muted">›</span></button>
    </div>
    <form class="stack gap8" data-o="manual" hidden>
      <div class="row gap8">
        <input class="field" inputmode="numeric" pattern="[0-9]*" placeholder="e.g. 012345678905" aria-label="Barcode number" maxlength="14">
        <button class="btn dark sm" type="submit">Look up</button>
      </div>
      <span class="note" data-o="status"></span>
    </form>
  </div>`);
  const pick = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) scanFromPhoto(f, onCode); };
  sheet.querySelector('[data-o="cam"]').onchange = pick;
  sheet.querySelector('[data-o="lib"]').onchange = pick;
  const form = sheet.querySelector('[data-o="manual"]');
  const setStatus = (msg) => { sheet.querySelector('[data-o="status"]').textContent = msg; };
  sheet.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'close') closeSheet();
    if (b.dataset.act === 'type') { form.hidden = false; form.querySelector('input').focus(); }
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const code = form.querySelector('input').value.replace(/\D/g, '');
    if (code.length < 6) { setStatus('Barcodes are usually 8–13 digits.'); return; }
    setStatus(`Looking up ${code}…`);
    onCode(code, setStatus);
  };
}

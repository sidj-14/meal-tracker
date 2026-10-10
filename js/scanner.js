// scanner.js — full-screen camera view that reads a barcode.
//
// Safari has no reliable built-in barcode reader, so we load ZXing (vendor/zxing-browser.min.js)
// the first time you scan. It looks at the live camera picture and reports the number it sees.

import { esc, ICON } from './util.js';
import { closeSheet } from './ui.js';

let libPromise;
function loadLibrary() {
  if (window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/zxing-browser.min.js';
      s.onload = () => resolve(window.ZXingBrowser);
      s.onerror = () => { libPromise = null; reject(new Error('Could not load the scanner')); };
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

// onCode(code, setStatus) is called once with the barcode digits.
export function openScanner(onCode) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `<div class="scanner">
    <video playsinline muted autoplay></video>
    <div class="scan-frame" aria-hidden="true"></div>
    <div class="scan-top"><button class="close" data-act="close" aria-label="Close scanner">${ICON.close}</button></div>
    <div class="scan-bottom">
      <span class="scan-status" data-o="status">Starting camera…</span>
      <form class="row gap8" data-o="manual">
        <input class="field" inputmode="numeric" pattern="[0-9]*" placeholder="Or type the barcode number" aria-label="Barcode number" maxlength="14">
        <button class="btn dark sm" type="submit">Look up</button>
      </form>
    </div>
  </div>`;
  root.classList.add('open');

  const video = root.querySelector('video');
  const status = root.querySelector('[data-o="status"]');
  const setStatus = (msg) => { status.innerHTML = esc(msg); };
  let controls = null;
  let done = false;

  const stop = () => { try { controls?.stop(); } catch { /* already stopped */ } controls = null; };
  const finish = (code) => {
    if (done) return;
    done = true;
    stop();
    if (navigator.vibrate) navigator.vibrate(40);
    setStatus(`Found ${code} — looking it up…`);
    onCode(code, setStatus);
  };

  root.querySelector('[data-act="close"]').onclick = () => { done = true; stop(); closeSheet(); };
  root.querySelector('[data-o="manual"]').onsubmit = (e) => {
    e.preventDefault();
    const code = e.target.querySelector('input').value.replace(/\D/g, '');
    if (code.length >= 6) finish(code); else setStatus('Barcodes are usually 8–13 digits.');
  };

  (async () => {
    try {
      const ZX = await loadLibrary();
      const reader = new ZX.BrowserMultiFormatReader();
      const F = ZX.BarcodeFormat;
      reader.possibleFormats = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E]; // food barcodes only = faster, fewer misreads
      if (done) return;
      controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        video,
        (result) => { if (result) finish(result.getText()); },
      );
      if (done) stop(); else setStatus('Point the camera at the barcode');
    } catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      setStatus(denied
        ? 'Camera access is off. Allow it in iPhone Settings → Safari → Camera, or type the number below.'
        : 'Camera not available. Type the barcode number below.');
    }
  })();

  // Closing the sheet any other way (e.g. navigating) also turns the camera off.
  const observer = new MutationObserver(() => { if (!root.contains(video)) { done = true; stop(); observer.disconnect(); } });
  observer.observe(root, { childList: true });
}

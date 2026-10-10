// label-reader.js — runs OCR on a photo of a nutrition label, entirely on the phone.
//
// Uses Tesseract.js (open source), stored in vendor/tesseract so it doesn't depend on another site.
// The first time, the phone downloads about 7 MB (the OCR engine + English language data);
// after that it's cached and works offline.

import { parseLabel } from './label-parser.js';

let libPromise;
function loadLibrary() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/tesseract/tesseract.min.js';
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => { libPromise = null; reject(new Error('Could not load the label reader')); };
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

// Shrink big phone photos, make them grey and boost contrast: faster and more accurate OCR.
async function prepare(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't open that photo"));
      i.src = url; // <img> applies the photo's rotation (EXIF) for us
    });
    const scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    let min = 255, max = 0;
    for (let i = 0; i < px.length; i += 4) {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      px[i] = px[i + 1] = px[i + 2] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const range = Math.max(1, max - min);
    for (let i = 0; i < px.length; i += 4) {
      const v = ((px[i] - min) / range) * 255; // stretch to full black-to-white
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// onProgress(text) gets short status messages. Resolves with { ...parsed, text }.
export async function readLabel(file, onProgress = () => {}) {
  onProgress('Preparing photo…');
  const [Tesseract, canvas] = await Promise.all([loadLibrary(), prepare(file)]);
  const base = new URL('vendor/tesseract/', location.href).href;
  onProgress('Loading label reader…');
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}core/`,
    langPath: `${base}lang/`,
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(`Reading label… ${Math.round(m.progress * 100)}%`);
    },
  });
  try {
    const { data } = await worker.recognize(canvas);
    return { ...parseLabel(data.text || ''), text: data.text || '' };
  } finally {
    worker.terminate();
  }
}

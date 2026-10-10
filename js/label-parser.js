// label-parser.js — turns the text read from a Nutrition Facts photo into numbers.
//
// OCR (reading text from a picture) is never perfect, so this is forgiving:
// it looks for each label word ("Calories", "Total Fat", ...) and takes the first number after it.
// Everything it finds is only a pre-fill; you check it against the label before saving.
//
// Handles US labels (values per serving, "Serving size 1 cup (228g)") and
// EU-style labels (values "per 100 g", energy in "kcal").

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;

function clean(text) {
  return text
    .replace(/\r/g, '')
    .replace(/[|]/g, ' ')
    // common OCR slips inside amounts: "1Og" -> "10g", "Og" -> "0g", "l2g" -> "12g"
    .replace(/(\d)[oO](?=\s*m?g\b)/g, '$10')
    .replace(/(^|[\s(])[oO](?=\s*m?g\b)/g, '$10')
    .replace(/(^|[\s(])[lI](?=\d)/g, '$11')
    .replace(/(\d),(\d)/g, '$1.$2');
}

// First number after `label` on the same line (or the next line, for big "Calories" headers).
function after(lines, label, { unit = '', skip = null } = {}) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(label);
    if (!m || (skip && skip.test(line))) continue;
    const rest = line.slice(m.index + m[0].length);
    const re = new RegExp(`${NUM}\\s*${unit}`, 'i');
    const hit = rest.match(re) || (lines[i + 1] || '').match(new RegExp(`^\\s*${NUM}\\s*${unit}`, 'i'));
    if (hit) return { value: parseFloat(hit[1]), raw: hit[0], hasUnit: !!unit || /g\b/i.test(hit[0]) };
  }
  return null;
}

// "12g" sometimes reads as "129" (g looks like 9). A macro over 100 g per serving with no unit is suspicious.
function fixGram(hit, perServing) {
  if (!hit) return null;
  let v = hit.value;
  if (perServing && v >= 100 && !/g\b/i.test(hit.raw) && String(v).endsWith('9')) v = Math.floor(v / 10);
  return v;
}

export function parseLabel(text) {
  const lines = clean(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const all = lines.join(' ');
  const per100ml = /per\s*100\s*ml/i.test(all) && /kcal/i.test(all);
  const per100 = per100ml || (/per\s*100\s*g/i.test(all) && /kcal/i.test(all)); // EU-style label

  const out = { basis: per100ml ? 'ml100' : per100 ? 'g100' : 'serving', servingQty: null, servingUnit: null, kcal: null, p: null, c: null, f: null, found: 0 };

  // Serving size: "2/3 cup (55g)", "1 can (355 mL)", "8 fl oz (240mL)", "1 oz (28g)", "Serving Size 30 g".
  // Prefer the metric amount in brackets; otherwise take g / ml / fl oz / oz as printed.
  const sizeLine = lines.findIndex((l) => /serving\s*size/i.test(l));
  if (sizeLine >= 0) {
    const t = `${lines[sizeLine]} ${lines[sizeLine + 1] || ''}`.replace(/serving\s*size/i, '');
    const unitOf = (u) => { u = u.toLowerCase().replace(/\s|\./g, ''); return u === 'floz' ? 'fl oz' : u.startsWith('g') ? 'g' : u === 'ml' ? 'ml' : 'oz'; };
    const metric = t.match(new RegExp(`\\(\\s*${NUM}\\s*(g|grams?|ml)\\s*\\)`, 'i'));
    const any = t.match(new RegExp(`${NUM}\\s*(fl\\.?\\s*oz|ml|g|grams?|oz)\\b`, 'i'));
    const g9 = t.match(/\((\d+)9\)/); // "(55g)" often reads as "(559)"
    const hit = metric || any;
    if (hit) { out.servingQty = parseFloat(hit[1]); out.servingUnit = unitOf(hit[2]); }
    else if (g9) { out.servingQty = parseFloat(g9[1]); out.servingUnit = 'g'; }
  }

  // Calories: US "Calories 230"; EU "Energy 1046 kJ / 250 kcal"
  if (per100) {
    const k = all.match(new RegExp(`${NUM}\\s*kcal`, 'i'));
    if (k) out.kcal = parseFloat(k[1]);
  }
  if (out.kcal === null) {
    // "Calories 250" — but not "Calories from Fat 110"; allow the number to be on the next line
    const k = all.match(/calories(?!\s*from)[^\d%]{0,15}(\d+)/i);
    if (k) out.kcal = parseFloat(k[1]);
  }

  const perServing = !per100;
  out.f = fixGram(after(lines, /total\s*fat|^fat\b|\bfat\b/i, { skip: /saturated|trans|poly|mono|calories\s*from/i }), perServing);
  out.c = fixGram(after(lines, /total\s*carb\w*|carbohydrates?|\bcarbs?\b/i, { skip: /fib(er|re)/i }), perServing);
  out.p = fixGram(after(lines, /protein/i), perServing);

  out.found = ['kcal', 'p', 'c', 'f'].filter((k) => out[k] !== null).length + (out.servingQty ? 1 : 0);
  return out;
}

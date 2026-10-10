// app.js — the entry point. It decides which screen to show based on the URL hash
// ('#/today', '#/week', ...) and registers the service worker for offline use.

import { kv } from './store.js';
import { nav, closeSheet } from './ui.js';
import welcome from './views/welcome.js';
import targets from './views/targets.js';
import today from './views/today.js';
import week from './views/week.js';
import add from './views/add.js';
import create from './views/create.js';
import trends from './views/trends.js';
import settings from './views/settings.js';

const views = { welcome, targets, today, week, add, create, trends, settings };

async function route() {
  // Count how deep we are in the app's own history, so "Back" knows whether there is somewhere to go.
  if (nav.replacing) nav.replacing = false; else nav.depth += 1;

  const [rawPath, query] = location.hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query || '');
  let path = rawPath;

  // First launch: show Welcome, then Targets, before anything else.
  const onboarded = await kv('onboarded', false);
  if (!onboarded && path !== 'targets') path = 'welcome';
  if (onboarded && (!path || path === 'welcome' || !views[path])) path = 'today';

  closeSheet();
  const el = document.getElementById('app');
  try {
    await views[path](el, params);
  } catch (err) {
    console.error(err);
    el.innerHTML = `<div class="welcome"><div class="stack gap10"><span class="h2">Something went wrong</span><span class="muted">${String(err.message || err)}</span></div><a class="btn primary" href="#/today">Back to Today</a></div>`;
  }
}

window.addEventListener('hashchange', route);
route();

// Service worker = a small script the browser keeps around so the app opens offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(console.error);
  });
  // When a new version takes over, reload once so you see it immediately.
  // (Skip on the very first visit, when there was no old version to replace.)
  const hadOldVersion = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadOldVersion) return;
    reloaded = true;
    location.reload();
  });
}
// Ask the browser not to clear our data when storage is low.
navigator.storage?.persist?.();

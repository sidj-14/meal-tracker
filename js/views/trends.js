// Trends — placeholder until phase 2 (week / month / year history).

import { tabbar } from '../ui.js';

export default async function trends(el) {
  el.innerHTML = `<div class="screen">
    <header class="head"><h1 class="h1">Trends</h1></header>
    <div class="body">
      <div class="card">
        <span class="title">Coming in the next update</span>
        <span class="muted" style="line-height:1.5">Week, month and year views of your calories against your target line, days within target, protein goal streaks and your macro split.</span>
        <span class="note">Everything you log now is saved, so trends will include it.</span>
      </div>
    </div>
    ${tabbar('trends')}
  </div>`;
}

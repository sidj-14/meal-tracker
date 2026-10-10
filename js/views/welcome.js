// Welcome — shown only on first launch.

export default async function welcome(el) {
  el.innerHTML = `<div class="welcome">
    <div class="stack gap20" style="align-items:center;text-align:center">
      <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
        <circle cx="48" cy="48" r="38" fill="none" stroke="#ECEAE5" stroke-width="11"/>
        <circle cx="48" cy="48" r="38" fill="none" stroke="#5B7A55" stroke-width="11" stroke-linecap="round" stroke-dasharray="168 239" transform="rotate(-90 48 48)"/>
      </svg>
      <h1 class="h1" style="font-size:34px;line-height:1.15">Know what's left<br>in your day</h1>
      <p class="muted" style="margin:0;max-width:280px;line-height:1.45">Log what you eat, see calories and macros remaining for today and the week.</p>
    </div>
    <div class="stack gap10">
      <div class="card" style="gap:10px;padding:16px 18px;margin-bottom:12px">
        <span class="row gap10"><span class="dot" style="background:var(--p)"></span>Set your calorie and macro targets</span>
        <span class="row gap10"><span class="dot" style="background:var(--c)"></span>Log food in a few taps</span>
        <span class="row gap10"><span class="dot" style="background:var(--f)"></span>Track the week and longer trends</span>
      </div>
      <a class="btn primary" href="#/targets?setup=1">Get started</a>
      <span class="note center-text">No account needed. Your data stays on this phone.</span>
    </div>
  </div>`;
}

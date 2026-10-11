'use strict';
for (const [id, key] of [['schedule','scheduleUrl'],['school-data','schoolDataUrl'],['drive','sharedDriveUrl']]) {
  document.getElementById(id).href = CONFIG[key];
}
document.querySelectorAll('.search').forEach(form => {
  form.addEventListener('submit', event => {
    const input = form.querySelector('input[type="search"]');
    input.value = input.value.trim();
    if (!input.value) { event.preventDefault(); input.focus(); }
  });
});
function koreaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(now);
  return ['year','month','day'].map(type => parts.find(p => p.type === type).value).join('');
}
let renderedDate = '';
async function loadMeal() {
  const now = new Date();
  const today = koreaDate(now);
  renderedDate = today;
  const container = document.getElementById('meal-content');
  const message = text => { const p=document.createElement('p');p.className='meal-message';p.textContent=text;container.replaceChildren(p); };
  try {
    const response = await fetch(`${CONFIG.mealUrl}?date=${today}`, {cache:'no-store',signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('meal unavailable');
    const data = await response.json();
    if (today !== koreaDate()) return loadMeal();
    if (data.school !== '전주초등학교' || data.date !== today || data.status === 'error' || !Array.isArray(data.meals) || !data.meals.every(m=>typeof m==='string')) throw new Error('invalid or stale meal');
    if (!data.meals.length) { message('오늘은 등록된 급식이 없습니다.'); return; }
    const list = document.createElement('ul');list.className='meal-list';
    for (const meal of data.meals) { const li=document.createElement('li');li.textContent=meal;list.append(li); }
    container.replaceChildren(list);
    if (typeof data.calorie === 'string' && data.calorie) {const p=document.createElement('p');p.className='calorie';p.textContent=data.calorie;container.append(p);}
  } catch { message('식단 정보를 불러오지 못했습니다.'); }
}
loadMeal();
setInterval(() => { if (koreaDate() !== renderedDate) loadMeal(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadMeal(); });

function formatDday(n) {
  return n >= 0 ? `D-${n}` : `D+${-n}`;
}
async function loadDday() {
  const el = document.getElementById('heroDday');
  if (!el) return;
  try {
    const response = await fetch(`${CONFIG.ddayUrl}?t=${Date.now()}`, {cache:'no-store',signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('dday unavailable');
    const data = await response.json();
    if (data.status !== 'ok' || !Array.isArray(data.events)) throw new Error('invalid dday');
    // Only upcoming events are shown; after the date passes the label disappears.
    const first = data.events.find(event => Number.isFinite(event.dday) && event.dday >= 0);
    el.textContent = first ? `${first.label} ${formatDday(first.dday)}` : '';
  } catch { el.textContent = ''; }
}
loadDday();
setInterval(loadDday, 3600000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadDday(); });
function renderHeroDate() {
  const el = document.getElementById('heroDate');
  if (!el) return;
  const now = new Date();
  el.dateTime = koreaDate(now).replace(/(d{4})(d{2})(d{2})/, '$1-$2-$3');
  el.textContent = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', month:'long', day:'numeric', weekday:'long'}).format(now);
}
renderHeroDate();
setInterval(renderHeroDate, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderHeroDate(); });

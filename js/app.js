'use strict';
for (const [id, key] of [['schedule','scheduleUrl'],['school-data','schoolDataUrl'],['drive','sharedDriveUrl']]) {
  document.getElementById(id).href = CONFIG[key];
}
document.querySelector('.search').addEventListener('submit', event => {
  const input = document.getElementById('query');
  input.value = input.value.trim();
  if (!input.value) { event.preventDefault(); input.focus(); }
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
  const dateEl = document.getElementById('meal-date');
  dateEl.textContent = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(now);
  dateEl.dateTime = `${today.slice(0,4)}-${today.slice(4,6)}-${today.slice(6,8)}`;
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

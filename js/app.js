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

const WEATHER_ICONS = {
  clear: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  cloudy: '<path d="M7 18h10.5a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.71-1.53A4 4 0 0 0 7 18Z"/>',
  fog: '<path d="M6.5 12h11a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.71-1.53A4 4 0 0 0 6.5 12Z"/><path d="M4 16h16M4 20h16"/>',
  rain: '<path d="M7 13h10.5a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.71-1.53A4 4 0 0 0 7 13Z"/><path d="M8 17.5v2M12 17.5v2M16 17.5v2"/>',
  snow: '<path d="M7 13h10.5a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.71-1.53A4 4 0 0 0 7 13Z"/><path d="M12 16.5v6M9 18l6 3M15 18l-6 3"/>',
  storm: '<path d="M7 12h10.5a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.71-1.53A4 4 0 0 0 7 12Z"/><path d="m13 13-3 5h3l-2 4"/>',
};
async function loadWeather() {
  const container = document.getElementById('weather-content');
  const dateEl = document.getElementById('weather-date');
  const now = new Date();
  dateEl.textContent = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(now);
  const message = text => { const p=document.createElement('p');p.className='meal-message';p.textContent=text;container.replaceChildren(p); };
  try {
    const response = await fetch(`${CONFIG.weatherUrl}?t=${Date.now()}`, {cache:'no-store',signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('weather unavailable');
    const data = await response.json();
    if (data.status !== 'ok' || typeof data.temperature !== 'number' || !WEATHER_ICONS[data.icon]) throw new Error('invalid weather');
    const body = document.createElement('div');body.className='weather-body';
    body.innerHTML = `<svg class="weather-icon" viewBox="0 0 24 24" aria-hidden="true">${WEATHER_ICONS[data.icon]}</svg>
      <div><p class="weather-desc">${data.description}</p><p class="weather-temp">${data.temperature}°C</p></div>`;
    container.replaceChildren(body);
    const range = document.createElement('p');range.className='weather-range';range.textContent=`최저 ${data.tempMin}° · 최고 ${data.tempMax}°`;
    container.append(range);
  } catch { message('날씨 정보를 불러오지 못했습니다.'); }
}
loadWeather();
setInterval(loadWeather, 600000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadWeather(); });

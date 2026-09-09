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
function tickHeroClock() {
  const el = document.getElementById('heroClock');
  if (!el) return;
  const now = new Date();
  const date = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(now);
  const time = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
  el.textContent = `${date} · ${time}`;
}
tickHeroClock();
setInterval(tickHeroClock, 30000);
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

const WEATHER_SCENES = {
  sun:    { grad: ['#8fd8ef', '#f6b352'], mtn: '#e08a3c',
            icon: '<circle class="core" cx="12" cy="12" r="7" fill="#fff"/>' },
  moon:   { grad: ['#232a52', '#12142a'], mtn: '#0a0b18',
            icon: '<circle class="moon" cx="12" cy="12" r="7" fill="#e2e6ee"/>' },
  cloudy: { grad: ['#bfe7de', '#e8ab6e'], mtn: '#cf8a4c',
            icon: '<path class="cloud" fill="#fff" d="M7 17h10.5a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.71-1.53A4 4 0 0 0 7 17Z"/>' },
  fog:    { grad: ['#cfd9df', '#9fb0bd'], mtn: '#84939f',
            icon: '<path class="cloud" fill="#fff" d="M6.5 12h11a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.71-1.53A4 4 0 0 0 6.5 12Z"/><rect class="mist" x="4" y="15" width="16" height="1.6" rx=".8" fill="#fff"/><rect class="mist" x="4" y="19" width="16" height="1.6" rx=".8" fill="#fff"/>' },
  rain:   { grad: ['#3fa9a0', '#1f6f6a'], mtn: '#1b5854',
            icon: '<path class="cloud" fill="#fff" d="M7 13h10.5a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.71-1.53A4 4 0 0 0 7 13Z"/><line class="drop" x1="8" y1="17" x2="6.5" y2="21" stroke="#bfe3ff" stroke-width="1.6" stroke-linecap="round"/><line class="drop" x1="12" y1="17" x2="10.5" y2="21" stroke="#bfe3ff" stroke-width="1.6" stroke-linecap="round"/><line class="drop" x1="16" y1="17" x2="14.5" y2="21" stroke="#bfe3ff" stroke-width="1.6" stroke-linecap="round"/>' },
  snow:   { grad: ['#eaf6ff', '#c3ddf0'], mtn: '#9db7c8',
            icon: '<path class="cloud" fill="#fff" d="M7 13h10.5a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.71-1.53A4 4 0 0 0 7 13Z"/><circle class="flake" cx="8" cy="19" r="1" fill="#fff"/><circle class="flake" cx="12" cy="19" r="1" fill="#fff"/><circle class="flake" cx="16" cy="19" r="1" fill="#fff"/>' },
  storm:  { grad: ['#3a3a58', '#17182c'], mtn: '#08080f',
            icon: '<path class="cloud" fill="#e7e9ee" d="M7 12h10.5a3.5 3.5 0 0 0 .5-6.96 5 5 0 0 0-9.71-1.53A4 4 0 0 0 7 12Z"/><path class="bolt" fill="#ffd766" d="m13 13-3 5h3l-2 4"/>' },
};
function weatherSceneKey(icon, isDay) {
  if (icon === 'clear') return isDay ? 'sun' : 'moon';
  return WEATHER_SCENES[icon] ? icon : 'cloudy';
}
function tickWeatherClock() {
  const el = document.getElementById('weatherClock');
  if (!el) return;
  el.textContent = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
}
async function loadWeather() {
  const container = document.getElementById('weather-content');
  const message = text => { const p=document.createElement('p');p.className='weather-message';p.textContent=text;container.replaceChildren(p); };
  try {
    const response = await fetch(`${CONFIG.weatherUrl}?t=${Date.now()}`, {cache:'no-store',signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('weather unavailable');
    const data = await response.json();
    if (data.status !== 'ok' || typeof data.temperature !== 'number') throw new Error('invalid weather');
    const key = weatherSceneKey(data.icon, data.isDay !== false);
    const scene = WEATHER_SCENES[key];
    document.getElementById('weatherCard').style.background = `linear-gradient(160deg, ${scene.grad[0]}, ${scene.grad[1]})`;
    document.getElementById('weatherMountain').style.setProperty('--mtn', scene.mtn);
    const face = document.createElement('div');
    face.className = 'weather-face';
    face.innerHTML = `<svg class="weather-icon-lg icon-${key}" viewBox="0 0 24 24" aria-hidden="true">${scene.icon}</svg>
      <div><p class="weather-temp">${data.temperature}°</p><p class="weather-desc">${data.description}</p><p class="weather-range">최저 ${data.tempMin}° · 최고 ${data.tempMax}°</p></div>`;
    const foot = document.createElement('div');
    foot.className = 'weather-foot';
    foot.innerHTML = `<time class="weather-clock" id="weatherClock"></time><p class="weather-loc">${data.location || ''}</p>`;
    container.replaceChildren(face, foot);
    tickWeatherClock();
  } catch { message('날씨 정보를 불러오지 못했습니다.'); }
}
loadWeather();
setInterval(loadWeather, 600000);
setInterval(tickWeatherClock, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadWeather(); });

async function loadDday() {
  const container = document.getElementById('dday-content');
  const message = text => { const p=document.createElement('p');p.className='meal-message';p.textContent=text;container.replaceChildren(p); };
  try {
    const response = await fetch(`${CONFIG.ddayUrl}?t=${Date.now()}`, {cache:'no-store',signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('dday unavailable');
    const data = await response.json();
    if (data.status !== 'ok' || !Array.isArray(data.events) || !data.events.length) throw new Error('invalid dday');
    const [first, ...rest] = data.events;
    const ddayLabel = first.dday === 0 ? 'D-DAY' : first.dday > 0 ? `D-${first.dday}` : `D+${-first.dday}`;
    const main = document.createElement('div');
    main.className = 'dday-main';
    main.innerHTML = `<p class="dday-number">${ddayLabel}</p><p class="dday-label">${first.label}</p><p class="dday-date">${first.date}</p>`;
    container.replaceChildren(main);
    if (rest.length) {
      const list = document.createElement('ul');
      list.className = 'dday-next';
      for (const e of rest) {
        const li = document.createElement('li');
        const label = document.createElement('span'); label.textContent = e.label;
        const dd = document.createElement('span'); dd.textContent = e.dday === 0 ? 'D-DAY' : e.dday > 0 ? `D-${e.dday}` : `D+${-e.dday}`;
        li.append(label, dd);
        list.append(li);
      }
      container.append(list);
    }
  } catch { message('일정 정보를 불러오지 못했습니다.'); }
}
loadDday();
setInterval(loadDday, 3600000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadDday(); });

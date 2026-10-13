'use strict';
const AIR_GRADES = ['좋음', '보통', '나쁨', '매우 나쁨'];
const AIR_TONES = ['good', 'fair', 'bad', 'very-bad'];
function timestamp(value) {
  return typeof value === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
}
function formatTimestamp(value, now = Date.now()) {
  const ms = timestamp(value);
  if (ms === null) return '측정 시각 확인 필요';
  const fmt = options => new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',hour12:false,...options});
  const sameDay = fmt({dateStyle:'short'}).format(ms) === fmt({dateStyle:'short'}).format(now);
  return fmt(sameDay ? {hour:'2-digit',minute:'2-digit'} : {year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(ms);
}
function parseLiveWeather(raw) {
  const labels = {0:['맑음','clear'],1:['대체로 맑음','clear'],2:['구름 조금','cloudy'],3:['흐림','cloudy'],45:['안개','fog'],48:['안개','fog']};
  const classify = code => labels[code] || ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code) ? ['비','rain'] :
    [71,73,75,77,85,86].includes(code) ? ['눈','snow'] : [95,96,99].includes(code) ? ['뇌우','storm'] : ['알 수 없음','cloudy']);
  const c = raw.current, d = raw.daily, h = raw.hourly;
  const zoned = value => typeof value === 'string' ? value + '+09:00' : null;
  if (raw.timezone !== 'Asia/Seoul' || ![c?.temperature_2m,c?.weather_code,d?.temperature_2m_min?.[0],d?.temperature_2m_max?.[0]].every(Number.isFinite)) throw new Error('invalid weather');
  const [description,icon] = classify(c.weather_code);
  const observedAt = zoned(c.time);
  if (!freshTimestamp(observedAt)) throw new Error('stale weather');
  const hourly = Array.isArray(h?.time) ? h.time.map((time,i) => {
    const [label,kind] = classify(h.weather_code?.[i]);
    return {time:zoned(time),temperature:Number.isFinite(h.temperature_2m?.[i]) ? Math.round(h.temperature_2m[i]) : null,
      description:label,icon:kind,isDay:h.is_day?.[i] !== 0};
  }).filter(slot => slot.temperature !== null && timestamp(slot.time) !== null) : [];
  return {status:'ok',observedAt,temperature:Math.round(c.temperature_2m),tempMin:Math.round(d.temperature_2m_min[0]),
    tempMax:Math.round(d.temperature_2m_max[0]),description,icon,isDay:c.is_day !== 0,hourly,location:'전주시 완산구'};
}
function airGrade(value, pollutant) {
  if (!Number.isFinite(value) || value < 0) return null;
  const limits = pollutant === 'pm10' ? [30, 80, 150] : [15, 35, 75];
  const index = limits.findIndex(limit => value <= limit);
  return index < 0 ? 3 : index;
}
function freshTimestamp(value, now = Date.now()) {
  // Require an explicit zone: measurements must never depend on the viewer's timezone.
  const ms = timestamp(value);
  if (ms === null) return false;
  const age = now - ms;
  return Number.isFinite(age) && age >= -300000 && age < 7200000;
}
function activityState(data, now = Date.now()) {
  const grades = [airGrade(data?.pm10, 'pm10'), airGrade(data?.pm25, 'pm25')];
  if (data?.status !== 'ok' || grades.includes(null) || !freshTimestamp(data.measuredAt, now) ||
      !freshTimestamp(data.alerts?.checkedAt, now) || data.alerts.status !== 'ok' ||
      !Array.isArray(data.alerts.active) || !data.alerts.active.every(a =>
        ['주의보', '경보'].includes(a.level) && ['PM10', 'PM25'].includes(a.pollutant))) {
    return {tone: 'unknown', title: '판단 확인 필요', note: '최신 관측·경보 정보를 확인하세요.'};
  }
  if (data.alerts.active.length) {
    const level = data.alerts.active.some(a => a.level === '경보') ? '경보' : '주의보';
    return {tone: 'very-bad', title: '실외수업 금지 안내', note: `전북 중부권 ${level} 발령 · 실내 활동 전환`};
  }
  if (Math.max(...grades) >= 2) return {tone: 'bad', title: '실외 활동 자제', note: '실내 활동 전환 권고 · 민감군 학생 주의'};
  return {tone: 'fair', title: '실외 활동 가능', note: '미세먼지 기준 · 민감군 학생 건강 확인'};
}
if (typeof module !== 'undefined') module.exports = {airGrade, freshTimestamp, activityState, timestamp, formatTimestamp, parseLiveWeather};

if (typeof document !== 'undefined') {
  const desktop = matchMedia('(min-width: 768px)');
  let timer = null;
  let controller = null;
  let latestAir = null;
  let latestWeather = null;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    node.className = cls;
    node.textContent = text;
    return node;
  };
  const ICONS = {
    clear: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
    cloudy: '<path d="M7 18h11a4 4 0 0 0 0-8 6 6 0 0 0-11-2 5 5 0 0 0 0 10Z"/>',
    rain: '<path d="M6 14h12a4 4 0 0 0 0-8 6 6 0 0 0-11-1 5 5 0 0 0-1 9Zm2 4-1 3m6-3-1 3m6-3-1 3"/>',
    snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3"/>',
    fog: '<path d="M4 8h16M2 12h20M4 16h16M7 20h10"/>',
    storm: '<path d="m13 2-8 12h6l-1 8 9-13h-7l1-7Z"/>'
  };
  function weatherIcon(kind, isDay) {
    const name = kind === 'clear' && !isDay ? 'moon' : (ICONS[kind] ? kind : 'cloudy');
    const wrap = el('span', `wicon wi-${name}`, '');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name];
    wrap.append(svg);
    return wrap;
  }
  // Next six hourly slots after now; hidden entirely when fewer than three usable slots remain.
  function hourlyList(slots) {
    if (!Array.isArray(slots)) return null;
    const upcoming = slots.filter(slot => Number.isFinite(slot?.temperature) && Number.isFinite(Date.parse(slot.time)) &&
      Date.parse(slot.time) > Date.now()).slice(0, 6);
    if (upcoming.length < 3) return null;
    const hourFormat = new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false});
    const list = el('ol', 'weather-hourly', '');
    list.setAttribute('aria-label', '시간대별 날씨');
    for (const slot of upcoming) {
      const item = document.createElement('li');
      const hour = el('time', '', `${hourFormat.format(new Date(slot.time)).replace(/\D/g, '')}시`);
      hour.dateTime = slot.time;
      item.append(hour, weatherIcon(slot.icon, slot.isDay !== false), el('strong', '', `${slot.temperature}°`));
      item.title = slot.description || '';
      list.append(item);
    }
    return list;
  }
  const places = {weather: '', air: ''};
  const times = {weather: null, air: null};
  function renderStamp() {
    const out = document.getElementById('envStamp');
    if (!out) return;
    // This sits in the air panel: never mix a missing weather date into the air measurement.
    out.textContent = `${places.air || '측정소 확인 필요'} · ${formatTimestamp(times.air)}${timestamp(times.air) === null ? '' : ' 기준'}`;
  }
  function renderAir(data) {
    const content = document.getElementById('air-content');
    const grades = [airGrade(data?.pm10, 'pm10'), airGrade(data?.pm25, 'pm25')];
    const valid = data?.status === 'ok' && !grades.includes(null) && freshTimestamp(data.measuredAt);
    document.getElementById('airPanel').dataset.tone = valid ? AIR_TONES[Math.max(...grades)] : 'unknown';
    const rows = el('div', 'air-rows', '');
    for (const [index, label, key] of [[0, '미세먼지', 'pm10'], [1, '초미세먼지', 'pm25']]) {
      const row = el('p', 'air-row', '');
      row.append(el('span', 'air-label', label), el('strong', '', grades[index] === null ? '—' : String(data[key])));
      const badge = el('span', 'grade-badge', valid ? AIR_GRADES[grades[index]] : '갱신 필요');
      badge.dataset.tone = valid ? AIR_TONES[grades[index]] : 'unknown';
      row.append(badge);
      rows.append(row);
    }
    content.replaceChildren(rows);
    places.air = data?.station || '';
    times.air = data?.measuredAt || null;
    renderStamp();
    // Quiet unless action is needed: show a chip only for 나쁨 or worse, or an official alert.
    const state = activityState(data);
    const chip = document.getElementById('alertChip');
    chip.hidden = state.tone === 'fair';
    chip.dataset.tone = state.tone;
    chip.textContent = state.tone === 'unknown' ? '최신 관측·경보 확인 필요' : state.title;
    chip.title = state.note;
    if (state.tone === 'unknown') {
      const link = el('a', 'air-check-link', '에어코리아 확인 ↗');
      link.href = 'https://www.airkorea.or.kr/web/main.do';
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      content.append(link);
    }
  }
  async function fetchData(url, signal) {
    const response = await fetch(`${url}?t=${Date.now()}`, {cache: 'no-store', signal});
    if (!response.ok) throw new Error('unavailable');
    return response.json();
  }
  async function loadWeather(signal) {
    const content = document.getElementById('weather-content');
    const panel = document.getElementById('weatherPanel');
    try {
      let data;
      try { data = await fetchData(CONFIG.weatherUrl, signal); } catch (error) { if (signal.aborted) throw error; }
      if (!data || data.status !== 'ok' || !freshTimestamp(data.observedAt) ||
          ![data.temperature,data.tempMin,data.tempMax].every(Number.isFinite) || typeof data.description !== 'string') {
        // Public, key-free API: refresh independently of delayed GitHub scheduled deployments.
        const params = new URLSearchParams({latitude:String(data?.latitude || 35.8242),longitude:String(data?.longitude || 127.1480),
          current:'temperature_2m,weather_code,is_day',daily:'temperature_2m_max,temperature_2m_min',
          hourly:'temperature_2m,weather_code,is_day',timezone:'Asia/Seoul',forecast_days:'2'});
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {signal});
        if (!response.ok) throw new Error('live weather unavailable');
        data = parseLiveWeather(await response.json());
      }
      if (signal.aborted || !desktop.matches) return;
      if (data.status !== 'ok' || ![data.temperature, data.tempMin, data.tempMax].every(Number.isFinite) ||
          typeof data.description !== 'string' || !freshTimestamp(data.observedAt)) throw new Error('invalid');
      const known = ['clear', 'rain', 'snow', 'storm', 'fog'];
      const isDay = data.isDay !== false;
      panel.dataset.scene = known.includes(data.icon) ? data.icon : 'cloudy';
      panel.dataset.day = isDay ? '1' : '0';
      const now = el('div', 'weather-now', '');
      const big = weatherIcon(data.icon, isDay);
      big.classList.add('wicon-lg');
      const meta = el('div', 'weather-meta', '');
      meta.append(el('span', 'weather-label', data.description), el('span', 'weather-range', `${data.tempMin}° / ${data.tempMax}°`));
      now.append(big, el('strong', 'weather-temp', `${data.temperature}°`), meta);
      places.weather = data.location || '전주시';
      times.weather = data.observedAt;
      latestWeather = data;
      renderStamp();
      content.replaceChildren(...[now, hourlyList(data.hourly), el('p','weather-source',`Open-Meteo · ${formatTimestamp(data.observedAt)} 기준`)].filter(Boolean));
    } catch {
      if (!desktop.matches || (signal.aborted && signal.reason?.name !== 'TimeoutError')) return;
      panel.dataset.scene = 'unknown';
      content.replaceChildren(el('p', 'env-note', '날씨 확인 필요 · 최신 정보를 불러오지 못했습니다.'));
      times.weather = null;
      latestWeather = null;
      renderStamp();
    }
  }
  async function loadAir(signal) {
    try {
      const data = await fetchData(CONFIG.airQualityUrl, signal);
      if (signal.aborted || !desktop.matches) return;
      latestAir = data;
      renderAir(data);
    } catch {
      if (!desktop.matches || (signal.aborted && signal.reason?.name !== 'TimeoutError')) return;
      latestAir = {...latestAir, status: 'error'};
      renderAir(latestAir);
    }
  }
  function refreshEnvironment() {
    if (!desktop.matches || document.hidden) return;
    controller?.abort();
    controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
    loadWeather(signal);
    loadAir(signal);
  }
  function syncEnvironment() {
    clearInterval(timer);
    timer = null;
    controller?.abort();
    if (!desktop.matches || document.hidden) return;
    refreshEnvironment();
    let ticks = 0;
    timer = setInterval(() => {
      // Reevaluate freshness every minute, even when the server JSON is unchanged.
      if (latestAir) renderAir(latestAir);
      const airNeedsRefresh = latestAir?.status !== 'ok' || !freshTimestamp(latestAir.measuredAt) ||
        latestAir?.alerts?.status !== 'ok' || !freshTimestamp(latestAir.alerts?.checkedAt);
      if (++ticks % 10 === 0 || airNeedsRefresh ||
          (latestWeather && !freshTimestamp(latestWeather.observedAt))) refreshEnvironment();
    }, 60000);
  }
  desktop.addEventListener('change', syncEnvironment);
  document.addEventListener('visibilitychange', syncEnvironment);
  syncEnvironment();
}

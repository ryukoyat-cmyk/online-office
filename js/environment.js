'use strict';
const AIR_GRADES = ['좋음', '보통', '나쁨', '매우 나쁨'];
const AIR_TONES = ['good', 'fair', 'bad', 'very-bad'];
function airGrade(value, pollutant) {
  if (!Number.isFinite(value) || value < 0) return null;
  const limits = pollutant === 'pm10' ? [30, 80, 150] : [15, 35, 75];
  const index = limits.findIndex(limit => value <= limit);
  return index < 0 ? 3 : index;
}
function freshTimestamp(value, now = Date.now()) {
  // Require an explicit zone: measurements must never depend on the viewer's timezone.
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const age = now - Date.parse(value);
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
if (typeof module !== 'undefined') module.exports = {airGrade, freshTimestamp, activityState};

if (typeof document !== 'undefined') {
  const desktop = matchMedia('(min-width: 768px)');
  let timer = null;
  let controller = null;
  let latestAir = null;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    node.className = cls;
    node.textContent = text;
    return node;
  };
  const stamp = value => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date) : '시각 확인 필요';
  };
  function officialLink() {
    const link = el('a', 'official-link', '에어코리아 확인 ↗');
    link.href = 'https://www.airkorea.or.kr/web/main.do';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }
  function renderAir(data) {
    const content = document.getElementById('air-content');
    const grades = [airGrade(data?.pm10, 'pm10'), airGrade(data?.pm25, 'pm25')];
    const valid = data?.status === 'ok' && !grades.includes(null) && freshTimestamp(data.measuredAt);
    document.getElementById('airPanel').dataset.tone = valid ? AIR_TONES[Math.max(...grades)] : 'unknown';
    const rows = el('div', 'air-rows', '');
    for (const [index, label, key] of [[0, '미세먼지', 'pm10'], [1, '초미세먼지', 'pm25']]) {
      const row = el('p', 'air-row', '');
      row.append(el('span', '', label), el('strong', '', grades[index] === null ? '—' : String(data[key])));
      const badge = el('span', 'grade-badge', grades[index] === null ? '확인 필요' : AIR_GRADES[grades[index]]);
      badge.dataset.tone = grades[index] === null ? 'unknown' : AIR_TONES[grades[index]];
      row.append(badge);
      rows.append(row);
    }
    const note = `${data?.station || '측정소 확인 필요'} · ${stamp(data?.measuredAt)}${valid ? '' : ' · 최신 확인 필요'}`;
    content.replaceChildren(rows, el('p', 'env-note', note));
    const state = activityState(data);
    document.getElementById('activityPanel').dataset.tone = state.tone;
    const activity = document.getElementById('activity-content');
    activity.replaceChildren(el('p', 'env-main', state.title), el('p', 'env-note', state.note));
    if (state.tone === 'unknown') activity.lastChild.append(' ', officialLink());
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
      const data = await fetchData(CONFIG.weatherUrl, signal);
      if (signal.aborted || !desktop.matches) return;
      if (data.status !== 'ok' || ![data.temperature, data.tempMin, data.tempMax].every(Number.isFinite) ||
          typeof data.description !== 'string' || !freshTimestamp(data.observedAt)) throw new Error('invalid');
      const icons = {
        clear: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
        cloudy: '<path d="M7 18h11a4 4 0 0 0 0-8 6 6 0 0 0-11-2 5 5 0 0 0 0 10Z"/>',
        rain: '<path d="M6 14h12a4 4 0 0 0 0-8 6 6 0 0 0-11-1 5 5 0 0 0-1 9Zm2 4-1 3m6-3-1 3m6-3-1 3"/>',
        snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3"/>',
        fog: '<path d="M4 8h16M2 12h20M4 16h16M7 20h10"/>',
        storm: '<path d="m13 2-8 12h6l-1 8 9-13h-7l1-7Z"/>'
      };
      panel.dataset.scene = ['clear', 'rain', 'snow', 'storm'].includes(data.icon) ? data.icon : 'cloudy';
      const reading = el('p', 'env-main weather-reading', '');
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = icons[data.icon] || icons.cloudy;
      reading.append(icon, el('strong', '', `${data.temperature}°`), el('span', 'weather-label', data.description),
        el('span', 'weather-range', `${data.tempMin}° / ${data.tempMax}°`));
      content.replaceChildren(reading,
        el('p', 'env-note', `${data.location || '전주시'} · ${stamp(data.observedAt)}`));
    } catch {
      if (!desktop.matches || (signal.aborted && signal.reason?.name !== 'TimeoutError')) return;
      panel.dataset.scene = 'unknown';
      content.replaceChildren(el('p', 'env-main', '날씨 확인 필요'), el('p', 'env-note', '최신 날씨 정보를 불러오지 못했습니다.'));
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
      if (++ticks % 10 === 0) refreshEnvironment();
    }, 60000);
  }
  desktop.addEventListener('change', syncEnvironment);
  document.addEventListener('visibilitychange', syncEnvironment);
  syncEnvironment();
}

const assert = require('node:assert/strict');
const {airGrade, activityState, freshTimestamp, timestamp, formatTimestamp, parseLiveWeather} = require('../js/environment.js');
for (const [key, limits] of [['pm10', [30,80,150]], ['pm25',[15,35,75]]]) {
  limits.forEach((n,i) => {assert.equal(airGrade(n,key),i); assert.equal(airGrade(n+1,key),i+1);});
  for (const value of [null, undefined, -1, NaN, Infinity, '20']) assert.equal(airGrade(value,key),null);
}
const now = Date.parse('2026-10-10T09:30:00+09:00');
const data = {status:'ok',pm10:30,pm25:18,measuredAt:'2026-10-10T09:00:00+09:00',alerts:{status:'ok',checkedAt:'2026-10-10T09:15:00+09:00',active:[]}};
assert.equal(activityState(data,now).tone,'fair');
assert.equal(activityState({...data,pm25:36},now).tone,'bad');
assert.equal(activityState({...data,pm25:76},now).tone,'bad'); // Very bad is not an official alert.
for (const level of ['주의보','경보']) assert.equal(activityState({...data,alerts:{...data.alerts,active:[{level,pollutant:'PM25'}]}},now).title,'실외수업 금지 안내');
for (const d of [{...data,status:'error'}, {...data,pm10:null}, {...data,alerts:{...data.alerts,status:'error'}}, {...data,alerts:{...data.alerts,active:null}}]) assert.equal(activityState(d,now).tone,'unknown');
assert.equal(activityState(data,Date.parse('2026-10-10T11:00:00+09:00')).tone,'unknown');
assert.equal(freshTimestamp('2026-10-10T09:00:00',now),false);
assert.equal(freshTimestamp('2026-10-10T10:00:00+09:00',now),false);
console.log('Environment boundary, alert, stale and error checks passed.');
for (const value of [null,undefined,'','invalid',0,'2026-10-12T17:00:00']) {
  assert.equal(timestamp(value),null);
  assert.equal(formatTimestamp(value,now),'측정 시각 확인 필요');
}
assert(formatTimestamp(data.measuredAt,now).includes('09:00'));
assert(formatTimestamp('2025-10-10T09:00:00+09:00',now).includes('2025'));
const current = new Date().toLocaleString('sv-SE',{timeZone:'Asia/Seoul'}).replace(' ','T').slice(0,16);
const raw = {timezone:'Asia/Seoul',current:{time:current,temperature_2m:18.4,weather_code:0,is_day:0},daily:{temperature_2m_min:[12],temperature_2m_max:[24]}};
assert.equal(parseLiveWeather(raw).temperature,18);
assert.equal(parseLiveWeather(raw).isDay,false);
assert.equal(parseLiveWeather(raw).hourly.length,0);
assert.throws(()=>parseLiveWeather({...raw,current:{...raw.current,temperature_2m:null}}));
assert.throws(()=>parseLiveWeather({...raw,current:{...raw.current,time:'2020-01-01T00:00'}}));
console.log('Null timestamps and live weather parsing checks passed.');

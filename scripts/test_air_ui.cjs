const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor() { this.children = []; this.dataset = {}; this.hidden = false; this._text = ''; this.classList = {add() {}}; }
  set textContent(value) { this._text = value; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(' '); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this._text = ''; this.children = nodes; }
  setAttribute() {}
}
let now = Date.parse('2026-10-14T13:30:00+09:00');
const nodes = new Map();
let tick;
let failAir = false;
let airRequests = 0;
const cache = new Map();
const air = {status:'ok',regionCode:'5211100000',measuredAt:'2026-10-14T13:00:00+09:00',pm10:17,pm25:5,alerts:{status:'ok',checkedAt:'2026-10-14T13:15:00+09:00',active:[]}};
const context = {
  document:{hidden:false,getElementById(id) { if (!nodes.has(id)) nodes.set(id,new Element()); return nodes.get(id); },createElement() { return new Element(); },createElementNS() {return new Element();},addEventListener() {}},
  matchMedia:() => ({matches:true,addEventListener() {}}),
  localStorage:{getItem:key => cache.get(key) || null,setItem:(key,value) => cache.set(key,value)},
  Date:class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() {return now;} },
  Intl, URLSearchParams, AbortController, AbortSignal,
  setInterval(fn) { tick = fn; return 1; },clearInterval() {},
  CONFIG:{airQualityUrl:'air',weatherUrl:'weather'},
  async fetch(url) {
    if (url === 'air') {
      airRequests++;
      if (failAir) throw new Error('temporary outage');
      return {ok:true,json:async()=>air};
    }
    return {ok:true,json:async()=>({status:'ok',observedAt:'2026-10-14T13:00:00+09:00',temperature:18,tempMin:10,tempMax:18,description:'맑음',icon:'clear'})};
  }
};
vm.runInNewContext(fs.readFileSync(require.resolve('../js/environment.js'),'utf8'), context);
const settle = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  await settle();
  const content = nodes.get('air-content');
  assert.match(content.textContent, /17/);
  assert.match(content.textContent, /5/);
  assert.equal(nodes.get('alertChip').hidden, true);
  failAir = true;
  now += 10 * 60000;
  tick(); await settle();
  assert.match(content.textContent, /17/);
  const requestsAfterFailure = airRequests;
  now += 60000; tick(); await settle(); // First retry.
  const requestsAfterRetry = airRequests;
  now += 60000; tick(); await settle(); // Backoff suppresses this request.
  assert.equal(airRequests, requestsAfterRetry);
  assert(requestsAfterRetry > requestsAfterFailure);
  now = Date.parse('2026-10-14T17:00:00+09:00');
  tick(); await settle();
  assert.match(content.textContent, /17/);
  assert.equal(content.children[0].children[0].children[2].textContent, '좋음');
  assert.equal(content.children[0].children[1].children[2].textContent, '좋음');
  assert.doesNotMatch(content.textContent, /최근 관측값/);
  assert.doesNotMatch(content.textContent + nodes.get('alertChip').textContent, /갱신 필요|확인 필요|에어코리아 확인/);
  assert.equal(nodes.get('alertChip').hidden, true);
  console.log('Air UI: numbers survive failure, grades remain visible for retained records, removed messages stay absent, and backoff reduces requests.');
})().catch(error => { console.error(error); process.exitCode = 1; });

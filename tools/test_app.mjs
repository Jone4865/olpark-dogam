// 헤드리스 크롬으로 올팍 도감을 휴대폰 화면으로 열고, 가짜 위치와 가짜 사진으로 흐름을 시험한다.
// 사용법: node tools/test_app.mjs <앱 주소> <결과 폴더> <시험용 jpg>
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [URL0, OUT, JPG] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9500 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'olpark-'))}`, '--window-size=390,844', '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
setTimeout(() => { console.log('시간 초과'); chrome.kill('SIGKILL'); process.exit(1); }, 240000).unref();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 80 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {} await sleep(150); }
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const logs = []; const events = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Page.fileChooserOpened') events.push(m.params);
  if (m.method === 'Network.loadingFailed' && !m.params.canceled) logs.push('[netfail] ' + m.params.errorText);
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64')); };
const full = async (name) => { const h = await ev('return document.documentElement.scrollHeight'); await send('Emulation.setDeviceMetricsOverride', { width: 390, height: Math.min(h, 3000), deviceScaleFactor: 1, mobile: true }); await sleep(400); await shot(name); await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await sleep(200); };
const tap = async (sel) => { const [x, y] = await ev(`const e=document.querySelector(${JSON.stringify(sel)}); if(!e) throw new Error('없음: '+${JSON.stringify(sel)}); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]`); for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const setGeo = (lat, lon, acc = 8) => send('Emulation.setGeolocationOverride', { latitude: lat, longitude: lon, accuracy: acc });
const pickPhoto = async () => { const n = events.length; for (let i = 0; i < 40 && events.length === n; i++) await sleep(100); const e = events.at(-1); if (!e || events.length === n) throw new Error('파일 선택 창이 열리지 않음'); await send('DOM.setFileInputFiles', { files: [JPG], backendNodeId: e.backendNodeId }); };

await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable'); await send('Network.enable');
await send('Page.setInterceptFileChooserDialog', { enabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
await send('Browser.grantPermissions', { permissions: ['geolocation'], origin: new URL(URL0).origin });
const results = {};
try {
  // 장미광장 한가운데
  const P = await (await fetch(new URL('data/places.json', URL0))).json();
  const rose = P.spots.find((s) => s.badge === 'v9').geom.coordinates;
  await setGeo(rose[1], rose[0]);
  await send('Page.navigate', { url: URL0 }); await sleep(2500);
  await shot('01_start.png');
  await tap('#start-geo'); await sleep(2500);
  await shot('02_map.png');
  results.nearTitle = await ev("return document.querySelector('#near-title')?.textContent");
  results.geoLine = await ev("return document.querySelector('#geo')?.innerText");
  await ev("location.hash='#/place/v9'"); await sleep(2000);
  await full('03_place_v9.png');
  results.placeStatus = await ev("return document.querySelector('#place-status')?.innerText");
  results.cands = await ev("const c=window.__olpark.candidates(); return c.status+':'+(c.list||[]).map(x=>x.spot.name+'@'+Math.round(x.d)).join(',')");
  await tap('.cta-bar [data-act="capture"]'); await pickPhoto(); await sleep(2500);
  await shot('04_card.png');
  results.cardHash = await ev('return location.hash');
  await tap('#quiz'); await sleep(2500);
  await shot('05_quiz.png');
  await tap('.answer'); await sleep(800);
  await shot('06_quiz_answer.png');
  results.quizTitle = await ev("return document.querySelector('.sheet h2')?.textContent");
  await tap('#quiz-close'); await sleep(800);
  // 들꽃마루와 장미광장 사이: 두 곳이 후보가 되어야 함
  const wild = P.spots.find((s) => s.badge === 'v8').geom.coordinates[0];
  const east = wild.reduce((a, c) => (c[0] > a[0] ? c : a));
  await setGeo((east[1] + rose[1]) / 2, (east[0] + rose[0]) / 2, 30); await sleep(1500);
  results.cands2 = await ev("const c=window.__olpark.candidates(); return c.status+':'+(c.list||[]).map(x=>x.spot.name+'@'+Math.round(x.d)).join(',')");
  await ev("location.hash='#/map'"); await sleep(1200);
  await tap('.fab'); await pickPhoto(); await sleep(2000);
  await shot('07_choose.png');
  results.chooseDefault = await ev("const i=document.querySelector('#choose input:checked'); return i && i.closest('label').innerText.split('\\n')[1]");
  await tap('#choose button[type="submit"]'); await sleep(2000);
  await shot('08_card2.png');
  // 공원 밖
  await setGeo(37.5050, 127.1000, 10); await sleep(1500);
  await ev("location.hash='#/map'"); await sleep(1000);
  await tap('.fab'); await sleep(600);
  await shot('09_outside.png');
  results.toastOut = await ev("return document.querySelector('#toast').textContent");
  // 오차가 큰 위치
  await setGeo(rose[1], rose[0], 120); await sleep(1500);
  await tap('.fab'); await sleep(600);
  results.toastWeak = await ev("return document.querySelector('#toast').textContent");
  await setGeo(rose[1], rose[0], 8); await sleep(1500);
  await ev("location.hash='#/badges'"); await sleep(1500); await full('10_badges.png');
  await ev("location.hash='#/book'"); await sleep(1500); await full('11_book.png');
  await ev("location.hash='#/book?tab=rose'"); await sleep(2500); await shot('12_book_rose.png');
  await ev("location.hash='#/settings'"); await sleep(1000); await full('13_settings.png');
  await ev("location.hash='#/check'"); await sleep(1500); await shot('14_check.png');
  await ev("location.hash='#/place/t_lawn'"); await sleep(2000); await full('15_place_lawn.png');
  await ev("location.hash='#/map'"); await sleep(1000); await tap('#zoom'); await sleep(1200); await shot('16_map_zoom.png');
  results.photos = await ev('return window.__olpark.state.photos.length');
  results.cards = await ev('return window.__olpark.cardCount()');
  // 백업 → 모두 지우기 → 불러오기
  results.backupRestore = await ev(`const o=window.__olpark; const data=await o.makeBackup(); const size=JSON.stringify(data).length;
    await o.db.clear('photos'); await o.db.clear('roses'); await o.loadState(); const wiped=o.state.photos.length;
    await o.restore(new File([JSON.stringify(data)],'b.json',{type:'application/json'})); return {size, wiped, after:o.state.photos.length, roses:o.state.roses.size}`);
  results.roses = await ev('return window.__olpark.state.roses.size');
  results.imgErrors = await ev("return [...document.images].filter(i=>i.complete&&i.naturalWidth===0&&i.src).map(i=>i.src).slice(0,5)");
} catch (e) { results.error = e.message; }
console.log(JSON.stringify({ results, logs: logs.slice(-30) }, null, 1));
chrome.kill('SIGKILL');
process.exit(0);

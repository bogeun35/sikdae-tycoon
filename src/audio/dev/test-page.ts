/**
 * 소리 검수 페이지 (audio-test.html) — 모든 효과음·배경음 재생 버튼 + OfflineAudioContext 측정 표.
 *   개발:  npm run dev → http://localhost:5173/audio-test.html
 *   파일:  node src/audio/dev/build-test.mjs → test-shots/audio/audio-test.html (한 파일, file:// 로 열림)
 *   검수:  node src/audio/dev/measure.cjs (헤드리스 9224 로 열어 전체 측정 + 스크린샷)
 * 게임 빌드(index.html)에는 들어가지 않는다.
 */
import * as audio from '../index';
import { renderCrossfade, renderMusic, renderSfx, renderStress, type Stats } from '../render';
import { SFX_USES } from '../sfx';
import gddRaw from '../../data/gdd-data.json?raw';
import type { SfxName, Track } from '../names';
import type { AudioModule } from '../../game/contracts';

/* 본체가 부르는 모양(src/game/contracts.ts AudioModule)과 맞는지 컴파일 때 확인 */
void (audio satisfies AudioModule);

interface Gdd {
  audio: { sfx: Record<string, [string, string]>; music: Record<string, [string, string]> };
  audioApi: { sfxNames: string[]; tracks: string[]; exports: Record<string, string> };
}
const gdd = JSON.parse(gddRaw) as Gdd;

/* 검수 스크립트(scripts/shot-web.js)가 읽는 상태 */
(window as unknown as { __sikdae: unknown }).__sikdae = {
  ready: true, platform: 'desktop', renderer: 'none', gpu: '', fps: 0, launches: 0, fullscreen: false, errors: [] as string[],
};

const errors: string[] = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push(String((e as PromiseRejectionEvent).reason)));

/* ------------------------------------------------------------------ 계약 대조 */

const exportsWanted = ['init', 'sfx', 'music', 'setVolume', 'getVolume', 'setHurry', 'duck'];
const api = audio as unknown as Record<string, unknown>;
const contract = {
  sfx: {
    want: gdd.audioApi.sfxNames.length,
    have: gdd.audioApi.sfxNames.filter((n) => (audio.sfxNames as readonly string[]).includes(n)).length,
    extra: (audio.sfxNames as readonly string[]).filter((n) => !gdd.audioApi.sfxNames.includes(n)),
    missing: gdd.audioApi.sfxNames.filter((n) => !(audio.sfxNames as readonly string[]).includes(n)),
    sameOrder: JSON.stringify(gdd.audioApi.sfxNames) === JSON.stringify(audio.sfxNames),
  },
  tracks: {
    want: gdd.audioApi.tracks.length,
    have: gdd.audioApi.tracks.filter((n) => (audio.tracks as readonly string[]).includes(n)).length,
    missing: gdd.audioApi.tracks.filter((n) => !(audio.tracks as readonly string[]).includes(n)),
  },
  exports: {
    want: exportsWanted.length,
    have: exportsWanted.filter((n) => typeof api[n] === 'function').length,
    missing: exportsWanted.filter((n) => typeof api[n] !== 'function'),
  },
};

/* ------------------------------------------------------------------ 화면 */

const GROUPS: [string, SfxName[]][] = [
  ['버튼·패널', ['ui_click', 'ui_tap', 'ui_open', 'ui_close', 'ui_error', 'ui_toggle', 'ui_fullscreen', 'speed_change', 'toast', 'wipe']],
  ['타이틀·성장', ['title_logo', 'title_start', 'node_buy', 'node_buy_key', 'skill_up', 'mastery_up', 'item_up', 'rep_hire', 'rep_select', 'district_open', 'district_select', 'level_up']],
  ['영업', ['lunch_start', 'lunch_tick', 'lunch_end', 'target_appear', 'target_appear_big', 'boss_appear', 'target_leave', 'persuade', 'hop', 'flee_honk', 'bike_dash', 'target_new', 'match_up']],
  ['계약·코인', ['contract_s', 'contract_m', 'contract_l', 'contract_xl', 'contract_boss', 'crit', 'stamp', 'coin_arrive', 'point_get', 'pending_release']],
  ['스킬·패시브', ['skill_call', 'skill_promo_set', 'skill_promo_boom', 'skill_rush', 'skill_qr', 'wom', 'hot', 'ref']],
  ['선물·문의·아이템', ['gift_spawn', 'gift_open', 'inquiry_spawn', 'inquiry_pick', 'item_drop', 'item_get']],
  ['정산·엔딩', ['settle_open', 'settle_count', 'settle_total', 'ending']],
];
{
  const listed = new Set(GROUPS.flatMap(([, n]) => n));
  const rest = audio.sfxNames.filter((n) => !listed.has(n));
  if (rest.length) GROUPS.push(['기타', rest]);
}

const css = `
:root { --bg:#f6f3ee; --card:#fff; --ink:#2a2118; --sub:#7a6a58; --line:#e6ddd0; --acc:#e0663f; --ok:#2e7d32; --bad:#c62828; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.45 system-ui, "Malgun Gothic", sans-serif; }
main { max-width:1500px; margin:0 auto; padding:16px; }
h1 { font-size:20px; margin:0 0 4px; }
h2 { font-size:15px; margin:0 0 8px; }
.sub { color:var(--sub); font-size:12px; }
.row { display:flex; flex-wrap:wrap; gap:12px; align-items:stretch; }
.row > .card { flex:1 1 320px; min-width:0; }
.card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin:0 0 12px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:6px; }
button { font:inherit; border:1px solid var(--line); background:#fffaf4; color:var(--ink); border-radius:8px; padding:6px 8px; cursor:pointer; text-align:left; }
button:hover { border-color:var(--acc); }
button:active { transform:translateY(1px); }
button.on { background:var(--acc); color:#fff; border-color:var(--acc); }
button .n { display:block; font-family:ui-monospace, Consolas, monospace; font-size:12px; }
button .d { display:block; color:var(--sub); font-size:11px; }
button.on .d { color:#ffe7dc; }
label.sl { display:flex; align-items:center; gap:8px; margin:4px 0; }
label.sl span:first-child { width:60px; }
label.sl input[type=range] { width:180px; }
.chip { display:inline-block; padding:2px 8px; border-radius:99px; background:#f0e9df; margin:2px 4px 2px 0; font-size:12px; }
.okc { color:var(--ok); font-weight:600; } .badc { color:var(--bad); font-weight:600; }
table { border-collapse:collapse; width:100%; font-size:12px; }
th, td { border-bottom:1px solid var(--line); padding:4px 6px; text-align:right; white-space:nowrap; }
th { background:#faf6f0; position:sticky; top:0; }
td.l, th.l { text-align:left; }
td.code { font-family:ui-monospace, Consolas, monospace; }
.tablewrap { max-height:none; overflow:auto; }
@media (max-width:700px) { label.sl input[type=range] { width:120px; } }
`;

const app = document.getElementById('app')!;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { cls?: string } = {}, kids: (Node | string)[] = []): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  const { cls, ...rest } = props;
  if (cls) e.className = cls;
  Object.assign(e, rest);
  for (const k of kids) e.append(k);
  return e;
};

const main = el('main');
app.append(main);
main.append(el('h1', { textContent: '식권대장 타이쿤 소리 검수' }), el('div', { cls: 'sub', textContent: '파일 없이 Web Audio 합성. 아무 곳이나 한 번 누르면 소리가 켜진다 (그 전에는 AudioContext 를 만들지 않음).' }));

const status = el('div', { cls: 'card' });
main.append(status);
const statusLine = el('div');
status.append(el('h2', { textContent: '상태' }), statusLine);
function renderStatus(): void {
  const d = audio.audioDebug();
  statusLine.innerHTML = '';
  const chips = [
    `AudioContext: ${d.created ? d.state : '아직 없음'}`,
    `배경음: ${d.track ?? '-'}${d.fading ? ` (페이드아웃 ${d.fading})` : ''}`,
    `hurry: ${d.hurry ? '켜짐' : '꺼짐'}`,
    `울리는 효과음: ${d.voices}`,
    `버림 간격 ${d.dropped.throttle} / 동시 ${d.dropped.voices} / 이름별 ${d.dropped['per-name']}`,
    `master ${audio.getVolume('master').toFixed(2)} · music ${audio.getVolume('music').toFixed(2)} · sfx ${audio.getVolume('sfx').toFixed(2)}${audio.isMuted() ? ' · 음소거' : ''}`,
  ];
  for (const c of chips) statusLine.append(el('span', { cls: 'chip', textContent: c }));
}
setInterval(renderStatus, 250);
renderStatus();

/* 계약 */
{
  const c = el('div', { cls: 'card' });
  const ok = (a: number, b: number): string => (a === b ? 'okc' : 'badc');
  c.innerHTML = `<h2>계약 대조 (설계서 9장 · gdd-data.json audioApi)</h2>
    <span class="chip">효과음 이름 <b class="${ok(contract.sfx.have, contract.sfx.want)}">${contract.sfx.have}/${contract.sfx.want}</b>${contract.sfx.sameOrder ? ' · 순서 같음' : ''}${contract.sfx.extra.length ? ' · 초과 ' + contract.sfx.extra.join(', ') : ''}</span>
    <span class="chip">배경음 트랙 <b class="${ok(contract.tracks.have, contract.tracks.want)}">${contract.tracks.have}/${contract.tracks.want}</b></span>
    <span class="chip">내보내는 함수 <b class="${ok(contract.exports.have, contract.exports.want)}">${contract.exports.have}/${contract.exports.want}</b> (${exportsWanted.join(', ')})</span>`;
  main.append(c);
}

/* 음량·배경음·옵션 */
const opts = { tier: 10, pitch: 1, pan: 0 };
{
  const row = el('div', { cls: 'row' });
  main.append(row);

  const vc = el('div', { cls: 'card' });
  vc.append(el('h2', { textContent: '음량 (저장됨)' }));
  for (const k of ['master', 'music', 'sfx'] as const) {
    const out = el('span', { textContent: audio.getVolume(k).toFixed(2) });
    const inp = el('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(audio.getVolume(k) * 100)) });
    inp.addEventListener('input', () => {
      audio.setVolume(k, Number(inp.value) / 100);
      out.textContent = audio.getVolume(k).toFixed(2);
    });
    vc.append(el('label', { cls: 'sl' }, [el('span', { textContent: k }), inp, out]));
  }
  const mute = el('input', { type: 'checkbox', checked: audio.isMuted() });
  mute.addEventListener('change', () => audio.setMuted(mute.checked));
  vc.append(el('label', { cls: 'sl' }, [el('span', { textContent: '음소거' }), mute]));
  row.append(vc);

  const mc = el('div', { cls: 'card' });
  mc.append(el('h2', { textContent: '배경음 (0.6초 크로스페이드)' }));
  const tb = el('div', { cls: 'grid' });
  const trackBtns = new Map<Track | null, HTMLButtonElement>();
  const markTrack = (t: Track | null): void => trackBtns.forEach((b, k) => b.classList.toggle('on', k === t && t !== null));
  for (const t of [...audio.tracks, null] as (Track | null)[]) {
    const info = t ? gdd.audio.music[t] : null;
    const b = el('button', {}, [el('span', { cls: 'n', textContent: t ?? '정지' }), el('span', { cls: 'd', textContent: info ? info[0] : 'music(null)' })]);
    b.addEventListener('click', async () => {
      await audio.init();
      audio.music(t);
      markTrack(t);
    });
    trackBtns.set(t, b);
    tb.append(b);
  }
  mc.append(tb);
  const hb = el('div', { cls: 'grid' });
  hb.style.marginTop = '6px';
  const hurry = el('button', {}, [el('span', { cls: 'n', textContent: 'hurry' }), el('span', { cls: 'd', textContent: '남은 5초·러시 (lunch·boss)' })]);
  hurry.addEventListener('click', () => {
    const on = !hurry.classList.contains('on');
    hurry.classList.toggle('on', on);
    audio.setHurry(on);
  });
  const d1 = el('button', {}, [el('span', { cls: 'n', textContent: 'duck(0.5, 0.6)' }), el('span', { cls: 'd', textContent: '대형 계약' })]);
  d1.addEventListener('click', () => audio.duck(0.5, 0.6));
  const d2 = el('button', {}, [el('span', { cls: 'n', textContent: 'duck(0.2, 1.5)' }), el('span', { cls: 'd', textContent: '전국 계약' })]);
  d2.addEventListener('click', () => audio.duck(0.2, 1.5));
  const d3 = el('button', {}, [el('span', { cls: 'n', textContent: 'duck(0.45, 0) / (1, 0)' }), el('span', { cls: 'd', textContent: '정산 모달 줄임 유지 ↔ 복귀' })]);
  let held = false;
  d3.addEventListener('click', () => {
    held = !held;
    d3.classList.toggle('on', held);
    audio.duck(held ? 0.45 : 1, 0);
  });
  hb.append(hurry, d1, d2, d3);
  mc.append(hb);
  row.append(mc);

  const oc = el('div', { cls: 'card' });
  oc.append(el('h2', { textContent: '효과음 옵션' }));
  const slider = (label: string, key: keyof typeof opts, min: number, max: number, step: number): void => {
    const out = el('span', { textContent: String(opts[key]) });
    const inp = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(opts[key]) });
    inp.addEventListener('input', () => {
      opts[key] = Number(inp.value);
      out.textContent = inp.value;
    });
    oc.append(el('label', { cls: 'sl' }, [el('span', { textContent: label }), inp, out]));
  };
  slider('tier', 'tier', 0, 20, 1);
  slider('pitch', 'pitch', 0.5, 2, 0.05);
  slider('pan', 'pan', -1, 1, 0.1);
  oc.append(el('div', { cls: 'sub', textContent: 'pitch = 주파수 배율(1 = 그대로). persuade 는 tier = (1−게이지)×20. tier 를 쓰는 소리는 버튼에 표시.' }));
  row.append(oc);
}

/* 효과음 버튼 */
{
  const c = el('div', { cls: 'card' });
  c.append(el('h2', { textContent: `효과음 ${audio.sfxNames.length}개` }));
  for (const [g, names] of GROUPS) {
    c.append(el('div', { cls: 'sub', textContent: g }));
    const grid = el('div', { cls: 'grid' });
    grid.style.margin = '4px 0 10px';
    for (const n of names) {
      const info = gdd.audio.sfx[n];
      const d = (info ? info[0] : '') + (SFX_USES[n] ? ` · ${SFX_USES[n]}` : '');
      const b = el('button', { title: info ? info[1] : '' }, [el('span', { cls: 'n', textContent: n }), el('span', { cls: 'd', textContent: d })]);
      b.addEventListener('click', async () => {
        await audio.init();
        audio.sfx(n, { tier: opts.tier, pitch: opts.pitch, pan: opts.pan });
      });
      grid.append(b);
    }
    c.append(grid);
  }
  main.append(c);
}

/* 연속 재생 (실시간) */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function burst(kind: 'persuade' | 'storm' | 'coins' | 'appear'): Promise<void> {
  await audio.init();
  const t0 = performance.now();
  if (kind === 'persuade') {
    for (let i = 0; i < 60; i++) {
      audio.sfx('persuade', { tier: (i % 25) * 0.8 });
      await sleep(50);
    }
  } else if (kind === 'coins') {
    for (let i = 0; i < 24; i++) {
      audio.sfx('coin_arrive', { tier: opts.tier });
      await sleep(60);
    }
  } else if (kind === 'appear') {
    for (let i = 0; i < 40; i++) {
      audio.sfx(i % 9 === 0 ? 'target_appear_big' : 'target_appear', { tier: i % 21 });
      await sleep(40);
    }
  } else {
    while (performance.now() - t0 < 3000) {
      audio.sfx('contract_s', { tier: Math.floor(Math.random() * 8) });
      audio.sfx('coin_arrive', { tier: Math.random() * 10 });
      audio.sfx('persuade', { tier: Math.random() * 20 });
      if (Math.random() < 0.08) audio.sfx('contract_l', { tier: 12 });
      if (Math.random() < 0.03) audio.sfx('contract_xl');
      await sleep(33);
    }
  }
}
{
  const c = el('div', { cls: 'card' });
  c.append(el('h2', { textContent: '연속 재생 (실시간, 간격 제한·동시 발음 한도 확인)' }));
  const grid = el('div', { cls: 'grid' });
  const items: [string, string, Parameters<typeof burst>[0]][] = [
    ['설득 연타 3초', '50ms 마다 persuade (0.12초 간격 제한)', 'persuade'],
    ['코인 줄줄이', '60ms 마다 coin_arrive, 음 높이 오름', 'coins'],
    ['대상 등장 연속', 'target_appear 40개', 'appear'],
    ['계약 폭주 3초', '초당 30건 계약+코인+설득', 'storm'],
  ];
  for (const [n, d, k] of items) {
    const b = el('button', {}, [el('span', { cls: 'n', textContent: n }), el('span', { cls: 'd', textContent: d })]);
    b.addEventListener('click', () => void burst(k));
    grid.append(b);
  }
  c.append(grid);
  main.append(c);
}

/* ------------------------------------------------------------------ 측정 */

interface Row {
  kind: 'sfx' | 'variant' | 'music' | 'mix';
  name: string;
  desc: string;
  nominal?: number;
  s?: Stats & { nominal?: number; loopSec?: number };
  error?: string;
}
const results: Row[] = [];
const measureCard = el('div', { cls: 'card' });
const measureInfo = el('div', { cls: 'sub', textContent: '아직 안 잼' });
const measureBtn = el('button', {}, [el('span', { cls: 'n', textContent: '전체 측정' }), el('span', { cls: 'd', textContent: 'OfflineAudioContext 로 렌더 (리미터 앞뒤 2번)' })]);
const tableWrap = el('div', { cls: 'tablewrap' });
measureCard.append(el('h2', { textContent: '측정 (OfflineAudioContext 44.1kHz 스테레오, 기본 음량 master .85 · sfx .8 · music .6)' }), measureBtn, measureInfo, tableWrap);
main.append(measureCard);

const f2 = (v: number | undefined): string => (v == null || !Number.isFinite(v) ? '-' : v.toFixed(2));
const f3 = (v: number | undefined): string => (v == null || !Number.isFinite(v) ? '-' : v.toFixed(3));
const f1 = (v: number | undefined): string => (v == null || !Number.isFinite(v) ? '-∞' : v.toFixed(1));

function verdict(r: Row): [string, boolean] {
  if (r.error) return ['에러', false];
  if (!r.s) return ['-', false];
  if (r.s.clip) return ['클리핑', false];
  if (r.s.silent) return ['무음', false];
  return ['OK', true];
}

function drawTable(): void {
  const t = el('table');
  t.innerHTML = `<thead><tr><th class="l">#</th><th class="l">종류</th><th class="l">이름</th><th class="l">설명</th><th>명목 길이(초)</th><th>실제 길이(초)</th><th>피크</th><th>피크 dBFS</th><th>리미터 전 피크</th><th>RMS dBFS</th><th class="l">판정</th></tr></thead>`;
  const tb = el('tbody');
  results.forEach((r, i) => {
    const [v, ok] = verdict(r);
    const tr = el('tr');
    tr.innerHTML = `<td class="l">${i + 1}</td><td class="l">${r.kind}</td><td class="l code">${r.name}</td><td class="l">${r.desc}</td><td>${f2(r.nominal)}</td><td>${f2(r.s?.duration)}</td><td>${f3(r.s?.peak)}</td><td>${f1(r.s?.peakDb)}</td><td>${f3(r.s?.rawPeak)}</td><td>${f1(r.s?.rmsDb)}</td><td class="l ${ok ? 'okc' : 'badc'}">${v}${r.error ? ' ' + r.error : ''}</td>`;
    tb.append(tr);
  });
  t.append(tb);
  tableWrap.innerHTML = '';
  tableWrap.append(t);
}

async function measureAll(): Promise<{ rows: Row[]; summary: Record<string, unknown>; contract: typeof contract; errors: string[] }> {
  results.length = 0;
  const t0 = performance.now();
  const push = async (kind: Row['kind'], name: string, desc: string, fn: () => Promise<Stats>): Promise<void> => {
    const row: Row = { kind, name, desc };
    try {
      const s = (await fn()) as Stats & { nominal?: number; loopSec?: number };
      row.s = s;
      if (typeof s.nominal === 'number') row.nominal = s.nominal;
      if (typeof s.loopSec === 'number') row.nominal = s.loopSec;
    } catch (e) {
      row.error = String((e as Error)?.message ?? e);
    }
    results.push(row);
    measureInfo.textContent = `측정 중 ${results.length}`;
  };
  for (const n of audio.sfxNames) {
    const info = gdd.audio.sfx[n];
    const o = n === 'lunch_tick' ? { tier: 3 } : { tier: 10 };
    await push('sfx', n, info ? info[0] : '', () => renderSfx(n, o));
  }
  const variants: [SfxName, Record<string, number>, string][] = [
    ['contract_s', { tier: 0 }, '티어 0 (1인 사무실)'], ['contract_s', { tier: 20 }, '티어 20'],
    ['target_appear', { tier: 0 }, '티어 0'], ['target_appear', { tier: 20 }, '티어 20'],
    ['persuade', { tier: 0 }, '게이지 가득 400Hz'], ['persuade', { tier: 20 }, '게이지 거의 0 1200Hz'],
    ['coin_arrive', { tier: 0 }, '작은 액수 1음'], ['coin_arrive', { tier: 10 }, '중간 3음'], ['coin_arrive', { tier: 20 }, '큰 액수 4음'], ['coin_arrive', { pitch: 1.48 }, '본체 연속 도착 배율 최대'],
    ['match_up', { tier: 0 }, '매칭 1단계'], ['match_up', { tier: 6 }, '매칭 7단계'],
    ['lunch_tick', { tier: 1 }, '마지막 1초 1500Hz'],
    ['ui_click', { pan: -1 }, '왼쪽 끝'], ['contract_xl', { vol: 2 }, '음량 2배 (리미터 확인)'],
  ];
  for (const [n, o, d] of variants) await push('variant', `${n} ${JSON.stringify(o)}`, d, () => renderSfx(n, o));
  for (const t of audio.tracks) {
    const info = gdd.audio.music[t];
    await push('music', t, `${info[0]} 루프 1바퀴`, () => renderMusic(t));
  }
  await push('music', 'lunch hurry', '남은 5초 (bpm ×1.12, 하이햇 16분)', () => renderMusic('lunch', { hurry: true }));
  await push('music', 'boss hurry', '보스 판 남은 5초', () => renderMusic('boss', { hurry: true }));
  const xf: [Track, Track][] = [['title', 'office'], ['office', 'lunch'], ['lunch', 'boss'], ['lunch', 'office'], ['boss', 'ending']];
  for (const [a, b] of xf) await push('mix', `${a} → ${b}`, '크로스페이드 0.6초', () => renderCrossfade(a, b));
  await push('mix', 'stress', '후반 폭주 5초 (lunch hurry + 초당 30건 계약)', () => renderStress());

  drawTable();
  const bad = results.filter((r) => !verdict(r)[1]);
  const sfxRows = results.filter((r) => r.kind === 'sfx' && r.s);
  const allRows = results.filter((r) => r.s);
  const summary = {
    rows: results.length,
    sfx: sfxRows.length,
    bad: bad.map((r) => `${r.name}: ${verdict(r)[0]}`),
    maxPeak: Math.max(...allRows.map((r) => r.s!.peak)),
    maxRawPeak: Math.max(...allRows.map((r) => r.s!.rawPeak)),
    clip: allRows.filter((r) => r.s!.clip).length,
    silent: allRows.filter((r) => r.s!.silent).length,
    errors: results.filter((r) => r.error).length,
    ms: Math.round(performance.now() - t0),
  };
  measureInfo.textContent = `${results.length}건 · 에러 ${summary.errors} · 클리핑 ${summary.clip} · 무음 ${summary.silent} · 최대 피크 ${f3(summary.maxPeak)} (리미터 전 ${f3(summary.maxRawPeak)}) · ${summary.ms}ms`;
  return { rows: results, summary, contract, errors };
}
measureBtn.addEventListener('click', () => void measureAll());

(window as unknown as { __audioTest: unknown }).__audioTest = { measureAll, contract, errors, audio, burst, results };

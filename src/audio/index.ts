/**
 * 식권대장 타이쿤 소리 — Web Audio 합성, 파일 0개.  (설계서 9장 사운드 API 계약)
 *
 *   init()                 첫 pointerdown·keydown 에서 자동 호출된다(이 모듈이 리스너를 건다). 직접 불러도 된다.
 *                          첫 사용자 입력 전에는 AudioContext 를 만들지 않는다.
 *   sfx(name, opts)        효과음 1회. init 전·음소거면 조용히 무시. 동시 14음(important 는 무시), 이름별 간격 제한
 *   music(track, {fade})   배경음 전환(기본 0.6초 크로스페이드). null = 정지. init 전에 부르면 기억했다가 init 뒤 재생
 *   setVolume / getVolume  master·music·sfx 0..1, localStorage `sikdae-tycoon:sikdae_tycoon_vol`
 *   setHurry(on)           lunch·boss 남은 5초 모드 (bpm ×1.12, 하이햇 16분)
 *   duck(to, sec)          음악만 to 배로 줄였다가 sec 뒤 돌아옴. sec 가 0 이하면 다음 duck 까지 유지(duck(1, 0) = 복귀)
 *
 * 추가 (계약 밖, 있으면 편한 것)
 *   setMuted(on) / isMuted()   master 값은 그대로 두고 음소거만 켜고 끔 (저장됨)
 *   amountTier(amount, scale)  액수 → coin_arrive 의 tier (0..20)
 *   isReady()                  AudioContext 가 돌고 있는지
 *
 * opts (sfx)
 *   pitch  주파수 배율 (1 = 그대로, 2 = 한 옥타브 위). 없거나 0 이하면 1. 범위 0.25..4
 *   vol    음량 배율 (기본 1, 최대 2)
 *   pan    좌우 −1..1
 *   tier   target_appear·target_appear_big·contract_s/m/l: 대상 티어 0..20
 *          persuade: (1 − 게이지) × 20 → 400 + 800 × tier/20 Hz (설계서 7-1)
 *          coin_arrive: 액수 크기 0..20 (amountTier) → 1~4음 아르페지오. pitch 를 1 아닌 값으로 주면
 *                       자체 연속 상승(0.35초 안 연달아 오면 5음계로 오름)을 끄고 그 배율만 씀
 *          match_up: 밸런스계약 단계 0..6, lunch_tick: 남은 초(1 = 마지막)
 *   delay  초 뒤에 재생
 *
 * 굽기(설계서 7장 7, bake.ts): 배경음은 곡마다 한 루프를 구워 버퍼로 반복 재생(굽는 동안만 실시간 합성),
 * 효과음은 변형마다 한 번 구워 버퍼 소스 1개 + 게인으로 재생. OfflineAudioContext 가 없으면 옛 실시간 합성 그대로.
 *
 * 큰 계약 때 음악 줄이기(설계서 6-2)는 부르는 쪽에서: grade 3 → duck(0.5, 0.6), grade 4 → duck(0.2, 1.5)
 * 정산 모달 동안 lunch 를 줄인 채 유지 → duck(0.45, 0), 닫을 때 duck(1, 0)
 */
import { storage } from '../storage';
import { bakeSfxBatch, bakeTrack, canBake, presetVariant, sfxVariant, type BakedTrack, type SfxVariant } from './bake';
import { buildGraph, clamp, makeX, type Graph } from './core';
import { Gate } from './gate';
import { Player, TOTAL, themeHurryable } from './music';
import { BGM_GAIN, DEFAULT_VOLUME, STORAGE_KEY, sfxNames, tracks, type SfxName, type Track, type VolumeKind } from './names';
import { playSfx } from './play';
import { SFX, newSfxState, type SfxOpts } from './sfx';

export type { SfxName, Track, VolumeKind, SfxOpts };
export { sfxNames, tracks };

interface Saved {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

function loadVolume(): Saved {
  const raw = storage.load<Partial<Saved> | null>(STORAGE_KEY, null);
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 1) : d);
  return {
    master: num(raw?.master, DEFAULT_VOLUME.master),
    music: num(raw?.music, DEFAULT_VOLUME.music),
    sfx: num(raw?.sfx, DEFAULT_VOLUME.sfx),
    muted: raw?.muted === true,
  };
}

const vol: Saved = loadVolume();
const LOOKAHEAD = 0.18;

let ctx: AudioContext | null = null;
let G: Graph | null = null;
const gate = new Gate();
const state = newSfxState();
let wanted: Track | null = null;
let wantedFade = 0.6;
let current: Player | null = null;
const dying: Player[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let hurry = false;
let gestureSeen = false;

const docHidden = (): boolean => typeof document !== 'undefined' && document.hidden;
const effMaster = (): number => (vol.muted ? 0 : vol.master);

function userActivated(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : gestureSeen;
}

/* ------------------------------------------------------------------ 시작 */

export function init(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!ctx) {
    if (!userActivated()) return Promise.resolve(); // 첫 사용자 입력 전: 만들지 않음 (리스너가 나중에 다시 부름)
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return Promise.resolve();
    try {
      ctx = new AC({ latencyHint: 'interactive' });
      G = buildGraph(ctx, { master: effMaster(), sfx: vol.sfx, music: BGM_GAIN * vol.music });
    } catch (e) {
      console.warn('[audio] 시작 실패', e);
      ctx = null;
      G = null;
      return Promise.resolve();
    }
    ctx.onstatechange = sync;
    bakeOn = canBake();
    prebakeLunch();
  }
  const c = ctx;
  if (c.state !== 'running' && c.state !== 'closed' && !docHidden()) {
    return c.resume().then(sync, () => undefined);
  }
  sync();
  return Promise.resolve();
}

function sync(): void {
  applyMusic();
}

/* ------------------------------------------------------------------ 효과음 */

/* 구운 효과음(LRU) · 굽는 중 */
const sfxBuf = new Map<string, AudioBuffer>();
/** 변형별 소리 길이(잔향 꼬리 뺀 것) */
const sfxDur = new Map<string, number>();
const sfxBaking = new Set<string>();
const SFX_CACHE_MAX = 220;
let bakeOn = false;
/** 검수용: 실시간 합성으로 튼 횟수 · 구운 버퍼로 튼 횟수 · 가까운 음 높이로 튼 횟수 */
const sfxStat = { live: 0, baked: 0, near: 0 };

function sfxGet(key: string): AudioBuffer | undefined {
  const b = sfxBuf.get(key);
  if (b) {
    sfxBuf.delete(key);
    sfxBuf.set(key, b);
  }
  return b;
}
/*
 * 굽기 줄(설계서 7장 7): 부른 변형·미리 굽기 변형을 모아 두었다가 굽기가 허락될 때(영업 화면 밖 — main 이 setBakeGate 로 알려 줌)
 * 12개씩 한 컨텍스트에 묶어 굽는다. 영업 중에는 굽지 않고 가까운 음 높이로 틀거나(재생 속도) 한 번만 실시간 합성.
 * 묶음 사이 40ms 쉼(한 묶음 = 작업 하나, 긴 작업을 만들지 않음). 숨김 탭에서는 쉼
 */
const sfxPending = new Map<string, { v: SfxVariant; hint: number }>();
const SFX_BATCH = 12;
let bakeGate: () => boolean = () => true;
let bakeT = 0;
/** 굽기를 해도 되는지 알려 주는 함수(영업 중 false). 다시 열리면 밀린 줄을 굽는다 */
export function setBakeGate(fn: () => boolean): void {
  bakeGate = fn;
}
function kickBakes(ms = 40): void {
  if (bakeT || !sfxPending.size) return;
  bakeT = window.setTimeout(() => void runBakes(), ms);
}
async function runBakes(): Promise<void> {
  bakeT = 0;
  if (!sfxPending.size) return;
  if (!bakeGate() || docHidden()) {
    bakeT = window.setTimeout(() => void runBakes(), 500);
    return;
  }
  const jobs: { v: SfxVariant; hint: number }[] = [];
  for (const [k, j] of sfxPending) {
    sfxPending.delete(k);
    if (sfxBuf.has(k)) continue;
    jobs.push(j);
    sfxBaking.add(k);
    if (jobs.length >= SFX_BATCH) break;
  }
  try {
    const res = jobs.length ? await bakeSfxBatch(jobs) : [];
    res.forEach((b, i) => {
      if (!b) return;
      const k = jobs[i].v.key;
      sfxBuf.set(k, b.buf);
      sfxDur.set(k, b.dur);
    });
    while (sfxBuf.size > SFX_CACHE_MAX) {
      const k = sfxBuf.keys().next().value as string;
      sfxBuf.delete(k);
      sfxDur.delete(k);
    }
  } catch {
    /* 이번 묶음은 버림(다음에 부르면 다시 줄에) */
  } finally {
    for (const j of jobs) sfxBaking.delete(j.v.key);
  }
  kickBakes(40);
}
function queueSfxBake(v: SfxVariant, hint = 0): void {
  if (!bakeOn || sfxBaking.has(v.key) || sfxBuf.has(v.key) || sfxPending.has(v.key)) return;
  sfxPending.set(v.key, { v, hint });
  kickBakes();
}

/**
 * 영업에 자주 쓰는 변형을 미리 굽는다(오디오 시작 때 한 번 줄에 넣음 — 타이틀·사무실에서 구워져 첫 영업일에 새로 굽는 일이 없게).
 * 순서 = 영업 첫 몇 초에 나오는 순서
 */
let prebaked = false;
function prebakeLunch(): void {
  if (prebaked || !bakeOn) return;
  prebaked = true;
  const add = (v: SfxVariant): void => queueSfxBake(v);
  const tiers = [0, 5, 10, 15, 20];
  add(presetVariant('lunch_start'));
  for (const t of tiers) add(presetVariant('target_appear', 0, t));
  for (let s = 0; s <= 14; s += 2) for (const f of [0, 1]) add(presetVariant('persuade', s, 0, { f }));
  for (const t of tiers) add(presetVariant('contract_s', 0, t));
  add(presetVariant('stamp'));
  for (let c = 0; c < 6; c++) add(presetVariant('coin_arrive', 0, 0, { c }));
  for (let s = 2; s <= 12; s += 2) add(presetVariant('coin_arrive', s, 0, { c: 0 }));
  add(presetVariant('lunch_tick', 0));
  add(presetVariant('lunch_tick', 7));
  add(presetVariant('target_leave'));
  add(presetVariant('target_new'));
  for (let s = 0; s <= 6; s += 2) add(presetVariant('match_up', s));
  for (const t of tiers) add(presetVariant('target_appear_big', 0, t));
  for (const t of tiers) add(presetVariant('contract_m', 0, t));
  for (const t of tiers) add(presetVariant('contract_l', 0, t));
  for (const n of ['crit', 'hop', 'item_drop', 'item_get', 'gift_spawn', 'gift_open', 'inquiry_spawn', 'inquiry_pick', 'level_up', 'pending_release', 'lunch_end', 'flee_honk', 'bike_dash', 'wom', 'ref', 'hot', 'skill_call', 'skill_promo_set', 'skill_rush', 'skill_qr', 'skill_promo_boom', 'boss_appear', 'contract_xl', 'contract_boss'] as SfxName[])
    if (SFX[n]) add(presetVariant(n));
}
/**
 * 같은 소리의 가까운 구운 것 — 음 높이 격자 ±2·±4·±6반음(재생 속도로 맞춤), 없으면 같은 음 높이의 다른 티어·연속 단계.
 * 영업 중에는 새로 굽지 않으므로(굽기 줄은 영업 뒤에) 없는 변형은 이것으로 대신한다
 */
function nearSfx(v: SfxVariant): { buf: AudioBuffer; p: number; dur: number } | null {
  const tail = v.key.split('|').slice(2).join('|');
  for (let d = 2; d <= 6; d += 2)
    for (const k of [v.semis - d, v.semis + d]) {
      const key = v.name + '|' + k + '|' + tail;
      const b = sfxGet(key);
      if (b) return { buf: b, p: Math.pow(2, k / 12), dur: sfxDur.get(key) ?? b.duration };
    }
  const pre = v.name + '|' + v.semis + '|';
  for (const [key, b] of sfxBuf)
    if (key.startsWith(pre)) return { buf: b, p: v.p, dur: sfxDur.get(key) ?? b.duration };
  return null;
}
function playBuf(c: AudioContext, g: Graph, buf: AudioBuffer, t: number, rate: number, v: number, pan: number): void {
  const src = c.createBufferSource();
  src.buffer = buf;
  if (Math.abs(rate - 1) > 1e-4) src.playbackRate.value = rate;
  const gn = c.createGain();
  gn.gain.value = v;
  src.connect(gn);
  if (pan && typeof c.createStereoPanner === 'function') {
    const p = c.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    gn.connect(p);
    p.connect(g.sfxBus);
  } else gn.connect(g.sfxBus);
  src.start(t);
}

export function sfx(name: SfxName, opts: SfxOpts = {}): void {
  const c = ctx;
  const g = G;
  if (!c || !g || c.state !== 'running') return;
  if (vol.muted || vol.master <= 0 || vol.sfx <= 0) return;
  try {
    if (!bakeOn || !SFX[name]) {
      playSfx(g, gate, state, name, opts, c.currentTime);
      return;
    }
    const now = c.currentTime;
    const t = now + 0.005 + Math.max(0, Number(opts.delay) || 0);
    if (gate.check(name, t, now) !== 'ok') return;
    const v = sfxVariant(name, opts, state, t);
    const vv = (opts.vol == null ? 1 : clamp(Number(opts.vol) || 0, 0, 2)) * v.gain;
    const pan = Number(opts.pan) || 0;
    let buf = sfxGet(v.key);
    let rate = v.pAsked / v.p;
    let dur = buf ? (sfxDur.get(v.key) ?? buf.duration) : 0;
    if (buf) sfxStat.baked++;
    else {
      const n = nearSfx(v);
      if (n) {
        buf = n.buf;
        rate = v.pAsked / n.p;
        dur = n.dur;
        sfxStat.near++;
        queueSfxBake(v, n.dur);
      }
    }
    if (buf) {
      playBuf(c, g, buf, t, rate, vv, pan);
      gate.add(name, t, t + dur / rate);
      return;
    }
    /* 아직 구운 것이 없음: 이번 한 번만 실시간 합성(굽기와 같은 변형 — 같은 상태로) */
    sfxStat.live++;
    let out: AudioNode = g.sfxBus;
    if (pan && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      p.connect(g.sfxBus);
      out = p;
    }
    const end = SFX[name](makeX(g, g.sfx, v.p, vv, out), t, { tier: v.tier, pitch: v.p }, { ...v.st, coinLast: v.st.coinLast + (t - 0.01), persuadeTimes: [] });
    gate.add(name, t, end);
    queueSfxBake(v, end - t);
  } catch (e) {
    console.warn('[audio] sfx 실패', name, e);
  }
}

/* ------------------------------------------------------------------ 배경음 */

/**
 * 곡을 틀지 않고 미리 굽기만(설계서 7장 7): 영업 중에 처음 트는 곡(보스)을 사무실에서 구워 두면 영업 중 굽기·실시간 합성이 없다
 */
export function prefetchMusic(track: Track): void {
  if (!bakeOn || !(tracks as readonly string[]).includes(track)) return;
  queueTrackBake(track, false, true);
}

export function music(track: Track | null, opts: { fade?: number } = {}): void {
  wanted = track && (tracks as readonly string[]).includes(track) ? track : null;
  wantedFade = Math.max(0, opts.fade ?? 0.6);
  applyMusic();
}

function canPlayMusic(): boolean {
  return !!ctx && ctx.state === 'running' && !docHidden() && !vol.muted && vol.master > 0 && vol.music > 0;
}

/* ── 구운 배경음 ── */
interface BVoice {
  track: Track;
  hurry: boolean;
  bt: BakedTrack;
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** 루프 위치 0 이 되는 ctx 시각(위치 = (지금 − t0) mod 루프) */
  t0: number;
}
const trackBuf = new Map<string, BakedTrack>();
const trackBaking = new Set<string>();
const TRACK_CACHE_MAX = 5;
let trackChain: Promise<void> = Promise.resolve();
let bvoice: BVoice | null = null;
const tkey = (t: Track, h: boolean): string => t + (h && themeHurryable(t) ? '|h' : '');
const wantHurry = (t: Track): boolean => hurry && themeHurryable(t);

function trackGet(key: string): BakedTrack | undefined {
  const b = trackBuf.get(key);
  if (b) {
    trackBuf.delete(key);
    trackBuf.set(key, b);
  }
  return b;
}
function queueTrackBake(t: Track, h: boolean, force = false): void {
  const key = tkey(t, h);
  if (!bakeOn || trackBaking.has(key) || trackBuf.has(key)) return;
  trackBaking.add(key);
  trackChain = trackChain
    /* 곡이 바뀐 직후(와이프·로딩)와 겹치지 않게 조금 쉬었다가 */
    .then(() => new Promise<void>((r) => setTimeout(r, 1500)))
    /* 차례가 왔을 때 이미 다른 곡으로 넘어갔으면(타이틀 → 사무실) 굽지 않음 */
    .then(() => (force || stillWanted(t) ? bakeTrack(t, h && themeHurryable(t)) : null))
    .then((b) => {
      if (!b) return;
      trackBuf.set(key, b);
      /* 오래 안 쓴 곡부터 버림(지금 곡은 남김) */
      for (const k of [...trackBuf.keys()]) {
        if (trackBuf.size <= TRACK_CACHE_MAX) break;
        if (bvoice && tkey(bvoice.track, bvoice.hurry) === k) continue;
        trackBuf.delete(k);
      }
      onTrackBaked(t);
    })
    .catch(() => undefined)
    .finally(() => trackBaking.delete(key));
}
/** 지금 곡이거나 지금 곡 다음에 올 곡인지 */
function stillWanted(t: Track): boolean {
  if (!wanted) return false;
  if (t === wanted) return true;
  if (wanted === 'office') return t === 'lunch';
  if (wanted === 'lunch' || wanted === 'boss' || wanted === 'title') return t === 'office';
  return false;
}
/** 곡에 딸린 굽기: 지금 곡 → 서두름 판 → 다음에 올 곡(사무실 ↔ 영업) 순서로 하나씩 */
function prefetch(t: Track): void {
  queueTrackBake(t, false);
  if (themeHurryable(t)) queueTrackBake(t, true);
  if (t === 'title') queueTrackBake('office', false);
  if (t === 'lunch' || t === 'boss') queueTrackBake('office', false);
  if (t === 'office') {
    queueTrackBake('lunch', false);
    queueTrackBake('lunch', true);
  }
}

function startBaked(c: BaseAudioContext, g: Graph, t: Track, h: boolean, bt: BakedTrack, at: number, pos: number, level: number, fadeTo: number, fadeSec: number): BVoice {
  const src = c.createBufferSource();
  src.buffer = bt.buf;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = bt.loopSec;
  const gain = c.createGain();
  gain.gain.setValueAtTime(level, at);
  if (fadeSec > 0) gain.gain.linearRampToValueAtTime(fadeTo, at + fadeSec);
  else gain.gain.setValueAtTime(fadeTo, at);
  src.connect(gain);
  gain.connect(g.musicBus);
  const off = ((pos % bt.loopSec) + bt.loopSec) % bt.loopSec;
  src.start(at, off);
  return { track: t, hurry: h, bt, src, gain, t0: at - off };
}
function stopBaked(v: BVoice, at: number, fade: number): void {
  const p = v.gain.gain;
  const f = Math.max(0.02, fade);
  p.cancelScheduledValues(at);
  p.setValueAtTime(p.value, at);
  p.linearRampToValueAtTime(0, at + f);
  v.src.onended = () => {
    try {
      v.gain.disconnect();
    } catch {
      /* 이미 끊김 */
    }
  };
  try {
    v.src.stop(at + f + 0.05);
  } catch {
    /* 이미 멈춤 */
  }
}

/** 굽기가 끝남: 지금 그 곡을 실시간으로 돌리는 중이면 다음 스텝에서 구운 버퍼로 넘김 */
function onTrackBaked(t: Track): void {
  const c = ctx;
  const g = G;
  if (!c || !g || !canPlayMusic()) return;
  const h = wantHurry(t);
  const bt = trackBuf.get(tkey(t, h));
  if (!bt) return;
  if (current && current.track === t && wanted === t) {
    const p = current;
    p.catchUp(c.currentTime);
    p.schedule(c.currentTime + 0.08);
    const at = p.next;
    const level = p.gains[0].gain.value;
    const pos = (p.step % TOTAL) * bt.sd;
    bvoice = startBaked(c, g, t, h, bt, at, pos, level, 1, level < 0.99 ? 0.3 : 0);
    /* 실시간 쪽은 넘긴 시각까지만 예약하고 정리 */
    p.dieAt = at;
    dying.push(p);
    current = null;
    runTimer();
  } else if (bvoice && bvoice.track === t && bvoice.hurry !== h) switchHurry();
}

/** 서두름 판 ↔ 보통 판: 같은 스텝 자리로 0.06초 크로스페이드 */
function switchHurry(): void {
  const c = ctx;
  const g = G;
  const v = bvoice;
  if (!c || !g || !v) return;
  const h = wantHurry(v.track);
  if (v.hurry === h) return;
  const bt = trackGet(tkey(v.track, h));
  if (!bt) {
    queueTrackBake(v.track, h);
    return;
  }
  const at = c.currentTime + 0.03;
  const pos = (((at - v.t0) % v.bt.loopSec) + v.bt.loopSec) % v.bt.loopSec;
  const stepPos = pos / v.bt.sd;
  const level = Math.max(0.001, v.gain.gain.value);
  stopBaked(v, at, 0.06);
  bvoice = startBaked(c, g, v.track, h, bt, at, stepPos * bt.sd, 0, level, 0.06);
}

function applyMusic(): void {
  const c = ctx;
  const g = G;
  if (!c || !g) return;
  const now = c.currentTime;
  if (current && current.track !== wanted) {
    current.fade(0, wantedFade, now);
    current.dieAt = now + wantedFade;
    dying.push(current);
    current = null;
  }
  if (bvoice && bvoice.track !== wanted) {
    stopBaked(bvoice, now, wantedFade);
    bvoice = null;
  }
  /* 음소거 · 음량 0 · 숨김 탭이면 구운 곡도 멈춤(다시 켜면 처음부터) */
  if (bvoice && !canPlayMusic()) {
    stopBaked(bvoice, now, 0.05);
    bvoice = null;
  }
  if (!current && !bvoice && wanted && canPlayMusic()) {
    const start = now + 0.05;
    const h = wantHurry(wanted);
    const bt = bakeOn ? trackGet(tkey(wanted, h)) : undefined;
    if (bt) bvoice = startBaked(c, g, wanted, h, bt, start, 0, wantedFade > 0 ? 0 : 1, 1, wantedFade);
    else {
      const p = new Player(g, wanted, start, wantedFade > 0 ? 0 : 1);
      p.s.hurry = hurry;
      if (wantedFade > 0) p.fade(1, wantedFade, start);
      current = p;
    }
    if (bakeOn) prefetch(wanted);
  }
  runTimer();
}

function runTimer(): void {
  const need = canPlayMusic() && (!!current || dying.length > 0);
  if (need && !timer) {
    timer = setInterval(tickMusic, 25);
    tickMusic();
  } else if (!need && timer) {
    clearInterval(timer);
    timer = null;
  }
}

function tickMusic(): void {
  const c = ctx;
  if (!c || c.state !== 'running') return;
  const now = c.currentTime;
  const until = now + LOOKAHEAD;
  try {
    if (current) {
      current.s.hurry = hurry;
      current.catchUp(now);
      current.schedule(until);
    }
    for (let i = dying.length - 1; i >= 0; i--) {
      const p = dying[i];
      if (now >= p.dieAt) {
        dying.splice(i, 1);
        setTimeout(() => p.dispose(), 1000);
      } else {
        p.catchUp(now);
        p.schedule(Math.min(until, p.dieAt));
      }
    }
  } catch (e) {
    console.warn('[audio] 배경음 예약 실패', e);
  }
  if (!current && !dying.length) runTimer();
}

export function setHurry(on: boolean): void {
  hurry = !!on;
  if (current) current.s.hurry = hurry;
  if (bvoice) switchHurry();
}

export function duck(to: number, sec: number): void {
  const c = ctx;
  const g = G;
  if (!c || !g) return;
  const p = g.duck.gain;
  const now = c.currentTime;
  p.cancelScheduledValues(now);
  p.setTargetAtTime(clamp(Number(to) || 0, 0, 1), now, 0.04);
  if (Number.isFinite(sec) && sec > 0) p.setTargetAtTime(1, now + sec, 0.25);
}

/* ------------------------------------------------------------------ 음량 */

function save(): void {
  storage.save(STORAGE_KEY, vol);
}

function applyGains(): void {
  const c = ctx;
  const g = G;
  if (!c || !g) return;
  const now = c.currentTime;
  const set = (p: AudioParam, v: number): void => {
    p.cancelScheduledValues(now);
    p.setTargetAtTime(v, now, 0.03);
  };
  set(g.master.gain, effMaster());
  set(g.sfxBus.gain, vol.sfx);
  set(g.musicBus.gain, BGM_GAIN * vol.music);
}

export function setVolume(kind: VolumeKind, v: number): void {
  if (kind !== 'master' && kind !== 'music' && kind !== 'sfx') return;
  vol[kind] = clamp(Number(v) || 0, 0, 1);
  save();
  applyGains();
  applyMusic();
}

export function getVolume(kind: VolumeKind): number {
  return vol[kind] ?? 0;
}

export function setMuted(on: boolean): void {
  vol.muted = !!on;
  save();
  applyGains();
  applyMusic();
}

export function isMuted(): boolean {
  return vol.muted;
}

export function isReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

/**
 * 액수 → coin_arrive tier (0..20).
 * 설계서 6-1 거래액 숫자와 같은 눈금: mag = log10(max(1, 액수 ÷ (800 × 판 배율))), tier = mag × 3.4
 */
export function amountTier(amount: number, scale = 1): number {
  const mag = Math.log10(Math.max(1, (Number(amount) || 0) / (800 * Math.max(1e-9, scale))));
  return clamp(mag * 3.4, 0, 20);
}

/** 개발 페이지용 상태 */
export function audioDebug(): {
  created: boolean;
  state: string;
  track: Track | null;
  wanted: Track | null;
  fading: number;
  hurry: boolean;
  voices: number;
  dropped: Record<string, number>;
  sampleRate: number;
  baked: { on: boolean; tracks: string[]; music: string; sfx: number; live: number; hits: number; near: number };
  /** 검수용: 효과음 한 번(sfx 와 같음) · 지금 울리는 효과음 수 */
  sfx: (name: SfxName, opts?: SfxOpts) => void;
  live: () => number;
} {
  return {
    created: !!ctx,
    state: ctx ? ctx.state : 'none',
    track: current ? current.track : bvoice ? bvoice.track : null,
    wanted,
    fading: dying.length,
    hurry,
    voices: ctx ? gate.active(ctx.currentTime) : 0,
    dropped: { ...gate.dropped },
    sampleRate: ctx ? ctx.sampleRate : 0,
    baked: { on: bakeOn, tracks: [...trackBuf.keys()], music: bvoice ? tkey(bvoice.track, bvoice.hurry) : current ? 'live:' + current.track : '', sfx: sfxBuf.size, live: sfxStat.live, hits: sfxStat.baked, near: sfxStat.near },
    sfx: (name: SfxName, opts?: SfxOpts) => sfx(name, opts),
    live: () => (ctx ? gate.active(ctx.currentTime) : 0),
  };
}

/* ------------------------------------------------------------------ 자동 연결 */

function onVisibility(): void {
  const c = ctx;
  if (!c || c.state === 'closed') return;
  if (document.hidden) {
    runTimer();
    if (c.state === 'running') c.suspend().catch(() => undefined);
  } else {
    c.resume().then(sync, () => undefined);
  }
}

if (typeof document !== 'undefined') {
  const unlock = (): void => {
    gestureSeen = true;
    if (!ctx || ctx.state !== 'running') void init();
  };
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) {
    document.addEventListener(ev, unlock, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  });
  window.addEventListener('pageshow', () => {
    if (ctx) sync();
  });
}

/** 이름 확인용 (sfxNames 에 없는 이름이면 false) */
export function isSfxName(n: string): n is SfxName {
  return (sfxNames as readonly string[]).includes(n);
}

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
 *          match_up: 매칭 단계 0..6, lunch_tick: 남은 초(1 = 마지막)
 *   delay  초 뒤에 재생
 *
 * 큰 계약 때 음악 줄이기(설계서 6-2)는 부르는 쪽에서: grade 3 → duck(0.5, 0.6), grade 4 → duck(0.2, 1.5)
 * 정산 모달 동안 lunch 를 줄인 채 유지 → duck(0.45, 0), 닫을 때 duck(1, 0)
 */
import { storage } from '../storage';
import { buildGraph, clamp, type Graph } from './core';
import { Gate } from './gate';
import { Player } from './music';
import { BGM_GAIN, DEFAULT_VOLUME, STORAGE_KEY, sfxNames, tracks, type SfxName, type Track, type VolumeKind } from './names';
import { playSfx } from './play';
import { newSfxState, type SfxOpts } from './sfx';

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

export function sfx(name: SfxName, opts: SfxOpts = {}): void {
  const c = ctx;
  const g = G;
  if (!c || !g || c.state !== 'running') return;
  if (vol.muted || vol.master <= 0 || vol.sfx <= 0) return;
  try {
    playSfx(g, gate, state, name, opts, c.currentTime);
  } catch (e) {
    console.warn('[audio] sfx 실패', name, e);
  }
}

/* ------------------------------------------------------------------ 배경음 */

export function music(track: Track | null, opts: { fade?: number } = {}): void {
  wanted = track && (tracks as readonly string[]).includes(track) ? track : null;
  wantedFade = Math.max(0, opts.fade ?? 0.6);
  applyMusic();
}

function canPlayMusic(): boolean {
  return !!ctx && ctx.state === 'running' && !docHidden() && !vol.muted && vol.master > 0 && vol.music > 0;
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
  if (!current && wanted && canPlayMusic()) {
    const start = now + 0.05;
    const p = new Player(g, wanted, start, wantedFade > 0 ? 0 : 1);
    p.s.hurry = hurry;
    if (wantedFade > 0) p.fade(1, wantedFade, start);
    current = p;
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
} {
  return {
    created: !!ctx,
    state: ctx ? ctx.state : 'none',
    track: current ? current.track : null,
    wanted,
    fading: dying.length,
    hurry,
    voices: ctx ? gate.active(ctx.currentTime) : 0,
    dropped: { ...gate.dropped },
    sampleRate: ctx ? ctx.sampleRate : 0,
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

/**
 * 화질 등급·프레임 상한(설계서 7장 · 7-추가). 보이는 것만 가볍게 — 게임 규칙·수치(대상 수·반경·설득)는 바꾸지 않는다.
 *
 *  등급  high(데스크톱 기본) · normal(폰 기본) · low(저사양 · 자동으로 낮춘 뒤)
 *  설정  화질 auto/high/normal/low(기본 auto) · 프레임 0(자동: 폰·저 30, 그 밖 60)/30/60
 *  auto  시작: 기기(터치 폰·코어 수·메모리·WebGL 최대 텍스처)로 등급. 영업 중 2.5초 평균 프레임 간격이 목표 × 1.35 를 넘거나
 *        프레임 작업 시간이 목표 간격의 85% 를 넘으면 한 단계 낮춤(올리는 건 설정에서만) + 토스트 한 번. 낮춘 등급은 저장(settings.autoTier)
 *  수치  fx.budget.tiers(gdd-data.json) — 없으면 아래 기본값
 */
import { FX } from '../data';
import { S } from '../state';

export type Tier = 'high' | 'normal' | 'low';
export type QualitySetting = 'auto' | Tier;

export interface TierBudget {
  /** 렌더 해상도 상한(기기 배율과 작은 쪽) */
  res: number;
  /** 파티클 · 떠오르는 숫자 · 도장 · 날아가는 코인 동시 개수 */
  particles: number;
  numbers: number;
  stamps: number;
  coins: number;
  /** 쇼크웨이브 필터 동시 개수 */
  waves: number;
  /** 사무실 배경 움직임(별 반짝·구름 흐름·패럴랙스) */
  officeAnim: boolean;
  /** 영업 지도 차·보행자·구름 그림자 수, 물 반짝·꽃잎 */
  cars: number;
  walkers: number;
  cloudShadows: number;
  ambient: boolean;
  /** 계약 연출 파티클 배율(식권·동전) · 흔들림·번쩍 배율 */
  burst: number;
  shake: number;
  /** 그림 래스터 해상도 상한 */
  artRes: number;
}

const DEF: Record<Tier, TierBudget> = {
  high: { res: 2, particles: 600, numbers: 40, stamps: 8, coins: 40, waves: 2, officeAnim: true, cars: 6, walkers: 8, cloudShadows: 2, ambient: true, burst: 1, shake: 1, artRes: 2 },
  normal: { res: 1.5, particles: 250, numbers: 20, stamps: 5, coins: 16, waves: 0, officeAnim: false, cars: 4, walkers: 4, cloudShadows: 1, ambient: true, burst: 0.7, shake: 1, artRes: 2 },
  low: { res: 0.75, particles: 150, numbers: 20, stamps: 5, coins: 12, waves: 0, officeAnim: false, cars: 2, walkers: 0, cloudShadows: 0, ambient: false, burst: 0.5, shake: 0.6, artRes: 1 },
};
const ORDER: Tier[] = ['high', 'normal', 'low'];

function budgetOf(t: Tier): TierBudget {
  const d = (FX.budget as unknown as { tiers?: Partial<Record<Tier, Partial<TierBudget>>> }).tiers?.[t];
  return { ...DEF[t], ...(d || {}) };
}

/**
 * 폰 = 주 입력이 손가락(pointer: coarse) + 짧은 변 < 900(CSS px).
 * 터치 화면 노트북은 maxTouchPoints 가 0 보다 커도 주 입력이 마우스·터치패드라 폰이 아님(예전: 터치만 보고 폰으로 잡아 PC 가 30fps·보통 화질로 떨어졌음)
 */
export function isPhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  let coarse = false;
  try {
    coarse = matchMedia('(pointer: coarse)').matches;
  } catch {
    coarse = false;
  }
  const touch = navigator.maxTouchPoints > 0 && coarse;
  const sw = typeof screen !== 'undefined' ? Math.min(screen.width || 9999, screen.height || 9999) : 9999;
  const vw = Math.min(window.innerWidth || 9999, window.innerHeight || 9999);
  return touch && Math.min(sw, vw) < 900;
}

let maxTex = 16384;
/** WebGL 최대 텍스처 크기(초기화 뒤 한 번) */
export function setMaxTexture(n: number): void {
  if (n > 0) maxTex = n;
}

/** 기기로 본 등급 */
export function deviceTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const hc = nav.hardwareConcurrency || 8;
  const dm = nav.deviceMemory || 8;
  if (hc <= 2 || dm <= 2 || maxTex < 4096) return 'low';
  if (isPhone() || hc <= 4 || dm <= 4) return 'normal';
  return 'high';
}

const lower = (a: Tier, b: Tier): Tier => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

/** 지금 쓰는 등급 */
export function currentTier(): Tier {
  const q = S.settings.quality as QualitySetting;
  if (q === 'high' || q === 'normal' || q === 'low') return q;
  const cap = S.settings.autoTier as Tier | '';
  return cap && ORDER.includes(cap) ? lower(deviceTier(), cap) : deviceTier();
}
export function budget(): TierBudget {
  return budgetOf(currentTier());
}
/** 프레임 상한: 설정 0 이면 폰·저 등급 30, 그 밖 60 */
export function fpsTarget(): number {
  const f = Number(S.settings.fps) || 0;
  if (f === 30 || f === 60) return f;
  return isPhone() || currentTier() === 'low' ? 30 : 60;
}
/** 렌더 해상도 = min(기기 배율, 등급 상한) */
export function renderRes(): number {
  const dpr = window.devicePixelRatio || 1;
  const r = budget().res;
  /* 저 등급 0.75 는 1배 화면(PC) 기준. 고밀도 화면(폰 dpr 2~3)은 0.75 면 대상·글자가 뭉개져 1.0 까지만 내림(설계서 7-추가 화질 기준 "또렷이") */
  const floor = r < 1 && dpr >= 1.5 ? 1 : 0.5;
  return Math.max(floor, Math.min(dpr, r));
}
/** 부팅 때 정한 안티앨리어싱(나중에 바꿀 수 없음): 데스크톱 고화질만 */
export function wantAntialias(): boolean {
  return currentTier() === 'high' && !isPhone();
}

/* ── 자동 낮춤 ── */
type Listener = (t: Tier, auto: boolean) => void;
const listeners: Listener[] = [];
export function onTierChange(fn: Listener): void {
  listeners.push(fn);
}
export function notifyTier(auto = false): void {
  const t = currentTier();
  for (const f of listeners) f(t, auto);
}

let watching = false;
let winT = 0;
let winN = 0;
let winDt = 0;
let winWork = 0;
let coolT = 0;
let strikes = 0;
/** 판정 창(ms): 폰·보통은 창 하나(2.5초)로 저 등급까지(설계서 7-5 "3초 안에"), 고화질은 두 창 연달아(5초, 7-추가 "5초 넘게") */
const WIN_MS = 2500;
/** 자동 화질을 한 단계 낮춤(이미 저면 false). 올리는 건 설정에서만 */
export function lowerTier(): boolean {
  if (S.settings.quality !== 'auto') return false;
  const i = ORDER.indexOf(currentTier());
  if (i < 0 || i >= ORDER.length - 1) return false;
  S.settings.autoTier = ORDER[i + 1];
  notifyTier(true);
  return true;
}

/** 영업 중에만 보기(와이프·지도 굽기 시간은 빼려고 시작 1초 뒤부터) */
export function watchFrames(on: boolean): void {
  watching = on;
  winT = winN = winDt = winWork = 0;
  strikes = 0;
}
/** 루프가 프레임마다 부름 */
export function sampleFrame(dtMs: number, workMs: number, target: number): void {
  if (!watching || S.settings.quality !== 'auto') return;
  if (coolT > 0) {
    coolT -= dtMs;
    return;
  }
  winT += dtMs;
  winN++;
  winDt += Math.min(dtMs, 250);
  winWork += workMs;
  if (winT < WIN_MS) return;
  const gap = 1000 / target;
  const avgDt = winDt / winN;
  const avgWork = winWork / winN;
  winT = winN = winDt = winWork = 0;
  const bad = avgDt > gap * 1.35 || avgWork > gap * 0.85;
  strikes = bad ? strikes + 1 : 0;
  /* 고화질(데스크톱)은 창 두 번 연달아(5초) 넘을 때만(잠깐 다른 일에 CPU 를 뺏긴 것으로 한 번에 떨어지지 않게). 폰·보통은 한 번에 */
  const need = currentTier() === 'high' ? 2 : 1;
  if (strikes >= need && lowerTier()) {
    coolT = 3000;
    strikes = 0;
  }
}

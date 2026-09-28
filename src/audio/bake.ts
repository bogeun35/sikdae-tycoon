/**
 * 소리 굽기(설계서 7장 7) — 합성 그래프를 OfflineAudioContext 에서 한 번 렌더해 AudioBuffer 로 둔다.
 * 실시간 재생은 버퍼 소스 1개 + 게인(+ 패너)만 만든다: 음마다 오실레이터·필터·게인 수십 개를 만들던 것(메인 스레드 · GC)이 사라진다.
 *
 *   배경음  곡마다 8마디 루프(서두름 판은 따로)를 잔향·메아리까지 넣어 굽는다. 루프 끝에서 넘치는 꼬리(잔향·긴 음)는
 *           버퍼 앞쪽에 겹쳐 더해(fold) 루프 이음매가 끊기지 않게 하고, loopEnd = 한 루프 길이로 반복 재생.
 *           음을 만드는 일(노드 예약)은 반 마디씩 나눠 쉬어 가며 해서 긴 작업(50ms↑)을 만들지 않는다. 렌더는 오디오 스레드.
 *   효과음  (이름 · 음 높이(반음 단위) · 티어(2 단위) · 연속 상태) 마다 한 번 굽는다. 음량·좌우·지연은 재생 때.
 *           처음 부르는 변형은 가까운 구운 소리를 재생 속도로 맞춰 틀고(없으면 실시간 합성 한 번) 뒤에서 굽는다.
 *   표본율  32kHz(굽는 쪽). 재생 때 브라우저가 기기 표본율로 맞춘다 — 메모리·굽는 시간 약 1/3 절약.
 */
import { makeEcho, makeNoise, makeReverb, makeX, type Chan, type Graph } from './core';
import { TOTAL, bakeStepDur, bakeSteps, themeGain } from './music';
import type { SfxName, Track } from './names';
import { SFX, type SfxOpts, type SfxState } from './sfx';

export const BAKE_RATE = 32000;

function OAC(): typeof OfflineAudioContext | null {
  const w = window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext };
  return w.OfflineAudioContext ?? w.webkitOfflineAudioContext ?? null;
}
export const canBake = (): boolean => typeof window !== 'undefined' && !!OAC();

/** 굽는 곳: 원음·잔향(0.35)·메아리(0.5) → 출력. 실시간 그래프의 채널과 같은 값 */
function liteGraph(oc: OfflineAudioContext): { g: Graph; ch: Chan } {
  const out = oc.createGain();
  out.connect(oc.destination);
  const ch: Chan = { in: out, verb: makeReverb(oc, out, 0.35), echo: makeEcho(oc, out, 0.5) };
  const g = { ctx: oc, noise: makeNoise(oc), sfx: ch } as unknown as Graph;
  return { g, ch };
}


/* ------------------------------------------------------------------ 배경음 */

export interface BakedTrack {
  buf: AudioBuffer;
  /** 한 루프 길이(초) = loopEnd */
  loopSec: number;
  /** 스텝 길이(초) — 서두름 판으로 바꿀 때 같은 스텝으로 맞추려고 */
  sd: number;
}

/**
 * 곡 하나 굽기(꼬리 2.5초 겹쳐 더하기). 음은 렌더가 그 자리에 올 때 반 마디씩 만든다(suspend → 예약 → resume):
 * 미리 전부 연결해 두면 아직 시작 안 한 노드까지 매 렌더 단위마다 계산해 굽기가 실시간만큼 느려진다(측정: 노드 3,000개 24초 → 20초).
 * 실시간 재생처럼 곧 울릴 음만 그래프에 있게 하면 수십 배 빠르고, 메인 스레드 일도 반 마디씩 나뉜다.
 */
export async function bakeTrack(track: Track, hurry: boolean): Promise<BakedTrack | null> {
  const C = OAC();
  if (!C) return null;
  const sd = bakeStepDur(track, hurry);
  const loopSec = TOTAL * sd;
  const tail = 2.5;
  const n = Math.ceil((loopSec + tail) * BAKE_RATE);
  const oc = new C(2, n, BAKE_RATE);
  const { g, ch } = liteGraph(oc);
  const x = makeX(g, ch, 1, themeGain(track));
  const CH = 8;
  bakeSteps(track, x, hurry, 0, CH, 0);
  for (let k = CH; k < TOTAL; k += CH) {
    const from = k;
    /* 이 창의 첫 음보다 한 스텝 앞에서 멈춰 예약(렌더 단위 128표본에 맞춰 내림되므로 여유) */
    void oc.suspend(Math.max(0, (from - 1) * sd)).then(() => {
      bakeSteps(track, x, hurry, from, Math.min(TOTAL, from + CH), 0);
      void oc.resume();
    });
  }
  const buf = await oc.startRendering();
  const L = Math.round(loopSec * BAKE_RATE);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = L; i < d.length; i++) d[i - L] += d[i];
  }
  return { buf, loopSec, sd };
}

/* ------------------------------------------------------------------ 효과음 */

/** 티어로 소리가 달라지는 이름(티어 5 단위로 묶음) */
const TIERED: ReadonlySet<SfxName> = new Set<SfxName>(['target_appear', 'target_appear_big', 'persuade', 'contract_s', 'contract_m', 'contract_l', 'coin_arrive', 'match_up', 'lunch_tick']);
/**
 * 굽는 변형 묶기(설계서 7장 7 "높이·티어 변형은 5단계로 묶음"): 음 높이는 2반음 격자로 굽고 재생 속도로 정확히 맞춤(±1반음, 길이 ±6%),
 * 티어는 0·5·10·15·20 다섯 단계. 변형 수가 줄어 첫 영업일에 새로 굽는 일이 거의 없다
 */
export const SEMI_STEP = 2;
export const TIER_STEP = 5;
export const tierBucket = (name: SfxName, tier: number): number => (TIERED.has(name) ? Math.floor(Math.min(20, Math.max(0, Number(tier) || 0)) / TIER_STEP) * TIER_STEP : 0);
export const semiBucket = (semis: number): number => SEMI_STEP * Math.round(semis / SEMI_STEP);

export interface SfxVariant {
  key: string;
  name: SfxName;
  /** 굽는 음 높이(반음으로 묶은 값) · 부른 음 높이 */
  p: number;
  pAsked: number;
  semis: number;
  tier: number;
  /** 굽기에 넣을 상태(연속 상승·번갈음을 그대로 재현) */
  st: SfxState;
  /** 재생 때 곱할 음량(설득 피로 등 — 굽기는 1) */
  gain: number;
}

/**
 * 부를 때마다 변형을 정한다. 연속 상태(동전 연속 상승 · 설득 번갈음·피로)는 합성 함수(sfx.ts)와 똑같이 여기서 갱신한다.
 * t = 재생 예정 시각(ctx 시간)
 */
export function sfxVariant(name: SfxName, opts: SfxOpts, st: SfxState, t: number): SfxVariant {
  const pr = Number(opts.pitch);
  const pAsked = pr > 0 ? Math.min(4, Math.max(0.25, pr)) : 1;
  const semis = semiBucket(12 * Math.log2(pAsked));
  const p = Math.pow(2, semis / 12);
  const tier = tierBucket(name, Number(opts.tier) || 0);
  let key = `${name}|${semis}|${tier}`;
  let gain = 1;
  const bst: SfxState = { coinLast: -9, coinStreak: 0, persuadeTimes: [], persuadeFlip: 0 };
  if (name === 'coin_arrive') {
    const external = pr > 0 && pr !== 1;
    st.coinStreak = !external && t - st.coinLast < 0.35 ? (st.coinStreak + 1) % 6 : 0;
    st.coinLast = t;
    key += `|c${st.coinStreak}`;
    /* 굽기: 같은 연속 단계가 나오게(바로 앞 0.1초에 한 번 울린 것처럼) */
    if (st.coinStreak > 0) {
      bst.coinStreak = (st.coinStreak + 5) % 6;
      bst.coinLast = 0.01 - 0.1;
    }
  } else if (name === 'persuade') {
    st.persuadeTimes = st.persuadeTimes.filter((v) => v > t - 2);
    st.persuadeTimes.push(t);
    const n = st.persuadeTimes.length;
    gain = 1 / (1 + 0.05 * Math.max(0, n - 2));
    st.persuadeFlip ^= 1;
    key += `|f${st.persuadeFlip}`;
    /* 굽기: 번갈음만 맞추고 피로는 재생 음량으로 */
    bst.persuadeFlip = st.persuadeFlip ^ 1;
  }
  return { key, name, p, pAsked, semis, tier, st: bst, gain };
}

/**
 * 미리 굽기용 변형(재생 때 sfxVariant 가 만드는 키와 같게). semis = 2반음 격자 값, extra = 동전 연속 단계(c) · 설득 번갈음(f)
 */
export function presetVariant(name: SfxName, semis = 0, tier = 0, extra: { c?: number; f?: number } = {}): SfxVariant {
  const s = semiBucket(semis);
  const tb = tierBucket(name, tier);
  const p = Math.pow(2, s / 12);
  let key = `${name}|${s}|${tb}`;
  const bst: SfxState = { coinLast: -9, coinStreak: 0, persuadeTimes: [], persuadeFlip: 0 };
  if (name === 'coin_arrive') {
    const c = extra.c ?? 0;
    key += `|c${c}`;
    if (c > 0) {
      bst.coinStreak = (c + 5) % 6;
      bst.coinLast = 0.01 - 0.1;
    }
  } else if (name === 'persuade') {
    const f = extra.f ?? 0;
    key += `|f${f}`;
    bst.persuadeFlip = f ^ 1;
  }
  return { key, name, p, pAsked: p, semis: s, tier: tb, st: bst, gain: 1 };
}

const LONG_SFX: ReadonlySet<SfxName> = new Set<SfxName>(['contract_boss', 'ending', 'district_open', 'boss_appear']);
/** 굽는 칸 길이(초): 소리 + 잔향·메아리 꼬리 */
const slotSec = (v: SfxVariant, hint: number): number => (hint > 0 ? Math.min(5, hint + 1.25) : LONG_SFX.has(v.name) ? 5 : 2.6);

/**
 * 효과음 변형 여러 개를 OfflineAudioContext 한 번에 굽기(모노). 변형마다 제 칸(소리 + 꼬리)에 차례로 놓고, 잔향·메아리는 하나를 같이 쓴다 —
 * 변형마다 컨텍스트·컨볼버를 새로 만들던 것(컨볼버 커널 준비가 메인 스레드에서 굽기 비용의 대부분)을 묶음당 한 번으로.
 * 렌더가 끝나면 칸마다 잘라 뒤 무음을 버린다. hint = 소리 길이 어림(앞서 실시간으로 튼 길이). dur = 잔향 꼬리 뺀 소리 길이(동시 발음 계산용)
 */
export async function bakeSfxBatch(jobs: { v: SfxVariant; hint: number }[]): Promise<({ buf: AudioBuffer; dur: number } | null)[]> {
  const C = OAC();
  if (!C || !jobs.length) return jobs.map(() => null);
  const starts: number[] = [];
  const slots: number[] = [];
  let acc = 0.01;
  for (const j of jobs) {
    const s = slotSec(j.v, j.hint);
    starts.push(acc);
    slots.push(s);
    acc += s + 0.05;
  }
  const oc = new C(1, Math.ceil(acc * BAKE_RATE), BAKE_RATE);
  const { g, ch } = liteGraph(oc);
  const ends = jobs.map((j, i) => {
    const fn = SFX[j.v.name];
    if (!fn) return -1;
    try {
      const x = makeX(g, ch, j.v.p, 1, ch.in);
      /* 연속 상태의 시각은 칸 시작 기준으로 옮김(0.01초에 굽던 것과 같은 소리) */
      const st: SfxState = { ...j.v.st, coinLast: j.v.st.coinLast + (starts[i] - 0.01), persuadeTimes: [] };
      return fn(x, starts[i], { tier: j.v.tier, pitch: j.v.p }, st);
    } catch {
      return -1;
    }
  });
  const buf = await oc.startRendering();
  const d = buf.getChannelData(0);
  return jobs.map((_, i) => {
    if (ends[i] < 0) return null;
    const s0 = Math.max(0, Math.floor(starts[i] * BAKE_RATE));
    const e0 = Math.min(d.length, Math.floor((starts[i] + slots[i]) * BAKE_RATE));
    let last = s0;
    for (let k = e0 - 1; k >= s0; k--)
      if (d[k] > 1e-4 || d[k] < -1e-4) {
        last = k;
        break;
      }
    const len = Math.max(1, Math.min(e0 - s0, last - s0 + Math.round(0.01 * BAKE_RATE)));
    const out = new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate: BAKE_RATE });
    out.copyToChannel(d.subarray(s0, s0 + len), 0);
    return { buf: out, dur: Math.max(0.02, ends[i] - starts[i]) };
  });
}

/** 효과음 변형 하나 굽기(묶음 굽기에 하나만). 실패하면 null */
export async function bakeSfx(v: SfxVariant, hint = 0): Promise<{ buf: AudioBuffer; dur: number } | null> {
  return (await bakeSfxBatch([{ v, hint }]))[0];
}

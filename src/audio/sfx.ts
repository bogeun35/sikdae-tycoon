/**
 * 효과음 63개 — 설계서 7-1 표의 합성 방식 그대로(원작 party-sound.js 조각 재사용) + 몇 가지 보강.
 *   각 함수 (x, t, opts, state) → 끝나는 시각(초).
 *
 * opts 의 뜻
 *   pitch  주파수 배율 (1 = 그대로, 2 = 한 옥타브 위, 0.5 = 아래). 모든 소리에 곱해진다.
 *   tier   target_appear·contract_s: 대상 티어 0..20 (음 높이 = 520 + 700 × 티어/20 Hz)
 *          persuade: 설득 진행도 × 20 = (1 − 게이지) × 20 (음 높이 = 400 + 800 × tier/20 Hz)
 *          contract_m·contract_l: 티어 0..20 로 살짝 높낮이
 *          coin_arrive: 액수 크기 0..20 (amountTier() 로 계산). 클수록 아르페지오가 길어짐 (1~4음)
 *                       pitch 를 1 아닌 값으로 주면 자체 연속 상승은 끄고 그 배율만 쓴다
 *          match_up: 매칭 단계 0..6 (단계마다 반음 위)
 *          lunch_tick: 남은 초 (1 이면 마지막 초 1500Hz)
 */
import { bell, brass, clamp, mtof, noise, osc, rnd, vibrato, type X } from './core';
import type { SfxName } from './names';

export interface SfxOpts {
  pitch?: number;
  vol?: number;
  pan?: number;
  tier?: number;
  delay?: number;
}

/** 연속으로 울릴 때 기억해야 하는 값 (실시간 1개, 측정 때마다 새로) */
export interface SfxState {
  coinLast: number;
  coinStreak: number;
  persuadeTimes: number[];
  persuadeFlip: number;
}

export const newSfxState = (): SfxState => ({ coinLast: -9, coinStreak: 0, persuadeTimes: [], persuadeFlip: 0 });

type Fn = (x: X, t: number, o: SfxOpts, st: SfxState) => number;

const tierOf = (o: SfxOpts): number => clamp(Number(o.tier) || 0, 0, 20);

/* ------------------------------------------------------------------ 조각 (원작) */

const click = (x: X, t: number): number => {
  osc(x, { t, f: 1900, f1: 1300, bend: 0.012, vol: 0.14, d: 0.035, a: 0.001 });
  noise(x, { t, type: 'highpass', f: 3000, vol: 0.05, d: 0.012, a: 0.001 });
  return t + 0.05;
};
const tap = (x: X, t: number): number => {
  osc(x, { t, f: 1200 * rnd(0.97, 1.03), f1: 900, bend: 0.03, vol: 0.12, d: 0.05, a: 0.001 });
  return t + 0.07;
};
const pickup = (x: X, t: number): number => {
  noise(x, { t, type: 'bandpass', f: 900, f1: 2600, bend: 0.06, q: 1.2, vol: 0.28, d: 0.07, a: 0.004 });
  osc(x, { t, f: 600, f1: 1100, bend: 0.06, vol: 0.12, d: 0.06, a: 0.002 });
  return t + 0.1;
};
const deal = (x: X, t: number): number => {
  for (let i = 0; i < 5; i++) {
    const tt = t + i * 0.09;
    noise(x, { t: tt, type: 'bandpass', f: 1600 * rnd(0.9, 1.1), f1: 4000, bend: 0.06, q: 0.9, vol: 0.11, d: 0.06, a: 0.005 });
    noise(x, { t: tt + 0.06, type: 'bandpass', f: 2400, q: 1.5, vol: 0.09, d: 0.02, a: 0.001 });
  }
  const seq = [76, 79, 84];
  for (let j = 0; j < 3; j++) bell(x, { t: t + 0.5 + j * 0.07, f: mtof(seq[j]), vol: 0.14, d: j === 2 ? 0.5 : 0.15, partial: 3, pgain: 0.2, verb: 0.25 });
  return t + 1.1;
};
/** 딩동 (두 음 상행) */
const correct = (x: X, t: number, short = false): number => {
  bell(x, { t, f: mtof(84), vol: 0.2, d: short ? 0.1 : 0.18, partial: 3, pgain: 0.2, verb: 0.2 });
  bell(x, { t: t + (short ? 0.08 : 0.11), f: mtof(91), vol: 0.22, d: short ? 0.28 : 0.5, partial: 3, pgain: 0.2, verb: 0.3, echo: short ? 0 : 0.15 });
  return t + (short ? 0.4 : 0.65);
};
const error = (x: X, t: number): number => {
  osc(x, { t, f: 330, type: 'square', vol: 0.12, d: 0.06, a: 0.002, lp: 1500 });
  osc(x, { t: t + 0.09, f: 280, type: 'square', vol: 0.12, d: 0.09, a: 0.002, lp: 1500 });
  return t + 0.2;
};
const tick = (x: X, t: number): number => {
  osc(x, { t, f: 2400, f1: 1600, bend: 0.01, vol: 0.13, d: 0.03, a: 0.001 });
  osc(x, { t, f: 700, vol: 0.06, d: 0.04, a: 0.001, lp: 1500 });
  return t + 0.06;
};
const coin = (x: X, t: number, v = 1): number => {
  bell(x, { t, f: mtof(88), vol: 0.16 * v, d: 0.1, partial: 3, pgain: 0.2 });
  bell(x, { t: t + 0.07, f: mtof(95), vol: 0.18 * v, d: 0.32, partial: 3, pgain: 0.2, verb: 0.2 });
  return t + 0.45;
};
/** 반짝 상행 아르페지오 E5 G5 B5 E6 */
const meld = (x: X, t: number, short = false): number => {
  const seq = [76, 79, 83, 88];
  const gap = short ? 0.045 : 0.06;
  for (let i = 0; i < 4; i++) {
    const L = i === 3;
    bell(x, { t: t + i * gap, f: mtof(seq[i]), vol: 0.17, d: L ? (short ? 0.3 : 0.5) : 0.16, partial: 2.4, pgain: 0.3, verb: 0.25, echo: L ? (short ? 0.1 : 0.25) : 0.06 });
  }
  return t + (short ? 0.5 : 0.75);
};
/** 승리 팡파르. long > 1 이면 마지막 화음이 길어짐 */
const win = (x: X, t: number, long = 1): number => {
  const seq = [72, 76, 79, 84];
  for (let i = 0; i < 4; i++) {
    const L = i === 3;
    bell(x, { t: t + i * 0.09, f: mtof(seq[i]), vol: 0.22, d: L ? 1.15 * long : 0.16, partial: 4, pgain: 0.2, verb: 0.25, echo: L ? 0.25 : 0 });
  }
  const tc = t + 0.27;
  osc(x, { t: tc, f: mtof(88), vol: 0.1, d: 1.05 * long, a: 0.02, verb: 0.3 });
  osc(x, { t: tc, f: mtof(91), vol: 0.09, d: 1.05 * long, a: 0.02, verb: 0.3 });
  osc(x, { t: tc, f: mtof(60), type: 'triangle', vol: 0.15, d: 0.9 * long, a: 0.01, lp: 800 });
  osc(x, { t, f: 150, f1: 55, bend: 0.08, vol: 0.26, d: 0.18 });
  noise(x, { t: tc, type: 'highpass', f: 6000, vol: 0.045, d: 0.45, a: 0.02, verb: 0.3 });
  return tc + 1.0 * long;
};
const boom = (x: X, t: number, v = 1): number => {
  osc(x, { t, f: 300, f1: 40, bend: 0.32, vol: 0.5 * v, d: 0.55, a: 0.005, lp: 700 });
  noise(x, { t, type: 'lowpass', f: 4000, f1: 150, bend: 0.5, q: 0.7, vol: 0.35 * v, d: 0.5 });
  noise(x, { t, type: 'bandpass', f: 2500, q: 0.6, vol: 0.25 * v, d: 0.05 });
  return t + 0.8;
};
const whoosh = (x: X, t: number, f = 600, f1 = 3000, d = 0.18, vol = 0.34, q = 0.9): number => {
  noise(x, { t, type: 'bandpass', f, f1, bend: d * 0.85, q, vol, d, a: 0.01 });
  return t + d + 0.04;
};
/** 뽀글. k 0..1 → 520~1220Hz */
const bubble = (x: X, t: number, k: number, v = 1): number => {
  const f = (520 + clamp(k, 0, 1) * 700) * rnd(0.97, 1.03);
  osc(x, { t, f: f * 0.7, f1: f, bend: 0.04, vol: 0.16 * v, d: 0.07, a: 0.002 });
  osc(x, { t, f: f * 2.5, vol: 0.03 * v, d: 0.02, a: 0.001 });
  return t + 0.1;
};

/* ------------------------------------------------------------------ 조각 (새로) */

/** 도장 탁 (가벼움) */
const stampTak = (x: X, t: number, v = 1): number => {
  noise(x, { t, type: 'bandpass', f: 1200, q: 1.4, vol: 0.13 * v, d: 0.03, a: 0.001 });
  osc(x, { t, f: 520, f1: 260, bend: 0.02, type: 'triangle', vol: 0.08 * v, d: 0.04, a: 0.001, lp: 1400 });
  return t + 0.05;
};
/** 도장 쿵 (무거움) */
const stampThud = (x: X, t: number, v = 1): number => {
  osc(x, { t, f: 180, f1: 60, bend: 0.1, vol: 0.32 * v, d: 0.15, a: 0.002 });
  noise(x, { t, type: 'lowpass', f: 900, vol: 0.15 * v, d: 0.04, a: 0.001 });
  noise(x, { t, type: 'bandpass', f: 2600, q: 1.2, vol: 0.05 * v, d: 0.015, a: 0.001 });
  return t + 0.18;
};
/** 금전등록기 (딸깍 + 서랍 + 종 B6 + 벨 E7) */
const cash = (x: X, t: number, v = 1): number => {
  noise(x, { t, type: 'bandpass', f: 3200, q: 2.5, vol: 0.12 * v, d: 0.012, a: 0.001 });
  osc(x, { t, f: 260, f1: 110, bend: 0.05, type: 'triangle', vol: 0.12 * v, d: 0.06, a: 0.001, lp: 1200 });
  bell(x, { t: t + 0.03, f: mtof(95), vol: 0.13 * v, d: 0.16, partial: 2.76, pgain: 0.3 });
  bell(x, { t: t + 0.1, f: mtof(100), vol: 0.15 * v, d: 0.7, partial: 2.76, pgain: 0.35, verb: 0.25, echo: 0.15 });
  return t + 0.85;
};
/** 폭죽 팡 + 타닥타닥 */
const pop = (x: X, t: number, v = 1): number => {
  noise(x, { t, type: 'lowpass', f: 3800, f1: 350, bend: 0.22, q: 0.6, vol: 0.26 * v, d: 0.22, a: 0.001, verb: 0.35 });
  osc(x, { t, f: 140, f1: 45, bend: 0.1, vol: 0.2 * v, d: 0.14, a: 0.001 });
  for (let i = 0; i < 8; i++) {
    const tt = t + 0.07 + Math.random() * 0.55;
    noise(x, { t: tt, type: 'highpass', f: rnd(3500, 7000), q: 0.7, vol: rnd(0.02, 0.05) * v, d: rnd(0.012, 0.03), a: 0.001, verb: 0.25 });
  }
  return t + 0.75;
};
/** 폭죽 쏘아 올림 (피융) */
const launch = (x: X, t: number, v = 1): number => {
  osc(x, { t, f: 500, f1: 1800, bend: 0.3, vol: 0.03 * v, d: 0.3, a: 0.05 });
  noise(x, { t, type: 'bandpass', f: 1500, f1: 5000, bend: 0.3, q: 2, vol: 0.03 * v, d: 0.3, a: 0.05 });
  return t + 0.32;
};
/** 심벌 (쨍) */
const cymbal = (x: X, t: number, v = 1, len = 1.2): number => {
  noise(x, { t, type: 'highpass', f: 5200, q: 0.5, vol: 0.13 * v, d: len, a: 0.002, verb: 0.3 });
  noise(x, { t, type: 'bandpass', f: 8500, q: 0.9, vol: 0.07 * v, d: len * 0.5, a: 0.001 });
  noise(x, { t, type: 'bandpass', f: 3200, q: 1.2, vol: 0.05 * v, d: 0.12, a: 0.001 });
  for (const f of [3150, 4230, 5410, 6870]) osc(x, { t, f, type: 'square', vol: 0.006 * v, d: len * 0.35, a: 0.001, hp: 2500, fixed: true });
  return t + len;
};
/** 반짝 (고음 종 두 개 + 바람) */
const sparkle = (x: X, t: number, v = 1): number => {
  noise(x, { t, type: 'highpass', f: 7000, vol: 0.03 * v, d: 0.35, a: 0.02, verb: 0.35 });
  bell(x, { t, f: mtof(100), vol: 0.06 * v, d: 0.14, partial: 2.4, pgain: 0.2 });
  bell(x, { t: t + 0.05, f: mtof(107), vol: 0.05 * v, d: 0.2, partial: 2.4, pgain: 0.2, verb: 0.3 });
  return t + 0.4;
};
/** 박수 한 번 (짧은 잡음 세 겹) */
const clap = (x: X, t: number, v = 1): void => {
  for (let k = 0; k < 3; k++) {
    noise(x, { t: t + k * 0.009, type: 'bandpass', f: rnd(1000, 1500), q: 1.1, vol: 0.11 * v, d: k === 2 ? 0.07 : 0.012, a: 0.001, verb: k === 2 ? 0.2 : 0 });
  }
};
/** 전화벨 한 번 (1400/1750Hz 40ms 교차) */
const ring = (x: X, t: number): number => {
  for (let i = 0; i < 8; i++) osc(x, { t: t + i * 0.04, f: i % 2 ? 1750 : 1400, vol: 0.06, d: 0.03, a: 0.002, hold: 0.008 });
  return t + 0.34;
};
/** 짧은 금관 팡파르 G4 C5 E5 → G5 */
const fanfare = (x: X, t: number, v = 1, long = false): number => {
  const seq: [number, number][] = [[67, 0], [72, 0.08], [76, 0.16], [79, 0.26]];
  let end = t;
  seq.forEach(([m, dt], i) => {
    const L = i === 3;
    end = Math.max(end, brass(x, t + dt, mtof(m), 0.065 * v, L ? (long ? 0.8 : 0.4) : 0.06, { hold: L ? (long ? 0.6 : 0.22) : 0.03, verb: 0.2 }));
  });
  const tc = t + 0.26;
  brass(x, tc, mtof(60), 0.035 * v, long ? 0.8 : 0.4, { hold: long ? 0.6 : 0.22, bright: 0.7 });
  brass(x, tc, mtof(64), 0.03 * v, long ? 0.8 : 0.4, { hold: long ? 0.6 : 0.22, bright: 0.7 });
  return end;
};
/** 호루라기 (2200Hz 트레몰로) */
const whistle = (x: X, t: number, d = 0.35): number => {
  const v = osc(x, { t, f: 2200, vol: 0.09, d: 0.08, hold: d, a: 0.01 });
  vibrato(x, v, t, 28, 140);
  noise(x, { t, type: 'bandpass', f: 2300, q: 3, vol: 0.03, d: 0.08, hold: d, a: 0.01 });
  return t + d + 0.1;
};
/** 반짝 두 음 */
const twinkle = (x: X, t: number, a = 95, b = 100, v = 1): number => {
  bell(x, { t, f: mtof(a), vol: 0.09 * v, d: 0.12, partial: 2.4, pgain: 0.25 });
  bell(x, { t: t + 0.07, f: mtof(b), vol: 0.1 * v, d: 0.32, partial: 2.4, pgain: 0.25, verb: 0.3 });
  return t + 0.45;
};
/** 킥 한 번 */
const kick = (x: X, t: number, v = 1): number => {
  osc(x, { t, f: 150, f1: 45, bend: 0.06, vol: 0.34 * v, d: 0.2, a: 0.002 });
  return t + 0.22;
};

const PENTA = [0, 2, 4, 7, 9];
const pentaStep = (i: number): number => PENTA[i % 5] + 12 * Math.floor(i / 5);

/* ------------------------------------------------------------------ 63개 */

export const SFX: Record<SfxName, Fn> = {
  /* UI */
  ui_click: (x, t) => click(x, t),
  ui_tap: (x, t) => tap(x, t),
  ui_open: (x, t) => {
    noise(x, { t, type: 'bandpass', f: 400, f1: 1800, bend: 0.11, q: 1, vol: 0.16, d: 0.12, a: 0.01 });
    bell(x, { t: t + 0.06, f: mtof(79), vol: 0.09, d: 0.16, partial: 3, pgain: 0.2, verb: 0.15 });
    return t + 0.26;
  },
  ui_close: (x, t) => {
    noise(x, { t, type: 'bandpass', f: 1800, f1: 400, bend: 0.09, q: 1, vol: 0.2, d: 0.1, a: 0.008 });
    osc(x, { t: t + 0.02, f: 520, f1: 330, bend: 0.06, vol: 0.05, d: 0.07, a: 0.003 });
    return t + 0.14;
  },
  ui_error: (x, t) => error(x, t),
  ui_toggle: (x, t) => {
    osc(x, { t, f: 800, vol: 0.12, d: 0.02, a: 0.001 });
    osc(x, { t, f: 1600, vol: 0.03, d: 0.01, a: 0.001 });
    return t + 0.04;
  },
  ui_fullscreen: (x, t) => {
    whoosh(x, t, 500, 2500, 0.12, 0.18);
    bell(x, { t: t + 0.08, f: mtof(84), vol: 0.13, d: 0.3, partial: 3, pgain: 0.2, verb: 0.2 });
    return t + 0.45;
  },

  /* 타이틀 */
  title_logo: (x, t) => {
    const seq = [72, 76, 79, 84];
    for (let i = 0; i < 4; i++) {
      const L = i === 3;
      bell(x, { t: t + i * 0.1, f: mtof(seq[i]), vol: 0.18, d: L ? 0.9 : 0.2, partial: 3, pgain: 0.2, verb: 0.3, echo: L ? 0.25 : 0 });
    }
    sparkle(x, t + 0.34, 1.2);
    return t + 1.3;
  },
  title_start: (x, t) => deal(x, t),

  /* 성장 */
  node_buy: (x, t) => correct(x, t),
  node_buy_key: (x, t) => {
    correct(x, t);
    return meld(x, t + 0.24);
  },
  skill_up: (x, t) => {
    correct(x, t, true);
    return coin(x, t + 0.14, 0.8);
  },
  mastery_up: (x, t) => {
    coin(x, t);
    bell(x, { t: t + 0.2, f: mtof(88), vol: 0.14, d: 0.5, partial: 3, pgain: 0.25, verb: 0.25, echo: 0.15 });
    return t + 0.75;
  },
  item_up: (x, t) => {
    coin(x, t, 0.85);
    return meld(x, t + 0.12, true);
  },
  rep_hire: (x, t) => {
    meld(x, t);
    for (let i = 0; i < 8; i++) clap(x, t + 0.22 + i * 0.075 + rnd(-0.012, 0.012), rnd(0.75, 1.05));
    return t + 0.95;
  },
  rep_select: (x, t) => {
    tap(x, t);
    bell(x, { t: t + 0.05, f: mtof(79), vol: 0.13, d: 0.25, partial: 3, pgain: 0.2, verb: 0.2 });
    return t + 0.35;
  },
  district_open: (x, t) => {
    kick(x, t, 1);
    const seq = [72, 79, 84, 88, 91];
    for (let i = 0; i < 5; i++) {
      const L = i === 4;
      bell(x, { t: t + 0.08 + i * 0.09, f: mtof(seq[i]), vol: 0.17, d: L ? 1.1 : 0.2, partial: 3, pgain: 0.22, verb: 0.3, echo: L ? 0.25 : 0 });
    }
    const tc = t + 0.44;
    kick(x, tc, 0.8);
    cymbal(x, tc, 0.9, 1.3);
    osc(x, { t: tc, f: mtof(76), vol: 0.07, d: 1.0, a: 0.03, verb: 0.3 });
    osc(x, { t: tc, f: mtof(79), vol: 0.06, d: 1.0, a: 0.03, verb: 0.3 });
    osc(x, { t: tc, f: mtof(48), type: 'triangle', vol: 0.14, d: 0.9, a: 0.01, lp: 700 });
    return tc + 1.35;
  },
  district_select: (x, t) => pickup(x, t),
  level_up: (x, t) => {
    correct(x, t);
    meld(x, t + 0.3);
    sparkle(x, t + 0.5, 0.8);
    return t + 1.05;
  },

  /* 영업 흐름 */
  lunch_start: (x, t) => {
    whoosh(x, t, 500, 2600, 0.2, 0.22);
    bell(x, { t: t + 0.08, f: mtof(76), vol: 0.18, d: 0.3, partial: 3, pgain: 0.2, verb: 0.3 });
    bell(x, { t: t + 0.36, f: mtof(72), vol: 0.18, d: 0.7, partial: 3, pgain: 0.2, verb: 0.35, echo: 0.2 });
    return t + 1.1;
  },
  lunch_tick: (x, t, o) => {
    const last = Math.round(Number(o.tier) || 0) === 1;
    const f = last ? 1500 : 1000;
    osc(x, { t, f, vol: 0.15, d: 0.03, a: 0.001, hold: 0.004 });
    osc(x, { t, f: f * 2, vol: 0.03, d: 0.015, a: 0.001 });
    osc(x, { t, f: f / 2, type: 'triangle', vol: 0.05, d: 0.04, a: 0.001, lp: 1500 });
    return t + 0.06;
  },
  lunch_end: (x, t) => {
    whistle(x, t, 0.35);
    const w: X = { ...x, v: x.v * 0.6 };
    return win(w, t + 0.45);
  },

  /* 지도 위 대상 */
  target_appear: (x, t, o) => {
    const f1 = (520 + 700 * (tierOf(o) / 20)) * rnd(0.97, 1.03);
    osc(x, { t, f: f1 * 0.43, f1, bend: 0.05, vol: 0.1, d: 0.06, a: 0.002 });
    osc(x, { t, f: f1 * 2, vol: 0.015, d: 0.015, a: 0.001 });
    return t + 0.08;
  },
  target_appear_big: (x, t, o) => {
    osc(x, { t, f: 120, f1: 50, bend: 0.2, vol: 0.34, d: 0.25, a: 0.003, lp: 400 });
    noise(x, { t, type: 'lowpass', f: 600, vol: 0.1, d: 0.08, a: 0.002 });
    const f1 = (520 + 700 * (tierOf(o) / 20)) * rnd(0.97, 1.03);
    osc(x, { t: t + 0.03, f: f1 * 0.45, f1, bend: 0.05, vol: 0.1, d: 0.07, a: 0.002 });
    return t + 0.3;
  },
  boss_appear: (x, t) => {
    boom(x, t);
    const d = 1.2;
    osc(x, { t, f: mtof(36), type: 'sawtooth', vol: 0.13, d: 0.5, hold: d - 0.5, a: 0.08, lp: 800, q: 1.2, verb: 0.2 });
    osc(x, { t, f: mtof(43), type: 'sawtooth', vol: 0.1, d: 0.5, hold: d - 0.5, a: 0.08, lp: 800, q: 1.2, verb: 0.2 });
    osc(x, { t, f: mtof(24), vol: 0.18, d: 0.6, hold: 0.6, a: 0.05 });
    return t + 1.35;
  },
  target_leave: (x, t) => {
    osc(x, { t, f: 600, f1: 300, bend: 0.14, vol: 0.09, d: 0.15, a: 0.004, lp: 2400 });
    return t + 0.18;
  },
  /**
   * 설득 틱 — 연속으로 계속 울리므로 피로하지 않게:
   *   tier = (1 − 게이지) × 20 → 400 + 800 × tier/20 Hz (게이지가 줄수록 높아짐)
   *   사인 + 부드러운 어택(3ms), 음 높이 ±3% 흔들기 + 두 음 번갈아(반음 차),
   *   음량 0.8~1 흔들기, 최근 2초에 많이 울렸을수록 작아짐(최대 약 −5dB), 같은 이름 동시 2개까지(names.ts).
   */
  persuade: (x, t, o, st) => {
    const k = tierOf(o) / 20;
    st.persuadeTimes = st.persuadeTimes.filter((v) => v > t - 2);
    st.persuadeTimes.push(t);
    const n = st.persuadeTimes.length;
    const fatigue = 1 / (1 + 0.05 * Math.max(0, n - 2));
    st.persuadeFlip ^= 1;
    const f = (400 + 800 * k) * rnd(0.97, 1.03) * (st.persuadeFlip ? 1 : 1.0595);
    const vol = 0.12 * fatigue * rnd(0.8, 1);
    osc(x, { t, f, vol, d: 0.025, a: 0.003 });
    osc(x, { t, f: f * 0.5, type: 'triangle', vol: vol * 0.35, d: 0.03, a: 0.003, lp: 1200 });
    return t + 0.05;
  },
  hop: (x, t) => {
    osc(x, { t, f: 300, f1: 900, bend: 0.08, vol: 0.12, d: 0.09, a: 0.003 });
    return t + 0.11;
  },
  flee_honk: (x, t) => {
    for (const dt of [0, 0.12]) {
      osc(x, { t: t + dt, f: 440, type: 'square', vol: 0.05, d: 0.03, hold: 0.05, a: 0.004, lp: 1800 });
      osc(x, { t: t + dt, f: 554, type: 'square', vol: 0.045, d: 0.03, hold: 0.05, a: 0.004, lp: 1800 });
    }
    return t + 0.24;
  },
  bike_dash: (x, t) => {
    const v = osc(x, { t, f: 90, f1: 220, bend: 0.28, type: 'sawtooth', vol: 0.12, d: 0.12, hold: 0.18, a: 0.01, lp: 900, q: 2 });
    vibrato(x, v, t, 32, 18);
    noise(x, { t, type: 'bandpass', f: 300, f1: 900, bend: 0.3, q: 1, vol: 0.08, d: 0.3, a: 0.01 });
    return t + 0.34;
  },

  /* 계약 — 티어가 올라갈수록 화려하게 */
  contract_s: (x, t, o) => {
    const k = tierOf(o) / 20;
    stampTak(x, t, 0.8);
    bubble(x, t + 0.01, k);
    bell(x, { t: t + 0.05, f: mtof(84 + pentaStep(Math.floor(tierOf(o) / 2))), vol: 0.06, d: 0.12, partial: 3, pgain: 0.2 });
    return t + 0.2;
  },
  contract_m: (x, t, o) => {
    const y: X = { ...x, p: x.p * Math.pow(2, (tierOf(o) - 8) / 60) };
    stampTak(x, t);
    return coin(y, t + 0.02);
  },
  contract_l: (x, t, o) => {
    const y: X = { ...x, p: x.p * Math.pow(2, (tierOf(o) - 12) / 72) };
    stampThud(x, t);
    coin(y, t + 0.05);
    const seq = [84, 88, 91];
    for (let i = 0; i < 3; i++) bell(y, { t: t + 0.18 + i * 0.06, f: mtof(seq[i]), vol: 0.13, d: i === 2 ? 0.5 : 0.14, partial: 3, pgain: 0.2, verb: 0.25, echo: i === 2 ? 0.15 : 0 });
    return t + 0.85;
  },
  contract_xl: (x, t) => {
    stampThud(x, t, 1.1);
    cash(x, t + 0.1);
    fanfare(x, t + 0.3, 1);
    cymbal(x, t + 0.56, 0.8, 1.1);
    pop(x, t + 0.62, 0.8);
    pop(x, t + 0.86, 0.7);
    return t + 1.7;
  },
  contract_boss: (x, t) => {
    for (let i = 0; i < 3; i++) stampThud(x, t + i * 0.16, 1.1);
    const tw = t + 0.5;
    win(x, tw, 1.6);
    fanfare({ ...x, v: x.v * 0.8 }, tw + 0.05, 1, true);
    cymbal(x, tw + 0.27, 1, 1.8);
    // 긴 코드 C E G B (C maj7) — 천천히 부풀었다 사라짐
    for (const m of [48, 60, 64, 67, 71]) osc(x, { t: tw + 0.3, f: mtof(m), type: 'triangle', vol: m === 48 ? 0.12 : 0.05, d: 1.4, hold: 0.9, a: 0.25, lp: 1600, verb: 0.35 });
    const pops = [0.5, 0.8, 1.05, 1.35, 1.6, 1.95];
    pops.forEach((dt, i) => {
      launch(x, tw + dt - 0.3, 0.8);
      pop(x, tw + dt, i % 2 ? 0.7 : 0.85);
    });
    return tw + 3.1;
  },
  crit: (x, t) => {
    const seq = [100, 103, 107];
    for (let i = 0; i < 3; i++) bell(x, { t: t + i * 0.03, f: mtof(seq[i]), vol: 0.09, d: i === 2 ? 0.3 : 0.08, partial: 2.4, pgain: 0.2, verb: 0.25 });
    return cash(x, t + 0.1, 0.8);
  },
  stamp: (x, t) => {
    noise(x, { t, type: 'lowpass', f: 900, vol: 0.16, d: 0.04, a: 0.001 });
    osc(x, { t, f: 150, f1: 70, bend: 0.06, vol: 0.28, d: 0.1, a: 0.002 });
    return t + 0.12;
  },
  /**
   * 코인 도착 — 액수(tier 0..20)에 비례해 1~4음 아르페지오, 아주 작게.
   * 0.35초 안에 연달아 오면 음 높이가 5음계로 한 칸씩 오르고 한 옥타브 오르면 처음으로.
   */
  coin_arrive: (x, t, o, st) => {
    const external = Number(o.pitch) > 0 && Number(o.pitch) !== 1; // 부르는 쪽이 음 높이를 올리는 중
    st.coinStreak = !external && t - st.coinLast < 0.35 ? (st.coinStreak + 1) % 6 : 0;
    st.coinLast = t;
    const base = 95 + pentaStep(st.coinStreak);
    const notes = 1 + Math.min(3, Math.floor(tierOf(o) / 5));
    for (let i = 0; i < notes; i++) {
      const L = i === notes - 1;
      bell(x, { t: t + i * 0.035, f: mtof(base + [0, 4, 7, 12][i]), vol: 0.055 + i * 0.006, d: L ? 0.06 + notes * 0.02 : 0.015, partial: 3, pgain: 0.18, verb: L && notes > 2 ? 0.15 : 0 });
    }
    return t + notes * 0.035 + 0.12;
  },
  match_up: (x, t, o) => {
    const s = clamp(Math.round(Number(o.tier) || 0), 0, 12);
    bell(x, { t, f: mtof(79 + s), vol: 0.14, d: 0.12, partial: 3, pgain: 0.2 });
    bell(x, { t: t + 0.08, f: mtof(84 + s), vol: 0.16, d: 0.35, partial: 3, pgain: 0.2, verb: 0.25 });
    return t + 0.5;
  },
  pending_release: (x, t) => {
    meld(x, t);
    const seq = [84, 88, 91, 96, 100, 103];
    for (let i = 0; i < seq.length; i++) {
      const L = i === seq.length - 1;
      bell(x, { t: t + 0.32 + i * 0.075, f: mtof(seq[i]), vol: 0.12, d: L ? 1.0 : 0.25, partial: 3, pgain: 0.2, verb: 0.3, echo: L ? 0.25 : 0.08 });
    }
    return t + 1.9;
  },

  /* 스킬 4종 */
  skill_call: (x, t) => {
    tick(x, t);
    noise(x, { t, type: 'highpass', f: 2500, vol: 0.06, d: 0.08, a: 0.001 });
    osc(x, { t, f: 3000, f1: 400, bend: 0.1, type: 'sawtooth', vol: 0.03, d: 0.1, a: 0.001, lp: 5000 });
    ring(x, t + 0.1);
    return ring(x, t + 0.52) + 0.02;
  },
  skill_promo_set: (x, t) => {
    noise(x, { t, type: 'highpass', f: 3000, q: 0.7, vol: 0.05, d: 0.1, hold: 0.3, a: 0.03 });
    for (let i = 0; i < 6; i++) noise(x, { t: t + 0.03 + Math.random() * 0.34, type: 'highpass', f: rnd(4000, 7000), vol: rnd(0.02, 0.04), d: 0.01, a: 0.001 });
    return t + 0.45;
  },
  skill_promo_boom: (x, t) => {
    boom(x, t);
    for (let i = 0; i < 6; i++) noise(x, { t: t + 0.12 + i * 0.06, type: 'bandpass', f: rnd(1500, 3500), f1: 800, bend: 0.1, q: 0.8, vol: 0.04, d: 0.12, a: 0.01 });
    return t + 0.85;
  },
  skill_rush: (x, t) => {
    whoosh(x, t);
    for (let i = 0; i < 6; i++) {
      const tt = t + 0.12 + i * 0.075;
      noise(x, { t: tt, type: 'bandpass', f: 400 * rnd(0.9, 1.1), q: 1.5, vol: 0.16, d: 0.02, a: 0.001 });
      osc(x, { t: tt, f: 130, f1: 80, bend: 0.03, type: 'triangle', vol: 0.07, d: 0.04, a: 0.001, lp: 600 });
    }
    return t + 0.62;
  },
  skill_qr: (x, t) => {
    osc(x, { t, f: 2000, vol: 0.1, d: 0.02, hold: 0.04, a: 0.002 });
    osc(x, { t: t + 0.07, f: 400, f1: 1600, bend: 0.3, type: 'sawtooth', vol: 0.06, d: 0.1, hold: 0.22, a: 0.01, lp: 2200, q: 2 });
    noise(x, { t: t + 0.07, type: 'bandpass', f: 800, f1: 3200, bend: 0.3, q: 2, vol: 0.05, d: 0.3, a: 0.01, verb: 0.2 });
    return t + 0.45;
  },

  /* 패시브 발동 */
  wom: (x, t) => {
    noise(x, { t, type: 'bandpass', f: 2500, q: 2, vol: 0.05, d: 0.12, hold: 0.18, a: 0.05 });
    bell(x, { t: t + 0.12, f: mtof(91), vol: 0.11, d: 0.35, partial: 3, pgain: 0.2, verb: 0.3 });
    return t + 0.5;
  },
  hot: (x, t) => {
    whoosh(x, t, 300, 2400, 0.6, 0.22);
    const v = osc(x, { t, f: 110, vol: 0.14, d: 0.35, hold: 0.25, a: 0.08, verb: 0.2 });
    vibrato(x, v, t, 6, 4);
    osc(x, { t, f: 220, vol: 0.04, d: 0.3, hold: 0.25, a: 0.08 });
    return t + 0.7;
  },
  ref: (x, t) => {
    meld(x, t, true);
    for (let i = 0; i < 4; i++) {
      const f1 = rnd(800, 1200);
      osc(x, { t: t + 0.3 + i * 0.07, f: f1 * 0.45, f1, bend: 0.05, vol: 0.08, d: 0.06, a: 0.002 });
    }
    return t + 0.62;
  },

  /* 선물 상자·문의·아이템 */
  gift_spawn: (x, t) => {
    bell(x, { t, f: mtof(100), vol: 0.1, d: 0.35, partial: 2.4, pgain: 0.25, verb: 0.3 });
    noise(x, { t, type: 'highpass', f: 7500, vol: 0.02, d: 0.25, a: 0.02, verb: 0.3 });
    return t + 0.45;
  },
  gift_open: (x, t) => {
    osc(x, { t, f: 240, f1: 120, bend: 0.05, type: 'triangle', vol: 0.14, d: 0.07, a: 0.001, lp: 1200 });
    whoosh(x, t + 0.02, 1200, 4000, 0.15, 0.14);
    coin(x, t + 0.1, 0.8);
    coin({ ...x, p: x.p * 1.122 }, t + 0.22, 0.8);
    coin({ ...x, p: x.p * 1.335 }, t + 0.34, 0.9);
    sparkle(x, t + 0.45, 0.8);
    return t + 0.9;
  },
  inquiry_spawn: (x, t) => {
    whoosh(x, t, 1500, 600, 0.3, 0.22, 1.2);
    return t + 0.35;
  },
  inquiry_pick: (x, t) => pickup(x, t),
  item_drop: (x, t) => twinkle(x, t, 95, 100, 1),
  item_get: (x, t) => meld(x, t),
  point_get: (x, t) => {
    bell(x, { t, f: mtof(93), vol: 0.11, d: 0.12, partial: 3, pgain: 0.2, verb: 0.1 });
    return t + 0.16;
  },
  speed_change: (x, t) => {
    click(x, t);
    return click(x, t + 0.07);
  },
  target_new: (x, t) => {
    const seq = [79, 84, 88];
    for (let i = 0; i < 3; i++) bell(x, { t: t + i * 0.09, f: mtof(seq[i]), vol: 0.18, d: i === 2 ? 0.55 : 0.16, partial: 3, pgain: 0.2, verb: 0.25, echo: i === 2 ? 0.2 : 0 });
    sparkle(x, t + 0.24, 1);
    return t + 0.85;
  },
  wipe: (x, t) => whoosh(x, t, 500, 2400, 0.25, 0.3),
  toast: (x, t) => {
    tap(x, t);
    bell(x, { t: t + 0.03, f: mtof(81), vol: 0.1, d: 0.16, partial: 3, pgain: 0.2, verb: 0.15 });
    return t + 0.25;
  },

  /* 정산·엔딩 */
  settle_open: (x, t) => win(x, t),
  settle_count: (x, t) => {
    osc(x, { t, f: 3000 * rnd(0.99, 1.01), vol: 0.055, d: 0.012, a: 0.001 });
    return t + 0.03;
  },
  settle_total: (x, t) => {
    stampThud(x, t, 1.1);
    return coin(x, t + 0.08);
  },
  ending: (x, t) => {
    const end = win(x, t, 2.2);
    cymbal(x, t + 0.27, 0.8, 1.6);
    const pops = [0.4, 0.9, 1.3, 1.8, 2.2, 2.7, 3.1];
    pops.forEach((dt, i) => {
      launch(x, t + dt - 0.3, 0.8);
      pop(x, t + dt, i % 2 ? 0.65 : 0.8);
    });
    return Math.max(end, t + 3.9);
  },
};

/** 이 소리가 눈에 띄게 쓰는 opts (개발 페이지 표시용) */
export const SFX_USES: Partial<Record<SfxName, string>> = {
  persuade: 'tier = (1−게이지)×20',
  target_appear: 'tier 0..20',
  target_appear_big: 'tier 0..20',
  contract_s: 'tier 0..20',
  contract_m: 'tier 0..20',
  contract_l: 'tier 0..20',
  coin_arrive: 'tier = 액수 크기 0..20',
  match_up: 'tier = 매칭 단계 0..6',
  lunch_tick: 'tier = 남은 초',
};

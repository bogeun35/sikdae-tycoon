/**
 * 배경음 5곡 — 절차적 시퀀서. 8마디 × 16스텝 루프, 0.18초 앞서 예약(index.ts 의 타이머).
 *
 *   title   C장조 96bpm   전자피아노 + 벨 패드, 첫 마디 뒤 킥 들어옴
 *   office  F장조 100bpm  보사노바 로파이: 전자피아노(음마다 살짝 어긋난 음정 + 테이프 흔들림), 1·5도 베이스,
 *                         림·킥·셰이커(뒷박 살짝 늦게), 레코드 잡음 (원작 lounge)
 *   lunch   C장조 126bpm  마림바, 근음·5도·옥타브 통통 베이스, 킥 0·8 스냅 4·12 하이햇 (원작 playful)
 *   boss    A단조 132bpm  lunch 변주 + 저음 브라스 + 탐 필
 *   ending  C장조 84bpm   느린 벨·패드
 *
 *   hurry(남은 5초·러시): lunch·boss 가 bpm ×1.12, 하이햇 16분, 박수 강세, 마림바 옥타브 겹침
 */
import { bell, brass, makeX, mtof, noise, osc, rnd, type Chan, type Graph, type X } from './core';
import type { Track } from './names';

export const STEPS = 16;
export const BARS = 8;
export const TOTAL = STEPS * BARS;

export interface PlayState {
  /** 트랙 시작부터 센 스텝 (루프해도 계속 증가) */
  abs: number;
  hurry: boolean;
}

interface Theme {
  bpm: number;
  /** 트랙 음량 (곡끼리 크기 맞춤) */
  gain: number;
  hurryable: boolean;
  step(x: X, bar: number, st: number, t: number, sd: number, s: PlayState): void;
}

/* ------------------------------------------------------------------ 악기 */

function epiano(x: X, t: number, f: number, v: number, lofi?: number): void {
  const cents = lofi == null ? 0 : lofi + rnd(-4, 4);
  osc(x, { t, f, vol: v, d: 0.6, a: 0.004, lp: lofi == null ? 2600 : 1700, cents });
  osc(x, { t, f: f * 2, vol: v * 0.3, d: 0.25, a: 0.002, cents });
  osc(x, { t, f: f * 7, vol: v * (lofi == null ? 0.05 : 0.02), d: 0.03, a: 0.001 });
}
function marimba(x: X, t: number, f: number, v: number): void {
  osc(x, { t, f, vol: v, d: 0.28, a: 0.002 });
  osc(x, { t, f: f * 4, vol: v * 0.18, d: 0.05, a: 0.001 });
  osc(x, { t, f: f * 10, vol: v * 0.05, d: 0.015, a: 0.001 });
}
function musicbox(x: X, t: number, f: number, v: number, d = 0.7): void {
  osc(x, { t, f, vol: v, d, a: 0.002, verb: 0.35 });
  osc(x, { t, f: f * 4, vol: v * 0.22, d: 0.12, a: 0.001 });
  osc(x, { t, f: f * 6.3, vol: v * 0.06, d: 0.04, a: 0.001 });
}
function pad(x: X, t: number, notes: number[], v: number, dur: number): void {
  for (const n of notes) osc(x, { t, f: mtof(n), type: 'triangle', vol: v, d: 0.6, a: 0.12, hold: dur, lp: 900 });
}
function chordHit(x: X, t: number, notes: number[], v: number, lofi?: number): void {
  for (const n of notes) epiano(x, t, mtof(n), v, lofi);
}
function bassNote(x: X, t: number, f: number, v: number, d = 0.22): void {
  osc(x, { t, f, type: 'triangle', vol: v, d, a: 0.004, lp: 500 });
}
function kick(x: X, t: number, v: number): void {
  osc(x, { t, f: 150, f1: 45, bend: 0.05, vol: v, d: 0.12, a: 0.002 });
}
function hat(x: X, t: number, v: number): void {
  noise(x, { t, type: 'highpass', f: 7000, vol: v, d: 0.025, a: 0.001 });
}
function snap(x: X, t: number, v: number): void {
  noise(x, { t, type: 'bandpass', f: 1600, q: 1, vol: v, d: 0.06, a: 0.002 });
}
function clap(x: X, t: number, v: number): void {
  for (let k = 0; k < 3; k++) noise(x, { t: t + k * 0.008, type: 'bandpass', f: 1300, q: 1.1, vol: v, d: k === 2 ? 0.06 : 0.01, a: 0.001 });
}
function rim(x: X, t: number, v: number): void {
  noise(x, { t, type: 'bandpass', f: 2600, q: 3, vol: v, d: 0.03, a: 0.001 });
  osc(x, { t, f: 900, vol: v * 0.5, d: 0.02, a: 0.001 });
}
function shaker(x: X, t: number, v: number): void {
  noise(x, { t, type: 'highpass', f: 6000, vol: v, d: 0.04, a: 0.008 });
}
function tom(x: X, t: number, f: number, v: number): void {
  osc(x, { t, f, f1: f * 0.62, bend: 0.14, vol: v, d: 0.2, a: 0.002 });
  noise(x, { t, type: 'lowpass', f: 1200, vol: v * 0.25, d: 0.05, a: 0.001 });
}
function crash(x: X, t: number, v: number): void {
  noise(x, { t, type: 'highpass', f: 5000, q: 0.5, vol: v, d: 1.1, a: 0.002, verb: 0.2 });
}
/** 레코드 판 잡음 한 톡 */
function crackle(x: X, t: number): void {
  noise(x, { t, type: 'highpass', f: rnd(2000, 5000), q: 0.6, vol: rnd(0.008, 0.028), d: rnd(0.002, 0.006), a: 0.0005 });
}

/* ------------------------------------------------------------------ 곡 */

const THEMES: Record<Track, Theme> = (() => {
  /* title — C장조 96bpm */
  const tRoots = [36, 45, 41, 43, 36, 40, 41, 43];
  const tChords = [[60, 64, 67], [57, 60, 64], [57, 60, 65], [59, 62, 67], [60, 64, 67], [59, 64, 67], [57, 60, 65], [59, 62, 65]];
  const tMel = [
    [76, 0, 79, 0, 84, 0, 79, 0], [76, 0, 72, 0, 76, 0, 0, 0], [77, 0, 81, 0, 84, 0, 81, 0], [79, 0, 74, 0, 71, 0, 74, 0],
    [76, 0, 79, 0, 84, 0, 86, 0], [83, 0, 79, 0, 76, 0, 0, 0], [81, 0, 77, 0, 72, 0, 77, 0], [79, 0, 0, 0, 74, 0, 0, 0],
  ];

  /* office — F장조 보사 로파이 100bpm (원작 lounge) */
  const oRoots = [41, 43, 36, 41, 46, 45, 43, 36];
  const oChords = [[57, 60, 64], [58, 62, 65], [60, 64, 70], [57, 60, 64], [57, 62, 65], [55, 60, 64], [58, 62, 65], [60, 64, 70]];
  const oMel = [
    [69, 0, 72, 0, 76, 0, 0, 0], [74, 0, 0, 72, 0, 70, 0, 0], [76, 0, 0, 74, 0, 72, 0, 0], [69, 0, 0, 0, 0, 0, 72, 74],
    [77, 0, 0, 74, 0, 0, 72, 0], [76, 0, 0, 72, 0, 0, 69, 0], [70, 0, 72, 0, 74, 0, 77, 0], [76, 0, 0, 0, 0, 0, 0, 0],
  ];

  /* lunch — C장조 126bpm (원작 playful) */
  const lRoots = [36, 43, 45, 41, 36, 43, 41, 43];
  const lMel = [
    [72, 74, 76, 0, 79, 0, 76, 0], [74, 0, 79, 0, 74, 0, 71, 0], [76, 0, 79, 81, 0, 79, 76, 0], [77, 0, 81, 0, 77, 0, 74, 0],
    [72, 74, 76, 0, 79, 0, 84, 0], [83, 0, 79, 0, 74, 0, 79, 0], [81, 0, 79, 0, 77, 0, 76, 0], [74, 0, 76, 0, 72, 0, 0, 0],
  ];

  /* boss — A단조 132bpm */
  const bRoots = [45, 41, 43, 40, 45, 41, 38, 40];
  const bMel = [
    [69, 72, 76, 0, 79, 0, 76, 0], [77, 0, 76, 0, 72, 0, 69, 0], [74, 0, 79, 0, 74, 0, 71, 0], [68, 0, 71, 0, 76, 0, 0, 0],
    [69, 72, 76, 0, 81, 0, 79, 0], [77, 0, 81, 0, 77, 0, 72, 0], [74, 0, 77, 0, 81, 0, 77, 0], [76, 0, 74, 0, 71, 0, 68, 0],
  ];

  /* ending — C장조 84bpm */
  const eRoots = [36, 35, 33, 40, 41, 36, 41, 43];
  const eChords = [[60, 64, 67], [59, 62, 67], [57, 60, 64], [55, 59, 64], [57, 60, 65], [55, 60, 64], [57, 60, 65], [55, 59, 62]];
  const eMel = [
    [84, 0, 0, 0, 79, 0, 76, 0], [83, 0, 0, 0, 79, 0, 74, 0], [81, 0, 0, 0, 76, 0, 72, 0], [79, 0, 0, 0, 76, 0, 71, 0],
    [77, 0, 0, 0, 81, 0, 84, 0], [84, 0, 0, 0, 79, 0, 76, 0], [81, 0, 0, 0, 84, 0, 86, 0], [83, 0, 0, 0, 79, 0, 74, 0],
  ];

  return {
    title: {
      bpm: 96, gain: 0.95, hurryable: false,
      step(x, bar, st, t, sd, s) {
        const r = tRoots[bar];
        if (st === 0) pad(x, t, tChords[bar], 0.09, sd * 16 - 0.3);
        if (st % 2 === 0) {
          const m = tMel[bar][st / 2];
          if (m) musicbox(x, t, mtof(m), st % 4 ? 0.3 : 0.38);
        }
        if (st === 0 || st === 10) chordHit(x, t, tChords[bar], 0.1);
        if (st === 0) bassNote(x, t, mtof(r), 0.5, 0.5);
        else if (st === 8) bassNote(x, t, mtof(r + 7), 0.34, 0.35);
        if (s.abs >= STEPS) {
          if (st === 0 || st === 8) kick(x, t, 0.34);
          if (st % 4 === 2) hat(x, t, 0.07);
        }
      },
    },

    office: {
      bpm: 100, gain: 1.2, hurryable: false,
      step(x, bar, st, t, sd, s) {
        const r = oRoots[bar];
        const swing = 0.16 * sd;
        // 테이프 흔들림: 두 마디에 한 번 오르내리는 ±6 cents
        const wow = 6 * Math.sin((s.abs / 32) * Math.PI * 2);
        if (st % 2 === 0) {
          const m = oMel[bar][st / 2];
          if (m) epiano(x, st % 4 === 2 ? t + swing : t, mtof(m), st % 4 ? 0.26 : 0.32, wow);
        }
        if (st === 0 || st === 8) bassNote(x, t, mtof(r), 0.56, 0.32);
        else if (st === 6 || st === 14) bassNote(x, t, mtof(r + 7), 0.38, 0.22);
        if (st === 0 || st === 6 || st === 12) chordHit(x, t, oChords[bar], 0.15, wow);
        if (st === 0 || st === 6 || st === 12) rim(x, t, 0.1);
        if (st === 0 || st === 8) kick(x, t, 0.3);
        if (st % 2 === 0) shaker(x, st % 4 === 2 ? t + swing : t, st % 4 ? 0.08 : 0.045);
        if (Math.random() < 0.2) crackle(x, t + Math.random() * sd);
        if (st === 0) noise(x, { t, type: 'bandpass', f: 4500, q: 0.3, vol: 0.006, d: 0.3, hold: sd * 16 - 0.1, a: 0.1 });
      },
    },

    lunch: {
      bpm: 126, gain: 1, hurryable: true,
      step(x, bar, st, t, _sd, s) {
        const r = lRoots[bar];
        if (st % 2 === 0) {
          const m = lMel[bar][st / 2];
          if (m) {
            marimba(x, t, mtof(m), st % 4 ? 0.4 : 0.5);
            if (s.hurry) marimba(x, t, mtof(m + 12), 0.14);
          }
        }
        if (st === 0 || st === 8) bassNote(x, t, mtof(r), 0.6);
        else if (st === 4 || st === 12) bassNote(x, t, mtof(r + 7), 0.42);
        else if (st === 6 || st === 14) bassNote(x, t, mtof(r + 12), 0.28);
        if (st === 0 || st === 8 || (st === 10 && bar % 2)) kick(x, t, 0.55);
        if (st === 4 || st === 12) {
          snap(x, t, 0.2);
          if (s.hurry) clap(x, t, 0.12);
        }
        if (s.hurry) hat(x, t, st % 4 === 0 ? 0.1 : st % 2 ? 0.14 : 0.2);
        else if (st % 2 === 0) hat(x, t, st % 4 === 0 ? 0.14 : 0.24);
      },
    },

    boss: {
      bpm: 132, gain: 1, hurryable: true,
      step(x, bar, st, t, sd, s) {
        const r = bRoots[bar];
        if (st % 2 === 0) {
          const m = bMel[bar][st / 2];
          if (m) {
            marimba(x, t, mtof(m), st % 4 ? 0.36 : 0.44);
            if (s.hurry) marimba(x, t, mtof(m + 12), 0.12);
          }
        }
        // 저음 브라스: 1박과 2박 반(당김)
        if (st === 0) {
          brass(x, t, mtof(r + 12), 0.05, 0.25, { hold: sd * 4 });
          brass(x, t, mtof(r + 19), 0.035, 0.25, { hold: sd * 4 });
        } else if (st === 6) {
          brass(x, t, mtof(r + 12), 0.04, 0.18, { hold: sd * 2 });
          brass(x, t, mtof(r + 19), 0.028, 0.18, { hold: sd * 2 });
        }
        if (st % 2 === 0) bassNote(x, t, mtof(r + (st % 4 ? 12 : 0)), st % 4 ? 0.3 : 0.5, 0.14);
        const fill = (bar === 3 || bar === 7) && st >= 12;
        if (fill) tom(x, t, [220, 180, 150, 120][st - 12], 0.32);
        else {
          if (st === 0 || st === 8 || st === 10) kick(x, t, 0.55);
          if (st === 4 || st === 12) {
            snap(x, t, 0.22);
            if (s.hurry) clap(x, t, 0.12);
          }
        }
        if (bar === 0 && st === 0 && s.abs >= TOTAL) crash(x, t, 0.05);
        if (s.hurry) hat(x, t, st % 4 === 0 ? 0.1 : st % 2 ? 0.14 : 0.2);
        else if (st % 2 === 0) hat(x, t, st % 4 === 0 ? 0.12 : 0.22);
      },
    },

    ending: {
      bpm: 84, gain: 1, hurryable: false,
      step(x, bar, st, t, sd) {
        const r = eRoots[bar];
        if (st === 0) pad(x, t, eChords[bar], 0.1, sd * 16 - 0.3);
        if (st % 2 === 0) {
          const m = eMel[bar][st / 2];
          if (m) bell(x, { t, f: mtof(m), vol: 0.26, d: 1.1, partial: 3, pgain: 0.18, verb: 0.4, echo: 0.12 });
        }
        // 화음 아르페지오 (8분음표, 작게)
        if (st % 2 === 1) {
          const ch = eChords[bar];
          musicbox(x, t, mtof(ch[((st - 1) / 2) % ch.length] + 12), 0.07, 0.4);
        }
        if (st === 0) bassNote(x, t, mtof(r), 0.45, 0.9);
        if (st === 8) bassNote(x, t, mtof(r + 7), 0.28, 0.6);
        if (st === 0 || st === 8) kick(x, t, 0.16);
        if (st === 4 || st === 12) noise(x, { t, type: 'highpass', f: 5000, vol: 0.035, d: 0.09, a: 0.01 });
      },
    },
  };
})();

export const trackInfo = (t: Track): { bpm: number; hurryable: boolean; loopSec: number } => {
  const th = THEMES[t];
  return { bpm: th.bpm, hurryable: th.hurryable, loopSec: (TOTAL * 60) / th.bpm / 4 };
};

/**
 * 트랙 한 곡을 연주하는 것. 크로스페이드 때는 두 개가 동시에 돈다.
 * 트랙마다 채널(원음·잔향·메아리 게인 3개)을 두고 셋을 같이 움직여 페이드한다.
 */
export class Player {
  readonly track: Track;
  readonly theme: Theme;
  readonly gains: GainNode[];
  readonly x: X;
  readonly s: PlayState = { abs: 0, hurry: false };
  step = 0;
  next: number;
  /** 페이드아웃 끝나는 시각 (그 뒤 정리) */
  dieAt = Infinity;

  constructor(g: Graph, track: Track, startAt: number, level: number) {
    const c = g.ctx;
    this.track = track;
    this.theme = THEMES[track];
    const mk = (dest: AudioNode): GainNode => {
      const n = c.createGain();
      n.gain.value = level;
      n.connect(dest);
      return n;
    };
    const inG = mk(g.musicBus);
    const verbG = mk(g.musicVerbIn);
    const echoG = mk(g.musicEchoIn);
    this.gains = [inG, verbG, echoG];
    const ch: Chan = { in: inG, verb: verbG, echo: echoG };
    this.x = makeX(g, ch, 1, this.theme.gain);
    this.next = startAt;
  }

  stepDur(): number {
    const th = this.theme;
    return 60 / (th.bpm * (this.s.hurry && th.hurryable ? 1.12 : 1)) / 4;
  }

  /** until 까지 스텝을 예약 */
  schedule(until: number): void {
    while (this.next < until) {
      const sd = this.stepDur();
      const s = this.step % TOTAL;
      this.theme.step(this.x, Math.floor(s / STEPS), s % STEPS, this.next, sd, this.s);
      this.step++;
      this.s.abs++;
      this.next += sd;
    }
  }

  /** 타이머가 밀렸으면(탭 전환 등) 지난 스텝은 건너뜀 */
  catchUp(now: number): void {
    if (this.next < now - 0.25) {
      const sd = this.stepDur();
      const miss = Math.ceil((now - this.next) / sd);
      this.step += miss;
      this.s.abs += miss;
      this.next += miss * sd;
    }
  }

  /** at 부터 sec 동안 to 로 (at 의 값은 지금 값에서 출발) */
  fade(to: number, sec: number, at: number): void {
    for (const n of this.gains) {
      const p = n.gain;
      const v = p.value;
      p.cancelScheduledValues(at);
      p.setValueAtTime(v, at);
      if (sec <= 0) p.setValueAtTime(to, at);
      else p.linearRampToValueAtTime(to, at + sec);
    }
  }

  dispose(): void {
    for (const n of this.gains) {
      try {
        n.disconnect();
      } catch {
        /* 이미 끊김 */
      }
    }
  }
}

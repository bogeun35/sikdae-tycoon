/**
 * 측정용 — OfflineAudioContext 로 소리를 파일처럼 렌더해 피크·RMS·길이를 잰다 (개발 페이지 audio-test.html 이 씀).
 * 게임 본체는 이 파일을 import 하지 않는다 (빌드에 안 들어감).
 *
 *   피크        최종 출력(리미터·클리퍼 뒤, master 0.85) 절댓값 최대. 1.0 이상이면 클리핑
 *   리미터 전   같은 소리를 리미터·클리퍼 없이 렌더한 피크 (리미터가 얼마나 일했는지)
 *   RMS         소리가 나는 구간(시작 ~ −50dBFS 아래로 떨어진 곳)의 RMS, dBFS
 *   길이        시작부터 −50dBFS 아래로 떨어질 때까지 (잔향 꼬리 포함)
 */
import { buildGraph, type Graph } from './core';
import { Gate } from './gate';
import { Player, trackInfo } from './music';
import { BGM_GAIN, DEFAULT_VOLUME, type SfxName, type Track } from './names';
import { playSfx } from './play';
import { newSfxState, type SfxOpts } from './sfx';

const SR = 44100;
const T0 = 0.05;
const SILENCE = Math.pow(10, -50 / 20);

export interface Stats {
  peak: number;
  peakDb: number;
  rawPeak: number;
  rmsDb: number;
  duration: number;
  clip: boolean;
  silent: boolean;
}

const db = (v: number): number => (v > 0 ? 20 * Math.log10(v) : -Infinity);

function OAC(): typeof OfflineAudioContext {
  const w = window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext };
  const C = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  if (!C) throw new Error('OfflineAudioContext 없음');
  return C;
}

function analyze(buf: AudioBuffer, t0: number): { peak: number; rms: number; duration: number } {
  const chs: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
  let peak = 0;
  let last = -1;
  const n = buf.length;
  for (const d of chs) {
    for (let i = 0; i < n; i++) {
      const v = d[i] < 0 ? -d[i] : d[i];
      if (v > peak) peak = v;
      if (v > SILENCE && i > last) last = i;
    }
  }
  const i0 = Math.floor(t0 * buf.sampleRate);
  const i1 = Math.max(i0 + 1, last + 1);
  let sq = 0;
  for (const d of chs) for (let i = i0; i < i1; i++) sq += d[i] * d[i];
  const rms = Math.sqrt(sq / ((i1 - i0) * chs.length));
  return { peak, rms, duration: last < 0 ? 0 : Math.max(0, last / buf.sampleRate - t0) };
}

/** 두 번 렌더(리미터 있음·없음)가 같은 소리가 되도록 Math.random 을 잠깐 고정 난수로 바꾼다 */
function seeded<T>(seed: number, fn: () => T): T {
  const orig = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

async function render(seconds: number, limiter: boolean, schedule: (g: Graph) => void): Promise<AudioBuffer> {
  const C = OAC();
  const oc = new C(2, Math.ceil(SR * seconds), SR);
  seeded(12345, () => {
    const g = buildGraph(oc, { master: DEFAULT_VOLUME.master, sfx: DEFAULT_VOLUME.sfx, music: BGM_GAIN * DEFAULT_VOLUME.music, limiter });
    schedule(g);
  });
  return oc.startRendering();
}

async function both(seconds: number, schedule: (g: Graph) => void, t0 = T0): Promise<Stats> {
  const [fin, raw] = await Promise.all([render(seconds, true, schedule), render(seconds, false, schedule)]);
  const a = analyze(fin, t0);
  const r = analyze(raw, t0);
  return {
    peak: a.peak,
    peakDb: db(a.peak),
    rawPeak: r.peak,
    rmsDb: db(a.rms),
    duration: a.duration,
    clip: a.peak >= 0.999,
    silent: a.peak < 0.005,
  };
}

/** 효과음 하나 */
export async function renderSfx(name: SfxName, opts: SfxOpts = {}, seconds = 6): Promise<Stats & { nominal: number }> {
  let nominal = 0;
  const s = await both(seconds, (g) => {
    const end = playSfx(g, new Gate(), newSfxState(), name, opts, T0);
    nominal = end == null ? 0 : end - T0;
  });
  return { ...s, nominal };
}

/** 배경음 한 곡 (기본: 루프 한 바퀴) */
export async function renderMusic(track: Track, opts: { hurry?: boolean; seconds?: number } = {}): Promise<Stats & { loopSec: number; bpm: number }> {
  const info = trackInfo(track);
  const loopSec = info.loopSec / (opts.hurry && info.hurryable ? 1.12 : 1);
  const seconds = opts.seconds ?? loopSec + 1.5;
  const s = await both(seconds, (g) => {
    const p = new Player(g, track, T0, 1);
    p.s.hurry = !!opts.hurry;
    p.schedule(Math.min(seconds - 1.2, T0 + loopSec));
  });
  return { ...s, loopSec, bpm: info.bpm * (opts.hurry && info.hurryable ? 1.12 : 1) };
}

/** 트랙 전환 크로스페이드 (at 초에 a → b, fade 초) */
export async function renderCrossfade(a: Track, b: Track, at = 3, fade = 0.6, seconds = 6): Promise<Stats> {
  return both(seconds, (g) => {
    const p1 = new Player(g, a, T0, 1);
    p1.schedule(at);
    p1.fade(0, fade, at);
    p1.schedule(at + fade);
    const p2 = new Player(g, b, at, 0);
    p2.fade(1, fade, at);
    p2.schedule(seconds - 0.5);
  });
}

/**
 * 후반 폭주 흉내 — 초당 30건 계약 + 코인 + 설득 연타 + 대상 등장 + 큰 계약, 배경음 lunch(hurry) 위에서.
 * 실제와 같은 문지기(간격 제한·동시 14음·이름별 한도)를 거친다.
 */
export async function renderStress(seconds = 5): Promise<Stats & { tried: number; played: number; dropped: Record<string, number> }> {
  let tried = 0;
  let played = 0;
  let dropped: Record<string, number> = {};
  const s = await both(seconds + 1.5, (g) => {
    tried = 0;
    played = 0;
    const gate = new Gate();
    const st = newSfxState();
    const p = new Player(g, 'lunch', T0, 1);
    p.s.hurry = true;
    p.schedule(T0 + seconds);
    const ev: [number, SfxName, SfxOpts][] = [];
    for (let t = 0; t < seconds; t += 1 / 30) {
      ev.push([t, 'contract_s', { tier: Math.floor(Math.random() * 8) }]);
      ev.push([t + 0.3, 'coin_arrive', { tier: Math.random() * 12 }]);
      ev.push([t + 0.01, 'target_appear', { tier: Math.floor(Math.random() * 12) }]);
    }
    for (let t = 0; t < seconds; t += 0.04) ev.push([t, 'persuade', { tier: ((t % 1.2) / 1.2) * 20 }]);
    for (let t = 0.2; t < seconds; t += 0.45) ev.push([t, 'contract_m', { tier: 6 }]);
    for (let t = 0.5; t < seconds; t += 0.7) ev.push([t, 'contract_l', { tier: 12 }]);
    for (const t of [1, 2.2, 3.4]) ev.push([t, 'contract_xl', {}]);
    for (const t of [1.5, 3]) ev.push([t, 'crit', {}]);
    for (const t of [4]) ev.push([t, 'contract_boss', {}]);
    for (let i = 5; i >= 1; i--) ev.push([seconds - i, 'lunch_tick', { tier: i }]);
    ev.sort((a, b) => a[0] - b[0]);
    for (const [t, name, o] of ev) {
      tried++;
      if (playSfx(g, gate, st, name, o, T0 + t) != null) played++;
    }
    dropped = { ...gate.dropped };
  });
  return { ...s, tried, played, dropped };
}

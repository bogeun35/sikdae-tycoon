/**
 * 소리 그래프와 음 하나 만드는 도구.
 *
 *   효과음 버스(sfx) ─┐
 *                     ├─ 컴프레서(−12dB, 4:1) ─ 리미터(−3dB, 20:1) ─ 소프트 클리퍼 ─ master ─ 스피커
 *   배경음 버스(music)┘       (music 버스 = 0.18 × 음악 음량, 그 뒤에 duck 게인)
 *
 *   잔향(흰잡음 0.7초 임펄스)·메아리(0.22초, feedback .3, lowpass 3200)는 버스마다 따로 두어서
 *   음량·크로스페이드가 잔향 꼬리까지 같이 먹도록 했다(원작은 잔향이 버스 음량을 건너뜀).
 *
 * 실시간 AudioContext 와 OfflineAudioContext(측정용) 모두 같은 buildGraph 를 쓴다.
 */

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** 소리가 들어가는 곳: 원음 입력 + 잔향 보내기 + 메아리 보내기 */
export interface Chan {
  in: AudioNode;
  verb: AudioNode;
  echo: AudioNode;
}

export interface Graph {
  ctx: BaseAudioContext;
  /** 사용자 master 음량 (음소거 = 0) */
  master: GainNode;
  comp: DynamicsCompressorNode;
  limiter: DynamicsCompressorNode;
  sfxBus: GainNode;
  musicBus: GainNode;
  duck: GainNode;
  /** 효과음 채널 */
  sfx: Chan;
  /** 배경음 트랙 채널이 잔향·메아리를 보내는 곳 */
  musicVerbIn: GainNode;
  musicEchoIn: GainNode;
  noise: AudioBuffer;
}

export interface GraphOptions {
  master: number;
  sfx: number;
  /** music 버스 게인 (BGM_GAIN × 음악 음량) */
  music: number;
  /** false 면 리미터·클리퍼를 빼고 잰다 (측정용: 리미터 전 피크) */
  limiter?: boolean;
}

function makeNoise(c: BaseAudioContext): AudioBuffer {
  const len = Math.floor(c.sampleRate * 1.5);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function makeImpulse(c: BaseAudioContext, secs: number, curve: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * secs);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, curve) * (i < 220 ? i / 220 : 1);
    }
  }
  return buf;
}

/** |x| < 0.85 는 그대로, 그 위는 tanh 로 눌러 1 을 절대 넘지 않게 */
function softClipCurve(n = 4096): Float32Array<ArrayBuffer> {
  const k = new Float32Array(n);
  const knee = 0.85;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a < knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    k[i] = Math.sign(x) * y;
  }
  return k;
}

function makeReverb(c: BaseAudioContext, out: AudioNode, wet: number): GainNode {
  const input = c.createGain();
  const conv = c.createConvolver();
  conv.buffer = makeImpulse(c, 0.7, 2.2);
  const ret = c.createGain();
  ret.gain.value = wet;
  input.connect(conv);
  conv.connect(ret);
  ret.connect(out);
  return input;
}

function makeEcho(c: BaseAudioContext, out: AudioNode, wet: number): GainNode {
  const input = c.createGain();
  const dly = c.createDelay(1);
  dly.delayTime.value = 0.22;
  const fb = c.createGain();
  fb.gain.value = 0.3;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  const ret = c.createGain();
  ret.gain.value = wet;
  input.connect(dly);
  dly.connect(lp);
  lp.connect(fb);
  fb.connect(dly);
  lp.connect(ret);
  ret.connect(out);
  return input;
}

export function buildGraph(c: BaseAudioContext, o: GraphOptions): Graph {
  const master = c.createGain();
  master.gain.value = o.master;
  master.connect(c.destination);

  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;

  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;

  if (o.limiter === false) {
    comp.connect(master);
  } else {
    const clip = c.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = '2x';
    comp.connect(limiter);
    limiter.connect(clip);
    clip.connect(master);
  }

  const sfxBus = c.createGain();
  sfxBus.gain.value = o.sfx;
  sfxBus.connect(comp);

  const duck = c.createGain();
  duck.gain.value = 1;
  duck.connect(comp);
  const musicBus = c.createGain();
  musicBus.gain.value = o.music;
  musicBus.connect(duck);

  const sfx: Chan = { in: sfxBus, verb: makeReverb(c, sfxBus, 0.35), echo: makeEcho(c, sfxBus, 0.5) };
  const musicVerbIn = makeReverb(c, musicBus, 0.35);
  const musicEchoIn = makeEcho(c, musicBus, 0.5);

  return { ctx: c, master, comp, limiter, sfxBus, musicBus, duck, sfx, musicVerbIn, musicEchoIn, noise: makeNoise(c) };
}

/* ------------------------------------------------------------------ 음 하나 */

/** 소리 한 번을 만드는 동안 쓰는 값 */
export interface X {
  c: BaseAudioContext;
  g: Graph;
  /** 원음이 나가는 곳 (효과음은 sfx 버스 또는 패너, 배경음은 트랙 채널) */
  out: AudioNode;
  ch: Chan;
  /** 음 높이 배율 */
  p: number;
  /** 음량 배율 */
  v: number;
}

export function makeX(g: Graph, ch: Chan, p = 1, v = 1, out?: AudioNode): X {
  return { c: g.ctx, g, out: out ?? ch.in, ch, p, v };
}

interface Env {
  vol: number;
  a?: number;
  hold?: number;
  d: number;
}

function envelope(p: AudioParam, t: number, vol: number, o: Env): number {
  const a = o.a == null ? 0.004 : o.a;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(vol, t + a);
  const ds = t + a + (o.hold || 0);
  if (o.hold) p.setValueAtTime(vol, ds);
  p.exponentialRampToValueAtTime(0.0005, ds + o.d);
  return ds + o.d;
}

function sends(x: X, node: AudioNode, o: { verb?: number; echo?: number }): void {
  if (o.verb) {
    const s = x.c.createGain();
    s.gain.value = o.verb;
    node.connect(s);
    s.connect(x.ch.verb);
  }
  if (o.echo) {
    const s = x.c.createGain();
    s.gain.value = o.echo;
    node.connect(s);
    s.connect(x.ch.echo);
  }
}

const fmax = (c: BaseAudioContext, f: number): number => Math.min(Math.max(f, 1), c.sampleRate * 0.45);

export interface OscOpt extends Env {
  t: number;
  f: number;
  /** 끝 주파수 (지수 벤드) */
  f1?: number;
  bend?: number;
  type?: OscillatorType;
  /** 주파수 배율 (음 높이 흔들기) */
  det?: number;
  cents?: number;
  lp?: number;
  q?: number;
  hp?: number;
  verb?: number;
  echo?: number;
  /** out 대신 여기로 */
  dest?: AudioNode;
  /** 음 높이 배율(x.p)을 무시 */
  fixed?: boolean;
}

export interface Voice {
  osc?: OscillatorNode;
  env?: GainNode;
  end: number;
}

export function osc(x: X, o: OscOpt): Voice {
  const c = x.c;
  const t = o.t;
  const vol = o.vol * x.v;
  const a = o.a == null ? 0.004 : o.a;
  if (vol <= 1e-5) return { end: t + a + (o.hold || 0) + o.d };
  const m = (o.det || 1) * (o.fixed ? 1 : x.p);
  const n = c.createOscillator();
  n.type = o.type || 'sine';
  n.frequency.setValueAtTime(fmax(c, o.f * m), t);
  if (o.f1) n.frequency.exponentialRampToValueAtTime(fmax(c, o.f1 * m), t + (o.bend || 0.08));
  if (o.cents) n.detune.value = o.cents;
  const env = c.createGain();
  const end = envelope(env.gain, t, vol, o);
  n.connect(env);
  let out: AudioNode = env;
  if (o.lp) {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = fmax(c, o.lp);
    lp.Q.value = o.q || 0.7;
    out.connect(lp);
    out = lp;
  }
  if (o.hp) {
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = fmax(c, o.hp);
    out.connect(hp);
    out = hp;
  }
  out.connect(o.dest || x.out);
  sends(x, out, o);
  n.start(t);
  n.stop(end + 0.02);
  return { osc: n, env, end };
}

export interface NoiseOpt extends Env {
  t: number;
  type?: BiquadFilterType;
  f?: number;
  f1?: number;
  bend?: number;
  q?: number;
  verb?: number;
  echo?: number;
  dest?: AudioNode;
  fixed?: boolean;
}

export function noise(x: X, o: NoiseOpt): Voice {
  const c = x.c;
  const t = o.t;
  const vol = o.vol * x.v;
  const a = o.a == null ? 0.004 : o.a;
  if (vol <= 1e-5) return { end: t + a + (o.hold || 0) + o.d };
  const m = o.fixed ? 1 : x.p;
  const src = c.createBufferSource();
  src.buffer = x.g.noise;
  src.loop = true;
  const flt = c.createBiquadFilter();
  flt.type = o.type || 'bandpass';
  flt.frequency.setValueAtTime(fmax(c, (o.f || 1000) * m), t);
  flt.Q.value = o.q == null ? 1 : o.q;
  if (o.f1) flt.frequency.exponentialRampToValueAtTime(fmax(c, o.f1 * m), t + (o.bend || o.d));
  const env = c.createGain();
  const end = envelope(env.gain, t, vol, o);
  src.connect(flt);
  flt.connect(env);
  env.connect(o.dest || x.out);
  sends(x, env, o);
  src.start(t, Math.random() * 1.2);
  src.stop(end + 0.02);
  return { env, end };
}

export interface BellOpt {
  t: number;
  f: number;
  vol: number;
  d: number;
  det?: number;
  partial?: number;
  pgain?: number;
  verb?: number;
  echo?: number;
  dest?: AudioNode;
}

/** 종 = 기본음 + 배음(기본 3배, 음량 25%, 길이 35%) */
export function bell(x: X, o: BellOpt): Voice {
  const v = osc(x, { t: o.t, f: o.f, det: o.det, vol: o.vol, d: o.d, a: 0.003, verb: o.verb, echo: o.echo, dest: o.dest });
  osc(x, { t: o.t, f: o.f * (o.partial || 3), det: o.det, vol: o.vol * (o.pgain || 0.25), d: o.d * 0.35, a: 0.002, dest: o.dest });
  return v;
}

/** 금관 느낌: 톱니 두 개(살짝 어긋남) + 필터가 열렸다 닫힘 */
export function brass(x: X, t: number, f: number, vol: number, d: number, o: { hold?: number; bright?: number; dest?: AudioNode; verb?: number } = {}): number {
  const c = x.c;
  const v = vol * x.v;
  const hold = o.hold ?? d * 0.5;
  const end = t + 0.02 + hold + d;
  if (v <= 1e-5) return end;
  const br = o.bright ?? 1;
  const flt = c.createBiquadFilter();
  flt.type = 'lowpass';
  flt.Q.value = 1.2;
  flt.frequency.setValueAtTime(fmax(c, 380 * br), t);
  flt.frequency.exponentialRampToValueAtTime(fmax(c, 2600 * br), t + 0.05);
  flt.frequency.exponentialRampToValueAtTime(fmax(c, 1100 * br), t + 0.25 + hold * 0.5);
  flt.frequency.exponentialRampToValueAtTime(fmax(c, 500), end);
  const env = c.createGain();
  envelope(env.gain, t, v, { vol: v, a: 0.02, hold, d });
  flt.connect(env);
  env.connect(o.dest || x.out);
  sends(x, env, { verb: o.verb });
  for (const det of [1, 1.006]) {
    const n = c.createOscillator();
    n.type = 'sawtooth';
    n.frequency.setValueAtTime(fmax(c, f * x.p * det), t);
    n.connect(flt);
    n.start(t);
    n.stop(end + 0.02);
  }
  return end;
}

/** 떨림(음량): 반환한 노드로 보내면 rate Hz 로 흔들린다 */
export function tremolo(x: X, t: number, end: number, rate: number, base: number, depth: number, dest?: AudioNode): GainNode {
  const c = x.c;
  const tr = c.createGain();
  tr.gain.value = base;
  const lfo = c.createOscillator();
  lfo.frequency.value = rate;
  const lg = c.createGain();
  lg.gain.value = depth;
  lfo.connect(lg);
  lg.connect(tr.gain);
  lfo.start(t);
  lfo.stop(end + 0.05);
  tr.connect(dest || x.out);
  return tr;
}

/** 주파수 떨림: osc 의 frequency 에 LFO 를 건다 */
export function vibrato(x: X, v: Voice, t: number, rate: number, depthHz: number): void {
  if (!v.osc) return;
  const c = x.c;
  const lfo = c.createOscillator();
  lfo.frequency.value = rate;
  const lg = c.createGain();
  lg.gain.value = depthHz * x.p;
  lfo.connect(lg);
  lg.connect(v.osc.frequency);
  lfo.start(t);
  lfo.stop(v.end + 0.03);
}

/**
 * fxTop 캔버스 연출(패널·모달 위, 입력 없음): HUD 로 날아가는 코인, 큰 계약 배너, 레벨업·아이템·영입·새 상권 컷,
 * 색종이·폭죽, 화면 전환 와이프(식권 티켓 모양 구멍).
 * 좌표 = fxTop 논리 좌표(FXL.root, world 와 같은 배율). 화면 좌표가 필요한 것은 FXL.screen.
 */
import { Container, Graphics, NineSliceSprite, Sprite, Text, type Texture } from 'pixi.js';
import gsap from 'gsap';
import { FONT_STACK } from '../../fonts';
import { FXL, markFx, view } from '../core/stage';
import { T } from '../core/tex';
import { FX } from '../data';
import { sfx } from '../deps';
import { Particles } from './particles';

export type HudId = 'hud.gmv' | 'hud.revenue' | 'hud.point' | 'hud.level' | 'hud.sales' | 'hud.tech' | 'hud.net' | 'hud.pending';
let anchorFn: (id: HudId) => { x: number; y: number } | null = () => null;
let arriveFn: (id: HudId) => void = () => {};
export function setHudResolver(fn: typeof anchorFn, onArrive: typeof arriveFn): void {
  anchorFn = fn;
  arriveFn = onArrive;
}
export function hudAnchor(id: HudId): { x: number; y: number } | null {
  return anchorFn(id);
}

const conf = new Particles(50);
const sparks = new Particles(160);
const flyLayer = new Container();
const cutLayer = new Container();
const bannerLayer = new Container();
let inited = false;
let reduceMotion = false;
export function setReduceMotion(v: boolean): void {
  reduceMotion = v;
}

export function initTop(): void {
  if (inited) return;
  inited = true;
  FXL.root.addChild(cutLayer, bannerLayer, sparks.view, flyLayer, conf.view);
}

/* ── HUD 로 날아가는 코인 ── */
interface Fly { sp: Sprite; x0: number; y0: number; cx: number; cy: number; t: number; dur: number; id: HudId; s0: number; delay: number; x1: number; y1: number }
const flies: Fly[] = [];
const flyPool: Sprite[] = [];
const MAX_FLY: number = FX.coinFly.maxInFlight;
let arriveCombo = 0;
let arriveAt = 0;
export function flyCoin(key: string, from: { x: number; y: number }, to: HudId, delay = 0, scale = 1): boolean {
  if (flies.length >= MAX_FLY) return false;
  const end = hudAnchor(to);
  if (!end) return false;
  const sp = flyPool.pop() || new Sprite();
  sp.texture = T(key);
  sp.anchor.set(0.5);
  sp.visible = delay <= 0;
  sp.alpha = 1;
  flyLayer.addChild(sp);
  const dx = end.x - from.x;
  const dy = end.y - from.y;
  const dist = Math.hypot(dx, dy);
  const cx = from.x + dx * 0.5 + (Math.random() - 0.5) * dist * 0.25;
  const cy = Math.min(from.y, end.y) - dist * FX.coinFly.arcUp;
  const dur = FX.coinFly.dur[0] + Math.random() * (FX.coinFly.dur[1] - FX.coinFly.dur[0]);
  sp.scale.set(scale);
  sp.position.set(from.x, from.y);
  flies.push({ sp, x0: from.x, y0: from.y, cx, cy, t: 0, dur, id: to, s0: scale, delay, x1: end.x, y1: end.y });
  markFx();
  return true;
}
function updateFlies(dt: number): void {
  for (let i = flies.length - 1; i >= 0; i--) {
    const f = flies[i];
    if (f.delay > 0) {
      f.delay -= dt;
      if (f.delay > 0) continue;
      f.sp.visible = true;
    }
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    const e = k * k * (3 - 2 * k) * 0.6 + k * 0.4;
    const a = 1 - e;
    f.sp.x = a * a * f.x0 + 2 * a * e * f.cx + e * e * f.x1;
    f.sp.y = a * a * f.y0 + 2 * a * e * f.cy + e * e * f.y1;
    f.sp.scale.set(f.s0 * (1 + (FX.coinFly.endScale - 1) * e) * (1 + Math.sin(k * Math.PI) * 0.25));
    f.sp.rotation += dt * 6;
    if (k >= 1) {
      f.sp.visible = false;
      flyLayer.removeChild(f.sp);
      flyPool.push(f.sp);
      flies.splice(i, 1);
      arriveFn(f.id);
      const now = performance.now();
      arriveCombo = now - arriveAt < 400 ? Math.min(arriveCombo + 1, 12) : 0;
      arriveAt = now;
      sfx('coin_arrive', { pitch: 1 + arriveCombo * 0.04 });
      sparks.burst(T('fx.spark'), f.x1, f.y1, 2, { spMin: 60, spMax: 160, life: 0.35, s0: 0.5, s1: 0.1, up: 0, blend: 'add' });
    }
  }
}
export function flyingCount(): number {
  return flies.length;
}
/** DOM 카드 구매 반짝(화면 논리 좌표) */
export function sparkleAt(p: { x: number; y: number } | null, n = 10, star = false): void {
  if (!p) return;
  sparks.burst(T(star ? 'fx.star' : 'fx.spark'), p.x, p.y, n, { spMin: 120, spMax: 360, life: 0.6, g: star ? 600 : 0, s0: 0.8, s1: 0.1, up: star ? 180 : 0, blend: star ? 'normal' : 'add' });
  const ring = new Sprite(T('fx.ring'));
  ring.anchor.set(0.5);
  ring.position.set(p.x, p.y);
  ring.tint = 0xffd36b;
  ring.scale.set(0.1);
  ring.blendMode = 'add';
  cutLayer.addChild(ring);
  gsap.to(ring.scale, { x: 0.9, y: 0.9, duration: 0.45, ease: 'expo.out' });
  gsap.to(ring, { alpha: 0, duration: 0.45, onComplete: () => ring.destroy() });
  markFx();
}

/* ── 색종이·폭죽 ── */
let confCool = 0;
const CONF_KEYS = ['fx.confetti0', 'fx.confetti1', 'fx.confetti2', 'fx.confetti3', 'fx.confetti4', 'fx.confetti5'];
export function confetti(n: number, force = false): void {
  if (!force && confCool > 0) return;
  confCool = FX.budget.confettiCooldown;
  const W = view.LW;
  for (let i = 0; i < n; i++) {
    const life = 1.8 + Math.random() * 1.5;
    conf.emit(T(CONF_KEYS[i % 6]), {
      x: Math.random() * W, y: -30 - Math.random() * 120, vx: (Math.random() - 0.5) * 120, vy: (view.LH + 150) / life, life,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12.5, s0: 1.2 + Math.random() * 0.6, a0: 1, a1: 0.9, wobble: 90, spin3d: true,
    });
  }
  markFx();
}
const FW_COLORS = [0xff7b5e, 0xffd36b, 0x8fe0c0, 0x8fd3ff, 0xb79cf0, 0xff8fab];
export function fireworks(n: number, around?: { x: number; y: number }): void {
  for (let i = 0; i < n; i++) {
    const x = around ? around.x + (Math.random() - 0.5) * 600 : view.LW * (0.15 + Math.random() * 0.7);
    const y = around ? around.y - 80 - Math.random() * 260 : view.LH * (0.12 + Math.random() * 0.35);
    const col = FW_COLORS[(Math.random() * FW_COLORS.length) | 0];
    const d = i * 0.18 + Math.random() * 0.1;
    const sp = new Sprite(T('fx.firework'));
    sp.anchor.set(0.5);
    sp.tint = col;
    sp.blendMode = 'add';
    sp.position.set(x, y);
    sp.scale.set(0.15);
    sp.alpha = 0;
    cutLayer.addChild(sp);
    gsap.to(sp, { alpha: 1, duration: 0.05, delay: d });
    gsap.to(sp.scale, { x: 1.4, y: 1.4, duration: 0.7, delay: d, ease: 'expo.out' });
    gsap.to(sp, { alpha: 0, duration: 0.5, delay: d + 0.35, onComplete: () => sp.destroy() });
    gsap.delayedCall(d, () => {
      sparks.burst(T('fx.spark'), x, y, 12, { spMin: 180, spMax: 420, life: 0.9, g: 260, s0: 0.9, s1: 0.2, tint: col, blend: 'add', up: 0, drag: 1.5 });
      markFx();
    });
  }
  markFx();
}

/* ── 배너(대형 계약·전국 계약·첫 결제 연결!·새 거래처!) ── */
/** 보스 게이지가 떠 있을 때 배너를 조금 아래로(화면 높이 비율) */
let bannerShift = 0;
export function setBannerShift(v: number): void {
  bannerShift = v;
}
interface BannerReq { label: string; sub?: string; sub2?: string; count: number; hold?: number }
const queue: BannerReq[] = [];
/** 영업 시작 알약 등으로 잠깐 쉬는 시간(초) */
let bannerHold = 0;
/** 화면에 떠 있는 배너는 늘 한 장. age = 보인 시간(초), leaving = 다음 배너에 자리를 비키는 중 */
let curBanner: { base: string; count: number; txt: Text; c: Container; out: gsap.core.Tween; y0: number; age: number; leaving: boolean; minShow: number } | null = null;
/** 배너가 사라지는 트윈(합쳐지면 다시 걸어 끝까지 보이게) */
function bannerOut(c: Container, y0: number, delay: number, dur = 0.35): gsap.core.Tween {
  return gsap.to(c, { alpha: 0, y: y0 - 40, duration: dur, delay, ease: 'power2.in', onComplete: () => { gsap.killTweensOf(c.scale); c.destroy({ children: true }); } });
}
const bannerTitle = (label: string, n: number) => (n > 1 ? `${label} ×${n}` : label);
export function banner(label: string, sub?: string, sub2?: string, now = false): void {
  if (now) {
    /* 절정(보스 계약): 줄 선 배너는 버리고, 떠 있는 배너는 곧바로 치운 뒤 이 배너를 바로 띄움 */
    queue.length = 0;
    bannerHold = 0;
    const c0 = curBanner;
    if (c0 && !c0.c.destroyed && !c0.leaving) {
      c0.leaving = true;
      c0.out.kill();
      c0.out = bannerOut(c0.c, c0.y0, 0, 0.15);
    }
    /* 절정 배너는 2.4초 동안 다음 배너에 자리를 내주지 않음 */
    queue.push({ label, sub, sub2, count: 1, hold: 2.4 });
    return;
  }
  /* 떠 있는 배너와 이름이 같으면 새로 띄우지 않고 ×N 으로 합침(사라지는 중이어도 되살림). 이미 destroy 된 배너에는 트윈을 걸지 않음 */
  const cb = curBanner;
  if (cb && cb.base === label && !cb.c.destroyed && !(cb.leaving && queue.length > 0)) {
    cb.count++;
    cb.txt.text = bannerTitle(label, cb.count);
    gsap.fromTo(cb.c.scale, { x: 1.12, y: 1.12 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
    if (queue.length === 0) {
      /* 기다리는 배너가 없으면 되살려서 적어도 0.9초 더 보이게. 기다리는 배너가 있으면 숫자만 올리고 제때 비킴 */
      cb.out.kill();
      gsap.killTweensOf(cb.c);
      cb.leaving = false;
      cb.c.alpha = 1;
      cb.c.y = cb.y0;
      cb.out = bannerOut(cb.c, cb.y0, 0.9);
        cb.age = Math.min(cb.age, cb.minShow - 0.9);
    }
    return;
  }
  /* 줄 끝의 배너와 이름이 같으면 줄에서 합침(뜰 때 ×N) */
  const last = queue[queue.length - 1];
  if (last && last.label === label) {
    last.count++;
    last.sub = sub;
    last.sub2 = sub2;
    return;
  }
  if (queue.length > 4) queue.shift();
  queue.push({ label, sub, sub2, count: 1 });
}
/** 잠깐 배너를 쉬게 함(영업 시작 알약과 겹치지 않게). 쌓인 배너는 그 뒤 차례로 */
export function holdBanners(sec: number): void {
  bannerHold = Math.max(bannerHold, sec);
}
function showBanner(b: BannerReq): void {
  const c = new Container();
  const land = view.orient === 'land';
  const w = land ? 760 : 900;
  const ns = new NineSliceSprite({ texture: T('fx.banner'), leftWidth: 90, topHeight: 40, rightWidth: 90, bottomHeight: 40 });
  ns.width = w;
  ns.height = 150;
  ns.pivot.set(w / 2, 75);
  const txt = new Text({ text: bannerTitle(b.label, b.count), style: { fontFamily: FONT_STACK, fontSize: 64, fill: '#ffffff', stroke: { color: '#8a5a1a', width: 10, join: 'round' }, dropShadow: { color: '#5c3a1a', alpha: 0.5, distance: 5, blur: 0, angle: Math.PI / 2 } } });
  txt.anchor.set(0.5, 0.55);
  c.addChild(ns, txt);
  if (b.sub) {
    const s = new Text({ text: b.sub, style: { fontFamily: FONT_STACK, fontSize: 40, fill: '#fff8ec', stroke: { color: '#4a2f12', width: 8, join: 'round' } } });
    s.anchor.set(0.5, 0);
    s.y = 86;
    c.addChild(s);
  }
  if (b.sub2) {
    const s2 = new Text({ text: b.sub2, style: { fontFamily: FONT_STACK, fontSize: 56, fill: '#ffe066', stroke: { color: '#4a2f12', width: 11, join: 'round' } } });
    s2.anchor.set(0.5, 0);
    s2.y = 132;
    c.addChild(s2);
  }
  const glow = new Sprite(T('fx.glow'));
  glow.anchor.set(0.5);
  glow.blendMode = 'add';
  glow.width = w * 1.3;
  glow.height = 300;
  glow.alpha = 0.5;
  c.addChildAt(glow, 0);
  c.position.set(view.LW / 2, view.LH * ((land ? 0.26 : 0.22) + bannerShift));
  bannerLayer.addChild(c);
  c.scale.set(0.2, 0.2);
  c.alpha = 0;
  gsap.to(c, { alpha: 1, duration: 0.12 });
  gsap.to(c.scale, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.6)' });
  const minShow = Math.max(FX.bannerQueue.gapSec, b.hold || 0);
  const out = bannerOut(c, c.y, Math.max(1.35, minShow - 0.2));
  sparks.burst(T('fx.star'), c.x, c.y, 14, { spMin: 200, spMax: 520, life: 0.9, g: 500, s0: 0.7, s1: 0.2, up: 120 });
  curBanner = { base: b.label, count: b.count, txt, c, out, y0: c.y, age: 0, leaving: false, minShow };
  markFx();
}
/**
 * 배너는 한 번에 한 장. 다음 배너가 줄 서 있으면 지금 배너를 gapSec(1.2초) 보인 뒤 빠르게 치우고,
 * 완전히 사라진 다음에 띄운다(두 장이 같은 자리에 겹치지 않게). 줄이 비어 있으면 원래대로 1.35초 + 0.35초.
 */
function updateBanners(dt: number): void {
  if (bannerHold > 0) bannerHold -= dt;
  const cb = curBanner;
  if (cb) {
    if (cb.c.destroyed) curBanner = null;
    else {
      cb.age += dt;
      if (!cb.leaving && queue.length > 0 && cb.age >= cb.minShow) {
        cb.leaving = true;
        cb.out.kill();
        cb.out = bannerOut(cb.c, cb.y0, 0, 0.2);
      }
      return;
    }
  }
  if (bannerHold > 0) return;
  const n = queue.shift();
  if (n) showBanner(n);
}

/* ── 가운데 컷(아이템·대표 영입·레벨업) ── */
export function rayCut(texKey: string, name: string, opts: { sub?: string; sec?: number; size?: number; compact?: boolean; x?: number; y?: number } = {}): void {
  const c = new Container();
  /* compact = 영업 중(설계 6-1: 그림 160 · 이름 36). 거래액 숫자를 덜 가리게 햇살·글로우도 작고 옅게 */
  const cp = !!opts.compact;
  const rays = new Sprite(T('fx.rays'));
  rays.anchor.set(0.5);
  rays.width = rays.height = cp ? 440 : 720;
  rays.alpha = cp ? 0.55 : 0.9;
  const glow = new Sprite(T('fx.glow'));
  glow.anchor.set(0.5);
  glow.width = glow.height = cp ? 320 : 520;
  glow.blendMode = 'add';
  glow.alpha = cp ? 0.4 : 0.7;
  const ic = new Sprite(T(texKey));
  ic.anchor.set(0.5);
  const sz = opts.size || 220;
  const r = sz / Math.max(ic.texture.width, ic.texture.height);
  ic.scale.set(r);
  const nm = new Text({ text: name, style: { fontFamily: FONT_STACK, fontSize: cp ? 44 : 60, fill: '#ffffff', stroke: { color: '#5c3a1a', width: 9, join: 'round' }, dropShadow: { color: '#5c3a1a', distance: 4, blur: 0, alpha: 0.6, angle: Math.PI / 2 } } });
  nm.anchor.set(0.5, 0);
  nm.y = sz * 0.62;
  c.addChild(rays, glow, ic, nm);
  if (opts.sub) {
    const s = new Text({ text: opts.sub, style: { fontFamily: FONT_STACK, fontSize: cp ? 30 : 38, fill: '#fff4c4', stroke: { color: '#5c3a1a', width: 7, join: 'round' } } });
    s.anchor.set(0.5, 0);
    s.y = sz * 0.62 + (cp ? 56 : 76);
    c.addChild(s);
  }
  c.position.set(view.LW * (opts.x ?? 0.5), view.LH * (opts.y ?? 0.42));
  cutLayer.addChild(c);
  c.scale.set(0);
  const sec = opts.sec || 1.8;
  gsap.to(c.scale, { x: 1, y: 1, duration: 0.5, ease: 'back.out(2.2)' });
  gsap.to(rays, { rotation: Math.PI * 2 * (sec / 8), duration: sec, ease: 'none' });
  gsap.to(ic, { rotation: 0.12, duration: 0.3, yoyo: true, repeat: 5, ease: 'sine.inOut' });
  gsap.to(c, { alpha: 0, duration: 0.3, delay: sec - 0.3, onComplete: () => c.destroy({ children: true }) });
  sparks.burst(T('fx.spark'), c.x, c.y, 18, { spMin: 180, spMax: 480, life: 0.9, s0: 1, s1: 0.2, up: 0, blend: 'add' });
  markFx();
}

/** 떠 있는 LEVEL UP 글자(연달아 오르면 새로 띄우지 않고 숫자만 올림) */
let lvCur: { t: Text; tl: gsap.core.Timeline } | null = null;
/** 절정(보스 계약) 동안은 LEVEL UP 글자를 미뤘다가 끝나면 띄움(전국 계약 배너·도장과 한 화면에 겹치지 않게) */
let climaxLeft = 0;
let lvPending = 0;
export function climax(sec: number): void {
  climaxLeft = Math.max(climaxLeft, sec);
  if (lvCur && !lvCur.t.destroyed) lvCur.tl.progress(1);
}
function updateClimax(dt: number): void {
  if (climaxLeft <= 0) return;
  climaxLeft -= dt;
  if (climaxLeft <= 0 && lvPending) {
    const lv = lvPending;
    lvPending = 0;
    levelUpCut(lv);
  }
}
export function levelUpCut(lv: number): void {
  if (climaxLeft > 0) {
    lvPending = Math.max(lvPending, lv);
    return;
  }
  const land = view.orient === 'land';
  const now = performance.now();
  if (lvCur && !lvCur.t.destroyed) {
    /* 연달아 오르면 떠 있는 글자의 숫자만 바꾸고 처음부터 다시 튀김 */
    lvCur.t.text = `LEVEL UP! ${lv}`;
    lvCur.tl.restart();
    return;
  }
  void now;
  const t = new Text({
    text: `LEVEL UP! ${lv}`,
    style: { fontFamily: FONT_STACK, fontSize: land ? 96 : 92, fill: '#ffd36b', stroke: { color: '#8a5a1a', width: 10, join: 'round' }, dropShadow: { color: '#5c3a1a', distance: 7, blur: 0, alpha: 0.8, angle: Math.PI / 2 } },
  });
  t.anchor.set(0.5);
  /* 배너(화면 위 0.26)와 겹치지 않게 조금 아래. 보스 게이지가 떠서 배너가 내려와 있으면 더 아래 */
  const y0 = view.LH * ((land ? 0.56 : 0.5) + (bannerShift > 0 ? 0.08 : 0));
  t.position.set(view.LW / 2, y0);
  t.scale.set(0.5);
  t.alpha = 0;
  cutLayer.addChild(t);
  const ring = new Sprite(T('fx.ring'));
  ring.anchor.set(0.5);
  ring.position.set(t.x, t.y);
  ring.tint = 0xffd36b;
  ring.scale.set(0.2);
  cutLayer.addChild(ring);
  gsap.to(ring.scale, { x: 3.2, y: 3.2, duration: 0.7, ease: 'expo.out' });
  gsap.to(ring, { alpha: 0, duration: 0.7, onComplete: () => ring.destroy() });
  const tl = gsap.timeline({
    onComplete: () => {
      if (lvCur && lvCur.t === t) lvCur = null;
      t.destroy();
    },
  });
  lvCur = { t, tl };
  tl.fromTo(t, { alpha: 0, y: y0 }, { alpha: 1, duration: 0.12 }, 0)
    .fromTo(t.scale, { x: 0.5, y: 0.5 }, { x: 1.2, y: 1.2, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, 0)
    .to(t.scale, { x: 1, y: 1, duration: 0.2 }, 0.3)
    .to(t, { y: y0 - 60, duration: 1.3, ease: 'power1.out' }, 0.3)
    .to(t, { alpha: 0, duration: 0.45 }, 1.15);
  confetti(FX.levelUp.confetti, true);
  sparks.burst(T('fx.star'), t.x, t.y, 12, { spMin: 200, spMax: 460, life: 1, g: 520, s0: 0.8, s1: 0.2, up: 160 });
  markFx();
}

/** 새 상권 오픈 컷: 어둡게 → 썸네일이 위에서 떨어짐 + 배너 + 폭죽. 여러 개면 차례로 */
const cutQueue: (() => void)[] = [];
let cutOn = false;
export function districtCut(thumb: Texture | null, name: string, note: string, onDone?: () => void): void {
  const run = () => districtCutNow(thumb, name, note, () => {
    onDone?.();
    const nx = cutQueue.shift();
    if (nx) nx();
    else cutOn = false;
  });
  if (cutOn) {
    if (cutQueue.length < 6) cutQueue.push(run);
    return;
  }
  cutOn = true;
  run();
}
function districtCutNow(thumb: Texture | null, name: string, note: string, onDone?: () => void): void {
  const c = new Container();
  const dim = new Graphics().rect(-4000, -4000, 9000, 9000).fill({ color: 0x000000, alpha: FX.districtOpen.dim });
  dim.alpha = 0;
  c.addChild(dim);
  const land = view.orient === 'land';
  const cx = view.LW / 2;
  const cy = view.LH * 0.45;
  /* 건너뛰기로 일찍 치울 때 아직 도는 트윈(썸네일 낙하 등)을 먼저 멈춤 — 안 멈추면 destroy 된 컨테이너에 y 를 쓰다 오류 */
  const tweened: object[] = [dim];
  if (thumb) {
    const frame = new Graphics().roundRect(-8, -8, 1, 1, 24);
    const sp = new Sprite(thumb);
    const tw = land ? 760 : 820;
    const k = tw / thumb.width;
    sp.scale.set(k);
    sp.anchor.set(0.5);
    const fr = new Graphics().roundRect(-tw / 2 - 12, (-thumb.height * k) / 2 - 12, tw + 24, thumb.height * k + 24, 28).fill(0xffffff);
    frame.destroy();
    const g = new Container();
    g.addChild(fr, sp);
    const m = new Graphics().roundRect(-tw / 2, (-thumb.height * k) / 2, tw, thumb.height * k, 18).fill(0xffffff);
    sp.mask = m;
    g.addChild(m);
    g.position.set(cx, -600);
    g.rotation = -0.08;
    c.addChild(g);
    tweened.push(g);
    gsap.to(g, { y: cy, rotation: 0.02, duration: 0.55, ease: 'bounce.out', delay: 0.15 });
  }
  const t = new Text({ text: name, style: { fontFamily: FONT_STACK, fontSize: 84, fill: '#ffffff', stroke: { color: '#8a5a1a', width: 11, join: 'round' } } });
  t.anchor.set(0.5);
  const ns = new NineSliceSprite({ texture: T('fx.banner'), leftWidth: 90, topHeight: 40, rightWidth: 90, bottomHeight: 40 });
  ns.width = Math.max(560, t.width + 260);
  ns.height = 150;
  ns.pivot.set(ns.width / 2, 75);
  const bn = new Container();
  bn.addChild(ns, t);
  bn.position.set(cx, view.LH * (land ? 0.16 : 0.2));
  bn.scale.set(0);
  c.addChild(bn);
  const n = new Text({ text: note, style: { fontFamily: FONT_STACK, fontSize: 40, fill: '#fff8ec', stroke: { color: '#4a2f12', width: 8, join: 'round' }, wordWrap: true, wordWrapWidth: view.LW * 0.8, align: 'center' } });
  n.anchor.set(0.5, 0);
  n.position.set(cx, view.LH * (land ? 0.78 : 0.7));
  n.alpha = 0;
  c.addChild(n);
  cutLayer.addChild(c);
  gsap.to(dim, { alpha: 1, duration: 0.25 });
  gsap.to(bn.scale, { x: 1, y: 1, duration: 0.5, ease: 'back.out(2.4)', delay: 0.45 });
  gsap.to(n, { alpha: 1, duration: 0.3, delay: 0.7 });
  tweened.push(bn.scale, n);
  const fw = gsap.delayedCall(0.7, () => {
    fireworks(FX.districtOpen.fireworks);
    confetti(FX.districtOpen.confetti, true);
  });
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    gsap.to(c, { alpha: 0, duration: 0.3, onComplete: () => { gsap.killTweensOf(tweened); fw.kill(); c.destroy({ children: true }); onDone?.(); } });
  };
  gsap.delayedCall(FX.districtOpen.sec, finish);
  tapToSkip = finish;
  markFx();
}
let tapToSkip: (() => void) | null = null;
/** 상권 오픈 컷이 도는 중인지 (검수용) */
export function cutBusy(): boolean {
  return cutOn;
}
export function skipCut(): boolean {
  if (!tapToSkip) return false;
  const f = tapToSkip;
  tapToSkip = null;
  f();
  return true;
}

/** 화면 어둡게(보스 등장·큰 새 거래처). 겹쳐 와도 한 장만 — 더 진한 값·더 긴 시간으로 덮음 */
const dimG = new Graphics().rect(-4000, -4000, 9000, 9000).fill({ color: 0x000000, alpha: 1 });
dimG.alpha = 0;
let dimTarget = 0;
let dimLeft = 0;
export function dimScreen(alpha: number, sec: number): void {
  if (!dimG.parent) cutLayer.addChildAt(dimG, 0);
  dimTarget = Math.max(dimLeft > 0 ? dimTarget : 0, alpha);
  dimLeft = Math.max(dimLeft, sec);
  markFx();
}
function updateDim(dt: number): void {
  if (dimLeft > 0) dimLeft -= dt;
  const to = dimLeft > 0 ? dimTarget : 0;
  const k = Math.min(1, dt * (to > dimG.alpha ? 9 : 3));
  dimG.alpha += (to - dimG.alpha) * k;
  if (dimG.alpha < 0.005 && to === 0) dimG.alpha = 0;
  if (dimG.alpha > 0) markFx();
}

/* ── 화면 전환 와이프: 식권 티켓 모양 구멍이 줄었다가(가림) 커짐(드러남) ── */
const wipeG = new Graphics();
let wipeK = -1;
function drawWipe(k: number): void {
  wipeG.clear();
  if (k >= 1) return;
  const W = view.w;
  const H = view.h;
  const diag = Math.hypot(W, H);
  const tw = Math.max(0.001, diag * 1.25 * k);
  const th = tw * 0.52;
  const cx = W / 2;
  const cy = H / 2;
  wipeG.rect(0, 0, W, H).fill(0xff9f43);
  if (k > 0.001) {
    wipeG.roundRect(cx - tw / 2, cy - th / 2, tw, th, th * 0.16).cut();
    const nr = th * 0.1;
    for (let i = 0; i < 3; i++) {
      const yy = cy - th * 0.28 + i * th * 0.28;
      wipeG.circle(cx - tw / 2, yy, nr).fill(0xff9f43);
      wipeG.circle(cx + tw / 2, yy, nr).fill(0xff9f43);
    }
    wipeG.roundRect(cx - tw / 2 - 5, cy - th / 2 - 5, tw + 10, th + 10, th * 0.16 + 5).stroke({ width: 10, color: 0xfff8ec });
  }
}
export function wipe(mid: () => void | Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    if (!wipeG.parent) FXL.screen.addChild(wipeG);
    sfx('wipe');
    const o = { k: 1 };
    const tl = gsap.timeline();
    tl.to(o, {
      k: 0, duration: 0.24, ease: 'power2.in', onUpdate: () => { wipeK = o.k; drawWipe(o.k); markFx(); },
    });
    tl.add(async () => {
      tl.pause();
      try {
        await mid();
      } catch (e) {
        console.error(e);
      }
      tl.resume();
    });
    tl.to(o, {
      k: 1, duration: FX.wipe.sec, ease: 'power2.out', onUpdate: () => { wipeK = o.k; drawWipe(o.k); markFx(); },
      onComplete: () => { wipeK = -1; wipeG.clear(); markFx(); resolve(); },
    });
  });
}
export function wiping(): boolean {
  return wipeK >= 0;
}

export function updateTop(dt: number): void {
  confCool = Math.max(0, confCool - dt);
  updateFlies(dt);
  conf.update(dt);
  sparks.update(dt);
  updateBanners(dt);
  updateClimax(dt);
  updateDim(dt);
  if (reduceMotion) {
    /* 흔들림 줄이기는 stage 쪽에서 처리 */
  }
}
/** 줄 서 있는 배너만 버림(떠 있는 것은 끝까지) — 영업이 끝날 때 */
export function dropQueuedBanners(): void {
  queue.length = 0;
}
export function clearTop(): void {
  queue.length = 0;
  climaxLeft = 0;
  lvPending = 0;
  /* 사무실에서 줄 서 있던 새 상권 컷은 영업으로 가져가지 않음 */
  cutQueue.length = 0;
  if (tapToSkip) skipCut();
}
/** 검수용: 화면에 보이는 배너 수 · 줄 선 배너 수 · 미뤄 둔 LEVEL UP */
export function bannerStat(): { shown: number; queued: number; lvPending: number; texts: string[] } {
  const vis = bannerLayer.children.filter((c) => !c.destroyed && c.alpha > 0.05);
  const texts = vis.map((c) => (c.children.find((k) => k instanceof Text) as Text | undefined)?.text || '');
  return { shown: vis.length, queued: queue.length, lvPending, texts };
}

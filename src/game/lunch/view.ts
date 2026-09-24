/**
 * 영업 그림(PixiJS). 로직(Lunch)이 알려 주는 사건을 받아 연출한다. 층 순서는 설계서 8-4.
 *  바닥 → 도로 → 그림자 → 배우(y 정렬: 장식·대상·선물·보행자·차) → 구름 그림자 → 설득 게이지 → 스킬 효과 → 문의·아이템
 *  → 판교 어둠·세종 꽃잎 → 영업 반경 → 파티클 → 숫자 → 도장·말풍선 → (화면) 번쩍·비네트
 */
import { BitmapText, Container, Graphics, NineSliceSprite, Sprite, Text, type Texture } from 'pixi.js';
import gsap from 'gsap';
import { FONT_STACK } from '../../fonts';
import type { MapLayers } from '../contracts';
import { CONTRACT_FX, DISTRICT_BY, F, FX, TARGETS, type SkillId, type TargetDef } from '../data';
import { sfx, music, audio } from '../deps';
import { fmt } from '../format';
import { clock, hitstop, slowmo } from '../core/clock';
import { EV_BASE, EV_FONT } from '../core/fonts';
import { markFx, view, worldToFx } from '../core/stage';
import { T, circle, pill } from '../core/tex';
import { Camera } from '../fx/camera';
import { Numbers } from '../fx/numbers';
import { Particles } from '../fx/particles';
import { banner, climax, confetti, dimScreen, fireworks, flyCoin, type HudId } from '../fx/top';
import { S } from '../state';
import type { Chest, ContractResult, Ent, FloatItem, Inquiry, Lunch, LunchEvents, Reward, SkFx } from './logic';

export interface HudHooks {
  skillFired(sk: SkillId): void;
  matchUp(step: number, M: number): void;
  portrait(kind: 'nod' | 'cheer'): void;
  itemGet(id: string, isNew: boolean): void;
  levelUp(lv: number, gained: number): void;
  pendingRelease(gmv: number): void;
  tick(sec: number): void;
  bossAppear(): void;
  pendingAnchor(): HudId;
}

interface Gauge { c: Container; bg: NineSliceSprite; ghost: NineSliceSprite; fill: NineSliceSprite; ghostR: number; w: number; h: number }
interface TV {
  e: Ent; body: Container; spr: Sprite; add: Sprite; shadow: Sprite; gauge: Gauge | null; box: number;
  appear: number; delay: number; state: 'live' | 'signed' | 'miss' | 'exit'; leaveT: number; flash: number; squash: number;
  hopT: number; hopFrom: { x: number; y: number }; sweatT: number; fleeT: number; texKey: string; ph: number;
  clock: Sprite | null; wmark: Sprite | null; crown: Sprite | null; lights: Sprite[]; pill: Container | null; pillT: number; pillHW: number; arrow: Sprite | null; arrowT: number;
  dx: number; dy: number; popped: boolean;
}
interface Stamp { c: Container; ink: Sprite; ring: Sprite; txt: Text; t: number; s: number; rot: number; x: number; y: number; alive: boolean }
interface Bubble { c: Container; bg: NineSliceSprite; txt: Text; t: number; alive: boolean; x: number; y: number }

const ROAD_KEYS = { h: ['idle', 'hit', 'happy'], v: ['up', 'down'] };
const TIER_OF: Record<string, number> = Object.fromEntries(TARGETS.map((t) => [t.id, t.tier]));
const hex = (c: string) => parseInt(c.slice(1), 16);
const blinkCache: Record<string, boolean> = {};
function blinkOk(id: string): boolean {
  let v = blinkCache[id];
  if (v === undefined) {
    const t = T(`t.${id}@blink`);
    v = blinkCache[id] = t.width > 20;
  }
  return v;
}
/** destroy 전에 그 아래 모든 트윈을 멈춤(destroy 된 컨테이너에 y 를 쓰는 트윈이 남으면 매 프레임 오류) */
function killDeep(o: Container | null | undefined): void {
  if (!o || o.destroyed) return;
  gsap.killTweensOf(o);
  gsap.killTweensOf(o.scale);
  for (const ch of o.children) killDeep(ch as Container);
}
/** grade 별 최소 히트스톱(ms) */
const HITSTOP_FLOOR = [0, 30, 45, 90, 120];

export class LunchView implements LunchEvents {
  readonly root = new Container();
  readonly camera: Camera;
  readonly L = {
    ground: new Container(), roads: new Container(), shadows: new Container(), actors: new Container(), clouds: new Container(),
    gauges: new Container(), skill: new Container(), floats: new Container(), dark: new Container(), radius: new Container(),
    parts: new Container(), nums: new Container(), stamps: new Container(), labels: new Container(),
  };
  lunch!: Lunch;
  readonly parts: Particles;
  readonly nums: Numbers;
  private tvs = new Map<number, TV>();
  private dying: TV[] = [];
  private stamps: Stamp[] = [];
  private bubbles: Bubble[] = [];
  private bolts: { pts: { x: number; y: number }[]; t: number; life: number; glows: Sprite[] }[] = [];
  private boltG = new Graphics();
  private boomG = new Graphics();
  private booms: { x: number; y: number; r: number; t: number }[] = [];
  private skv = new Map<number, { c: Container; parts: Sprite[]; txt?: BitmapText; fx: SkFx }>();
  private chv = new Map<number, { spr: Sprite; sh: Sprite; pulse: Sprite; c: Chest }>();
  private inv = new Map<number, { spr: Sprite; pulse: Sprite; b: Inquiry }>();
  private itv = new Map<number, { spr: Sprite; pulse: Sprite; it: FloatItem }>();
  private radiusC = new Container();
  private rGlow: Sprite;
  private rDisk: Sprite;
  /** 점선 원 아래 옅은 갈색 그림자(밝은 바닥에서도 점선이 보이게) */
  private rShadow: Sprite;
  private touchG = new Graphics();
  private darkHole: Sprite | null = null;
  private darkG: Graphics | null = null;
  private cars: { sp: Sprite; r: { ax: 'h' | 'v'; x: number; y: number; dir: 1 | -1 }; v: number; off: number; key: string }[] = [];
  private walkers: { sp: Sprite; ax: 'h' | 'v'; fixed: number; pos: number; dir: 1 | -1; v: number; key: string; ph: number }[] = [];
  private cloudsS: { sp: Sprite; v: number }[] = [];
  private petals: { sp: Sprite; x: number; y: number; vx: number; vy: number; vr: number; ph: number }[] = [];
  private glints: { sp: Sprite; ph: number }[] = [];
  readonly map: MapLayers;
  readonly portK: number;
  readonly lot: number;
  readonly dark: boolean;
  touch = false;
  finger = { x: 0, y: 0 };
  private rAppear = 0;
  /** 화면에 보이는 지도 가로 범위(카메라 줌 반영) — 새 거래처 알약·거래액 숫자를 이 안으로 */
  private visX0 = 0;
  private visX1 = 0;
  private rGold = 0;
  private rt = 0;
  private stampFree: Stamp[] = [];
  private bubbleCool = 0;
  private persuadeCool = 0;
  private slowCool = 0;
  quality: 'high' | 'low' = 'high';

  constructor(map: MapLayers, ground: Texture, roads: Texture, public hud: HudHooks) {
    this.map = map;
    this.lot = map.lot;
    this.portK = map.lot / 129;
    this.dark = !!DISTRICT_BY[map.district].mod.dark;
    this.quality = S.settings.quality;
    this.parts = new Particles(this.quality === 'low' ? 260 : FX.budget.particles);
    this.nums = new Numbers(FX.budget.numbers);
    this.nums.scale = map.orient === 'port' ? FX.number.portScale : 1;
    this.nums.merge = S.settings.mergeNumbers;
    this.nums.bounds = { x0: 0, x1: map.W, y0: map.area.y - 10 };
    this.camera = new Camera();
    this.camera.reduce = S.settings.reduceShake;
    this.camera.maxWaves = this.quality === 'low' ? 0 : view.w < 700 || navigator.maxTouchPoints > 0 ? FX.budget.filtersMaxMobile : FX.budget.filtersMax;
    const Ls = this.L;
    this.root.addChild(this.camera.cam);
    /* 도장은 숫자 아래(금액이 도장에 덮이지 않게), 말풍선·새 거래처 알약은 맨 위 */
    this.camera.cam.addChild(Ls.ground, Ls.roads, Ls.shadows, Ls.actors, Ls.clouds, Ls.gauges, Ls.skill, Ls.floats, Ls.dark, Ls.radius, Ls.parts, Ls.stamps, Ls.nums, Ls.labels);
    Ls.actors.sortableChildren = true;
    Ls.parts.addChild(this.parts.view);
    Ls.nums.addChild(this.nums.view);
    const g = new Sprite(ground);
    g.width = map.W;
    g.height = map.H;
    Ls.ground.addChild(g);
    if (roads && roads.width > 2) {
      const r = new Sprite(roads);
      r.width = map.W;
      r.height = map.H;
      Ls.roads.addChild(r);
    }
    /* 장식 */
    for (const d of map.decor) {
      const sp = new Sprite(T(d.svgId));
      sp.anchor.set(0.5, 1);
      const side = this.lot * d.s * 1.1;
      sp.scale.set(side / Math.max(1, sp.texture.width));
      sp.position.set(d.x, d.y);
      sp.zIndex = d.y;
      Ls.actors.addChild(sp);
    }
    Ls.skill.addChild(this.boomG, this.boltG);
    /* 반경 */
    /* 설계 6-1: 회전 점선 원(채움 0.1) + 3Hz 맥동, 안에 대상이 있으면 테두리 금색. 흰 글로우는 대상이 안에 있을 때만 옅게 */
    this.rGlow = new Sprite(T('fx.glow'));
    this.rGlow.anchor.set(0.5);
    this.rGlow.blendMode = 'add';
    this.rGlow.tint = 0xffe9a8;
    this.rGlow.alpha = 0;
    this.rShadow = new Sprite(T('fx.radius'));
    this.rShadow.anchor.set(0.5);
    this.rShadow.tint = 0x5c3a1a;
    this.rShadow.alpha = 0.3;
    this.rDisk = new Sprite(T('fx.radius'));
    this.rDisk.anchor.set(0.5);
    this.radiusC.addChild(this.rGlow, this.rShadow, this.rDisk);
    Ls.radius.addChild(this.touchG, this.radiusC);
    /* 판교 어둠 */
    if (this.dark) {
      this.darkHole = new Sprite(T('fx.hole'));
      this.darkHole.anchor.set(0.5);
      this.darkG = new Graphics();
      Ls.dark.addChild(this.darkHole, this.darkG);
    }
    this.initAmbient();
  }

  /* ── 배경 움직임 ── */
  private initAmbient(): void {
    const m = this.map;
    const pk = this.portK;
    const nCars = this.quality === 'low' ? 3 : 6;
    for (let i = 0; i < nCars; i++) {
      const rt = m.routes[i % m.routes.length];
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const key = `a.car${i % 4}`;
      const sp = new Sprite(T(`${key}@${rt.ax}`));
      sp.anchor.set(0.5);
      sp.scale.set(pk);
      if (dir < 0) sp.scale.set(rt.ax === 'h' ? -pk : pk, rt.ax === 'v' ? -pk : pk);
      const a = rt.pts[0];
      const b = rt.pts[1];
      const t0 = Math.random();
      const off = m.road * 0.17 * dir;
      const car = { sp, r: { ax: rt.ax, x: rt.ax === 'h' ? a.x + (b.x - a.x) * t0 : a.x + off, y: rt.ax === 'v' ? a.y + (b.y - a.y) * t0 : a.y + off, dir }, v: (70 + Math.random() * 60) * m.U, off, key };
      this.cars.push(car);
      this.L.actors.addChild(sp);
    }
    const nW = this.quality === 'low' ? 4 : 8;
    for (let i = 0; i < nW; i++) {
      const rd = m.roads[i % m.roads.length];
      const side = i % 2 ? 1 : -1;
      const walk = m.lot * 0.05;
      const ax = rd.ax;
      const fixed = ax === 'h' ? rd.y + rd.h / 2 + side * (rd.h / 2 - walk) : rd.x + rd.w / 2 + side * (rd.w / 2 - walk);
      const len = ax === 'h' ? m.W : m.H;
      const key = `a.walker${i % 4}`;
      const sp = new Sprite(T(`${key}@a`));
      sp.anchor.set(0.5, 1);
      sp.scale.set(pk * 0.95);
      this.walkers.push({ sp, ax, fixed, pos: Math.random() * len, dir: Math.random() < 0.5 ? 1 : -1, v: (22 + Math.random() * 14) * m.U, key, ph: Math.random() * 6 });
      this.L.actors.addChild(sp);
    }
    for (let i = 0; i < 2; i++) {
      const sp = new Sprite(T('a.cloudShadow'));
      sp.anchor.set(0.5);
      sp.scale.set(1.6 * pk + i * 0.4);
      sp.position.set(Math.random() * m.W, m.area.y + m.area.h * (0.25 + i * 0.45));
      this.cloudsS.push({ sp, v: (18 + i * 9) * m.U });
      this.L.clouds.addChild(sp);
    }
    const dmod = DISTRICT_BY[m.district].mod;
    if (dmod.spark) {
      for (let i = 0; i < 16; i++) {
        const sp = new Sprite(T('fx.petal'));
        sp.anchor.set(0.5);
        sp.scale.set(pk * (0.8 + Math.random() * 0.6));
        const p = { sp, x: Math.random() * m.W, y: Math.random() * m.H, vx: (40 + Math.random() * 40) * m.U, vy: (20 + Math.random() * 25) * m.U, vr: (Math.random() - 0.5) * 3, ph: Math.random() * 6 };
        this.petals.push(p);
        this.L.dark.addChild(sp);
      }
    }
    for (const b of m.bands) {
      if (b.kind !== 'water') continue;
      for (let i = 0; i < 12; i++) {
        const sp = new Sprite(T('fx.waterGlint'));
        sp.anchor.set(0.5);
        sp.position.set(b.x + Math.random() * b.w, b.y + b.h * (0.2 + Math.random() * 0.6));
        sp.scale.set(pk * (0.8 + Math.random() * 0.8));
        sp.blendMode = 'add';
        this.glints.push({ sp, ph: Math.random() * 6 });
        this.L.clouds.addChild(sp);
      }
    }
  }
  private updateAmbient(dt: number): void {
    const m = this.map;
    for (const c of this.cars) {
      const lo = -120;
      if (c.r.ax === 'h') {
        c.r.x += c.r.dir * c.v * dt;
        if (c.r.x > m.W + 120 || c.r.x < lo) c.r.x = c.r.dir > 0 ? lo : m.W + 120;
      } else {
        c.r.y += c.r.dir * c.v * dt;
        if (c.r.y > m.H + 120 || c.r.y < lo) c.r.y = c.r.dir > 0 ? lo : m.H + 120;
      }
      c.sp.position.set(c.r.x, c.r.y);
      c.sp.zIndex = c.r.y;
    }
    for (const w of this.walkers) {
      const len = w.ax === 'h' ? m.W : m.H;
      w.pos += w.dir * w.v * dt;
      if (w.pos > len + 40) w.pos = -40;
      if (w.pos < -40) w.pos = len + 40;
      w.ph += dt * 6;
      const frame = Math.sin(w.ph) > 0 ? 'a' : 'b';
      const k = `${w.key}@${frame}`;
      w.sp.texture = T(k);
      const x = w.ax === 'h' ? w.pos : w.fixed;
      const y = w.ax === 'h' ? w.fixed : w.pos;
      w.sp.position.set(x, y);
      w.sp.scale.x = Math.abs(w.sp.scale.y) * (w.dir > 0 ? -1 : 1);
      w.sp.zIndex = y;
    }
    for (const c of this.cloudsS) {
      c.sp.x += c.v * dt;
      if (c.sp.x - c.sp.width / 2 > m.W) c.sp.x = -c.sp.width / 2;
    }
    for (const p of this.petals) {
      p.ph += dt;
      p.x += (p.vx + Math.sin(p.ph * 1.3) * 20) * dt;
      p.y += p.vy * dt;
      if (p.x > m.W + 30) p.x = -30;
      if (p.y > m.H + 30) p.y = m.area.y - 30;
      p.sp.position.set(p.x, p.y);
      p.sp.rotation += p.vr * dt;
      p.sp.scale.x = Math.abs(p.sp.scale.y) * Math.cos(p.ph * 2.3);
    }
    for (const g of this.glints) {
      g.ph += dt * 1.7;
      g.sp.alpha = 0.2 + Math.max(0, Math.sin(g.ph)) * 0.8;
    }
  }

  /* ── 대상 ── */
  private texFor(tv: TV): string {
    const e = tv.e;
    const base = `t.${e.t.id}@`;
    if (e.road) {
      if (e.road.ax === 'v') return base + (e.dir > 0 ? 'down' : 'up');
      if (tv.state === 'signed') return base + 'happy';
      return base + (e.hit > 0 ? 'hit' : 'idle');
    }
    if (tv.state === 'signed') return base + 'happy';
    if (e.hit > 0) return base + 'hit';
    /* 가끔 눈 깜빡임(그림 모듈의 t.<id>@blink 가 있을 때만) */
    if (tv.state === 'live' && (this.rt + tv.ph * 0.9) % 3.4 < 0.13 && blinkOk(e.t.id)) return base + 'blink';
    return base + 'idle';
  }
  spawn(e: Ent, initial: boolean): void {
    const body = new Container();
    const key = `t.${e.t.id}@${e.road && e.road.ax === 'v' ? (e.dir > 0 ? 'down' : 'up') : 'idle'}`;
    const spr = new Sprite(T(key));
    spr.anchor.set(0.5, 0.8);
    const add = new Sprite(spr.texture);
    add.anchor.set(0.5, 0.8);
    add.blendMode = 'add';
    add.alpha = 0;
    body.addChild(spr, add);
    const box = e.w;
    const shadow = new Sprite(T('o.shadow'));
    shadow.anchor.set(0.5);
    this.L.shadows.addChild(shadow);
    this.L.actors.addChild(body);
    const tv: TV = {
      e, body, spr, add, shadow, gauge: null, box, appear: 0, delay: initial ? Math.random() * 0.35 : 0, state: 'live', leaveT: 0, flash: 0, squash: 0,
      hopT: -1, hopFrom: { x: e.x, y: e.y }, sweatT: 0, fleeT: 0, texKey: key, ph: Math.random() * 6.28, clock: null, wmark: null, crown: null, lights: [],
      pill: null, pillT: 0, pillHW: 0, arrow: null, arrowT: 0, dx: e.x, dy: e.y, popped: false,
    };
    body.visible = false;
    shadow.visible = false;
    if (this.dark && !e.road) {
      for (let i = 0; i < 3; i++) {
        const l = new Sprite(T('fx.windowLight'));
        l.anchor.set(0.5);
        l.blendMode = 'add';
        l.scale.set((box / 120) * 0.9);
        l.position.set((i - 1) * box * 0.22, -box * 0.12);
        l.alpha = 0.8;
        body.addChild(l);
        tv.lights.push(l);
      }
    }
    if (e.boss) {
      const crown = new Sprite(T('o.crown'));
      crown.anchor.set(0.5, 1);
      crown.scale.set(1.3 * this.portK * 1.5);
      crown.y = -box * 0.82 - 800;
      crown.alpha = 0;
      body.addChild(crown);
      tv.crown = crown;
    }
    this.tvs.set(e.id, tv);
    e.view = tv;
    if (!initial) {
      if (e.t.grade >= 2) sfx('target_appear_big', { tier: e.t.tier });
      else sfx('target_appear', { tier: e.t.tier });
    }
  }
  private gaugeFor(tv: TV): Gauge {
    if (tv.gauge) return tv.gauge;
    const e = tv.e;
    const big = e.t.big || e.boss;
    const w = Math.max(30, tv.box * (big ? FX.persuade.gaugeWBig : FX.persuade.gaugeW));
    const h = (e.boss ? FX.persuade.gaugeHBoss : FX.persuade.gaugeH) * this.portK * (e.boss ? 1.6 : 1.25);
    const c = new Container();
    const k = h / 16;
    const mk = (tint: number, alpha: number) => {
      const s = new NineSliceSprite({ texture: pill(), leftWidth: 8, topHeight: 8, rightWidth: 8, bottomHeight: 8 });
      s.height = 16;
      s.width = w / k;
      s.tint = tint;
      s.alpha = alpha;
      return s;
    };
    const bg = mk(0x000000, 0.45);
    bg.width = w / k + 6;
    bg.height = 22;
    bg.position.set(-3, -3);
    const ghost = mk(0xffffff, 0.9);
    const fill = mk(e.boss ? 0xff8fab : 0x7dff8a, 1);
    c.addChild(bg, ghost, fill);
    c.scale.set(k);
    this.L.gauges.addChild(c);
    tv.gauge = { c, bg, ghost, fill, ghostR: 1, w, h };
    return tv.gauge;
  }

  remove(e: Ent, why: 'signed' | 'miss' | 'exit'): void {
    const tv = this.tvs.get(e.id);
    if (!tv) return;
    this.tvs.delete(e.id);
    tv.state = why;
    tv.leaveT = 0;
    if (why === 'miss') {
      sfx('target_leave');
      this.parts.burst(T('fx.smoke'), e.x, e.y - tv.box * 0.3, FX.leave.smoke, { spMin: 30, spMax: 90, life: 0.6, s0: 0.5 * this.portK, s1: 1 * this.portK, a0: 0.8, up: 30 });
    }
    if (why === 'signed') {
      tv.flash = 1;
      tv.squash = 1;
    }
    /* 새 거래처 알약·화살표는 바로 걷음(퇴장 연출 동안 제자리에 굳어 다른 알약과 겹치지 않게) */
    if (tv.pill) {
      const p = tv.pill;
      tv.pill = null;
      killDeep(p);
      gsap.to(p, { alpha: 0, duration: 0.2, onComplete: () => p.destroy({ children: true }) });
    }
    if (tv.arrow) {
      tv.arrow.destroy();
      tv.arrow = null;
    }
    this.dying.push(tv);
  }

  contract(e: Ent, c: ContractResult): void {
    const tv = (e.view as TV) || null;
    const g = CONTRACT_FX[Math.max(0, Math.min(4, c.grade))];
    const crit = c.crit;
    const x = e.x;
    const top = e.y - (tv ? tv.box : e.w) * 0.8;
    const pk = this.portK;
    /* 0초: 번쩍·찌그러짐·히트스톱 */
    /* 히트스톱: 설계값(grade 2~4) + 중견기업급(grade 1)도 30ms 로 살짝 — 티어가 클수록 길게 */
    const hs = Math.max(g.hitstopMs || 0, HITSTOP_FLOOR[c.grade] || 0);
    if (hs) hitstop(hs);
    this.camera.addShake((g.shake + (crit ? FX.crit.shakeAdd : 0)) * pk);
    this.camera.addFlash(g.flash + (crit ? FX.crit.flashAdd : 0));
    if (g.zoom) this.camera.punchZoom(g.zoom, x, e.y);
    if (g.slowmo) slowmo(g.slowmo.rate, g.slowmo.sec);
    else if (c.grade >= 3 && this.slowCool <= 0) {
      /* 대기업급: 짧은 슬로모(연달아 오면 3초에 한 번만) */
      slowmo(0.55, 0.28);
      this.slowCool = 3;
    }
    if (g.duck) audio.duck(g.duck.to, g.duck.sec);
    sfx(g.sfx as Parameters<typeof sfx>[0], { tier: e.t.tier });
    if (crit) sfx('crit');
    /* 글로우(add): 동시 3개까지 — 후반 계약이 몰리면 겹친 글로우로 지도가 하얗게 뜸 */
    if (g.glow && (this.glows < 3 || c.grade >= 4)) {
      this.glows++;
      const gl = new Sprite(T('fx.glow'));
      gl.anchor.set(0.5);
      gl.blendMode = 'add';
      gl.tint = 0xfff0b4;
      gl.position.set(x, e.y - (tv ? tv.box : e.w) * 0.35);
      const s = ((tv ? tv.box : e.w) * 2.4) / 256;
      gl.scale.set(s * 0.5);
      this.L.parts.addChild(gl);
      gsap.to(gl.scale, { x: s, y: s, duration: 0.25, ease: 'power2.out' });
      gsap.to(gl, { alpha: 0, duration: 0.45, delay: 0.1, onComplete: () => { this.glows--; gl.destroy(); } });
    }
    /* 보스 계약 도장만 보이게 다른 도장은 걷음 */
    if (c.grade >= 4) for (const st of this.stamps.slice()) this.killStamp(st);
    /* 도장 + 말풍선 */
    const onScreen = this.stamps.filter((s) => s.alive).length;
    if (onScreen < FX.stamp.maxOnScreen || c.grade >= 2) {
      if (onScreen >= FX.stamp.maxOnScreen) {
        const old = this.stamps.find((s) => s.alive);
        if (old) this.killStamp(old);
      }
      /* 도장이 많이 떠 있을수록 조금씩 작게(화면이 도장으로 덮이지 않게) */
      const crowdK = Math.max(0.55, 1 - 0.055 * Math.min(onScreen, 7) - 0.012 * Math.min(this.nums.count, 12));
      /* 보스는 도장·숫자를 몸 가운데 아래쪽에(위쪽은 전국 계약 배너 자리) */
      this.stamp(x, e.boss ? e.y - (tv ? tv.box : e.w) * 0.05 : top + (tv ? tv.box : e.w) * 0.3, g.stampScale * pk * (e.boss ? 1.2 : crowdK));
      sfx('stamp');
    }
    if (c.grade >= 4) {
      /* 절정(보스 계약): 떠 있는 숫자는 걷고 LEVEL UP 은 미뤄서 전국 계약 배너·도장·보스 숫자만 보이게 */
      climax(2.4);
      this.nums.hush(2.2);
      banner(g.banner || '대형 계약', `${e.t.name} · ${e.t.sizeLabel}`, '+' + fmt(c.gmv) + '원', true);
    } else if (c.grade >= 3) {
      banner(g.banner || '대형 계약', `${e.t.name} · ${e.t.sizeLabel}`, '+' + fmt(c.gmv) + '원');
    } else if (c.grade >= 1 && this.bubbleCool <= 0) {
      this.bubble(x, top - 20 * pk, `${e.t.name} 계약!`);
      this.bubbleCool = 0.3;
    }
    /* 숫자 */
    this.nums.gmv(x, e.boss ? e.y + (tv ? tv.box : e.w) * 0.3 : top, c.gmv, c.rev, c.xp, { crit, boss: e.boss, pending: c.pending });
    /* 링·쇼크웨이브·파티클 */
    gsap.delayedCall(0.06, () => {
      g.rings.forEach((r, i) => this.ring(x, e.y - (tv ? tv.box : e.w) * 0.3, r * this.lot, 0.45 + i * 0.12, i * 0.08, 0xfff4c4, 1, c.grade >= 3));
      if (c.grade >= 2) {
        const gp = this.L.stamps.toGlobal({ x, y: e.y - (tv ? tv.box : e.w) * 0.3 });
        this.camera.shockwave(gp.x, gp.y, c.grade >= 4 ? 1.8 : c.grade >= 3 ? 1.3 : 0.9);
      }
      const nT = Math.round(g.tickets * (this.quality === 'low' ? 0.5 : 1));
      const nC = Math.round(g.coins * (this.quality === 'low' ? 0.5 : 1));
      const cy = e.y - (tv ? tv.box : e.w) * 0.35;
      this.parts.burst(T('fx.ticket'), x, cy, nT, { spMin: 90 * pk, spMax: 320 * pk, g: 620 * pk, life: 0.8, s0: 0.75 * pk, s1: 0.45 * pk, up: 120 * pk });
      this.parts.burst(T('fx.coin'), x, cy, nC, { spMin: 90 * pk, spMax: 300 * pk, g: 620 * pk, life: 0.8, s0: 0.8 * pk, s1: 0.5 * pk, up: 140 * pk });
      this.parts.burst(T('fx.spark'), x, cy, 4 + c.grade * 3, { spMin: 60 * pk, spMax: 260 * pk, life: 0.45, s0: 0.9 * pk, s1: 0.1, up: 0, blend: 'add' });
      if (crit) this.parts.burst(T('fx.star'), x, cy, 8, { spMin: 120 * pk, spMax: 340 * pk, g: 500 * pk, life: 0.8, s0: 0.6 * pk, s1: 0.2, up: 160 * pk });
    });
    /* 0.25초~: HUD 로 날아감 */
    const flyT = Math.min(10, 1 + Math.floor(c.grade * 1.6) + (crit ? 1 : 0));
    const flyC = Math.min(6, 1 + c.grade);
    gsap.delayedCall(0.25, () => {
      const from = worldToFx(this.L.stamps, x, e.y - (tv ? tv.box : e.w) * 0.4);
      const toT: HudId = c.pending ? this.hud.pendingAnchor() : 'hud.gmv';
      for (let i = 0; i < flyT; i++) flyCoin('fx.ticket', { x: from.x + (Math.random() - 0.5) * 40, y: from.y + (Math.random() - 0.5) * 30 }, toT, i * 0.03, 0.9);
      if (c.rev > 0) for (let i = 0; i < flyC; i++) flyCoin('fx.coin', { x: from.x + (Math.random() - 0.5) * 40, y: from.y }, 'hud.revenue', 0.05 + i * 0.03, 0.9);
    });
    if (c.grade >= 3) {
      this.hud.portrait('cheer');
      gsap.delayedCall(0.15, () => {
        const p = worldToFx(this.L.stamps, x, e.y - (tv ? tv.box : e.w));
        fireworks(g.fireworks, p);
        confetti(g.confetti, c.grade >= 4);
      });
    } else this.hud.portrait('nod');
    if (c.grade >= 4) {
      music(null, { fade: 0.3 });
    }
  }

  private stamp(x: number, y: number, s: number): void {
    let st = this.stampFree.pop();
    if (!st) {
      const c = new Container();
      const ink = new Sprite(T('fx.stampInk'));
      ink.anchor.set(0.5);
      const ring = new Sprite(T('fx.stamp'));
      ring.anchor.set(0.5);
      const txt = new Text({ text: String(FX.stamp.text).replace(' ', '\n'), style: { fontFamily: FONT_STACK, fontSize: 80, lineHeight: 78, align: 'center', fill: FX.stamp.color, stroke: { color: '#ffffff', width: 9, join: 'round' }, letterSpacing: -2 } });
      txt.anchor.set(0.5);
      c.addChild(ink, ring, txt);
      st = { c, ink, ring, txt, t: 0, s: 1, rot: 0, x, y, alive: true };
    }
    st.t = 0;
    st.s = s;
    st.rot = ((FX.stamp.rot[0] + Math.random() * (FX.stamp.rot[1] - FX.stamp.rot[0])) * Math.PI) / 180;
    st.x = x;
    st.y = y;
    st.alive = true;
    st.c.visible = true;
    st.c.alpha = 0;
    this.L.stamps.addChild(st.c);
    this.stamps.push(st);
  }
  private killStamp(st: Stamp): void {
    st.alive = false;
    st.c.visible = false;
    const i = this.stamps.indexOf(st);
    if (i >= 0) this.stamps.splice(i, 1);
    this.stampFree.push(st);
  }
  private updateStamps(dt: number): void {
    const S0 = FX.stamp;
    for (const st of this.stamps.slice()) {
      st.t += dt;
      const t = st.t;
      let sc = 1;
      let a = 1;
      let dy = 0;
      if (t < S0.inSec) {
        const k = t / S0.inSec;
        sc = S0.dropFrom + (1 - S0.dropFrom) * (k * k);
        a = Math.min(1, k * 2);
      } else if (t < S0.inSec + 0.12) {
        const k = (t - S0.inSec) / 0.12;
        sc = 1 - Math.sin(k * Math.PI) * 0.14;
      } else if (t < S0.inSec + S0.holdSec) {
        sc = 1;
      } else if (t < S0.inSec + S0.holdSec + S0.outSec) {
        const k = (t - S0.inSec - S0.holdSec) / S0.outSec;
        dy = -S0.rise * k * this.portK;
        a = 1 - k;
      } else {
        this.killStamp(st);
        continue;
      }
      st.c.position.set(st.x, st.y + dy);
      st.c.rotation = st.rot;
      st.c.scale.set(st.s * sc * 0.64);
      st.c.alpha = a;
      st.ink.alpha = t < S0.inSec ? 0 : Math.min(0.85, (t - S0.inSec) * 6) * a;
      st.ink.scale.set(1 + Math.min(0.12, (t - S0.inSec) * 0.5));
    }
  }
  private bubble(x: number, y: number, text: string): void {
    let b = this.bubbles.find((q) => !q.alive);
    if (!b) {
      if (this.bubbles.length >= 4) return;
      const c = new Container();
      const bg = new NineSliceSprite({ texture: T('fx.bubble'), leftWidth: 40, topHeight: 36, rightWidth: 40, bottomHeight: 44 });
      const txt = new Text({ text: '', style: { fontFamily: FONT_STACK, fontSize: 30, fill: '#5c3a1a' } });
      txt.anchor.set(0.5);
      c.addChild(bg, txt);
      b = { c, bg, txt, t: 0, alive: true, x, y };
      this.bubbles.push(b);
      this.L.labels.addChild(c);
    }
    b.txt.text = text;
    const w = Math.max(160, b.txt.width + 70);
    b.bg.width = w;
    b.bg.height = 100;
    b.bg.position.set(-w / 2, -100);
    b.txt.position.set(0, -58);
    b.t = 0;
    b.alive = true;
    b.x = x;
    /* 맨 윗줄 대상: 말풍선이 HUD 띠(지도 영역 위)로 올라가 잘리지 않게 */
    b.y = Math.max(y, this.map.area.y + 110 * this.portK);
    b.c.visible = true;
  }
  private updateBubbles(dt: number): void {
    for (const b of this.bubbles) {
      if (!b.alive) continue;
      b.t += dt;
      const t = b.t;
      if (t > 1.1) {
        b.alive = false;
        b.c.visible = false;
        continue;
      }
      const k = Math.min(1, t * 8);
      const pop = t < 0.12 ? 0.3 + k * 0.85 : t < 0.2 ? 1.15 - (t - 0.12) * 1.8 : 1;
      b.c.scale.set(pop * 0.62 * this.portK);
      b.c.position.set(b.x, b.y - t * 18 * this.portK);
      b.c.alpha = t > 0.85 ? 1 - (t - 0.85) / 0.25 : 1;
    }
  }
  private rings = 0;
  private glows = 0;
  private ring(x: number, y: number, r: number, dur: number, delay: number, tint: number, width = 1, force = false): void {
    /* 후반 초당 수십 건 계약: 링이 화면을 덮지 않게 동시 10개까지 */
    if (!force && this.rings >= 10) return;
    this.rings++;
    const sp = new Sprite(T('fx.ring'));
    sp.anchor.set(0.5);
    sp.tint = tint;
    sp.position.set(x, y);
    sp.scale.set(0.05);
    sp.alpha = this.rings > 5 ? 0.55 : 0.9;
    sp.blendMode = 'add';
    this.L.parts.addChild(sp);
    const s = (r * 2) / 256;
    gsap.to(sp.scale, { x: s, y: s * width, duration: dur, delay, ease: 'expo.out' });
    gsap.to(sp, {
      alpha: 0, duration: dur, delay: delay + dur * 0.25, ease: 'power1.in',
      onComplete: () => {
        this.rings--;
        sp.destroy();
      },
    });
  }

  hop(e: Ent, fx: number, fy: number): void {
    const tv = e.view as TV;
    if (!tv) return;
    tv.hopT = 0;
    tv.hopFrom = { x: fx, y: fy };
    sfx('hop');
    this.parts.burst(T('fx.smoke'), fx, fy, 4, { spMin: 20, spMax: 70, life: 0.45, s0: 0.35 * this.portK, s1: 0.7 * this.portK, a0: 0.7, up: 10 });
  }
  flee(e: Ent): void {
    sfx('flee_honk');
    void e;
  }
  dash(e: Ent): void {
    sfx('bike_dash');
    const tv = e.view as TV;
    if (tv) tv.fleeT = 0.6;
  }

  /* ── 스킬 ── */
  bolt(_sk: SkillId, pts: { x: number; y: number }[]): void {
    if (pts.length < 2) return;
    const glows: Sprite[] = [];
    for (const p of pts.slice(1)) {
      const gl = new Sprite(T('fx.boltGlow'));
      gl.anchor.set(0.5);
      gl.blendMode = 'add';
      gl.position.set(p.x, p.y);
      gl.scale.set(2.2 * this.portK);
      this.L.skill.addChild(gl);
      glows.push(gl);
      this.parts.burst(T('fx.spark'), p.x, p.y, 4, { spMin: 60, spMax: 200, life: 0.3, s0: 0.7, s1: 0.1, tint: 0xbfe9ff, blend: 'add', up: 0 });
    }
    this.bolts.push({ pts, t: 0, life: 0.3, glows });
    sfx('skill_call');
  }
  skillCast(sk: SkillId, fx: SkFx | null): void {
    this.hud.skillFired(sk);
    if (!fx) return;
    const pk = this.portK;
    if (fx.type === 'bomb') {
      const c = new Container();
      const fl = new Sprite(T('fx.flyer'));
      fl.anchor.set(0.5, 0.8);
      fl.scale.set(pk * (fx.isEcho ? 0.7 : 1));
      c.addChild(fl);
      const txt = new BitmapText({ text: '', style: { fontFamily: EV_FONT, fontSize: EV_BASE } });
      txt.anchor.set(0.5);
      txt.scale.set((34 * pk) / EV_BASE);
      txt.y = -110 * pk;
      txt.tint = 0xffe066;
      c.addChild(txt);
      c.position.set(fx.x, fx.y);
      c.scale.set(0.2);
      gsap.to(c.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' });
      this.L.skill.addChild(c);
      this.skv.set(fx.id, { c, parts: [fl], txt, fx });
      if (!fx.isEcho) sfx('skill_promo_set');
    } else if (fx.type === 'jet') {
      const c = new Container();
      const parts: Sprite[] = [];
      for (let i = 0; i < 3; i++) {
        const r = new Sprite(T(`fx.runner${i}`));
        r.anchor.set(0.5, 0.9);
        r.scale.set(pk * 0.95);
        parts.push(r);
        c.addChild(r);
      }
      this.L.skill.addChild(c);
      this.skv.set(fx.id, { c, parts, fx });
      sfx('skill_rush');
    } else if (fx.type === 'qr') {
      const c = new Container();
      const ring = new Sprite(T('fx.qrRing'));
      ring.anchor.set(0.5);
      c.addChild(ring);
      const parts: Sprite[] = [ring];
      const nt = this.quality === 'low' ? 6 : 12;
      for (let i = 0; i < nt; i++) {
        const t = new Sprite(T('fx.qrTile'));
        t.anchor.set(0.5);
        t.scale.set(pk * 0.5);
        t.alpha = 0;
        c.addChild(t);
        parts.push(t);
      }
      c.position.set(fx.x, fx.y);
      c.scale.set(0.2);
      gsap.to(c.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
      this.L.skill.addChild(c);
      this.skv.set(fx.id, { c, parts, fx });
      sfx('skill_qr');
    }
  }
  promoBoom(fx: SkFx & { type: 'bomb' }): void {
    const v = this.skv.get(fx.id);
    if (v) {
      v.c.destroy({ children: true });
      this.skv.delete(fx.id);
    }
    this.booms.push({ x: fx.x, y: fx.y, r: fx.r, t: 0 });
    this.ring(fx.x, fx.y, fx.r * 1.1, 0.4, 0, 0xffdc78);
    this.ring(fx.x, fx.y, fx.r * 0.7, 0.35, 0.05, 0xffffff);
    this.camera.addShake(FX.legacy.promo.shake * this.portK * (fx.isEcho ? 0.6 : 1));
    const gp = this.L.stamps.toGlobal({ x: fx.x, y: fx.y });
    this.camera.shockwave(gp.x, gp.y, fx.isEcho ? 0.7 : 1.1);
    this.parts.burst(T('fx.paper'), fx.x, fx.y, 12, { spMin: 160, spMax: 420, g: 380, life: 1.1, s0: this.portK * 1.1, s1: this.portK * 0.8, up: 200, drag: 1.2 });
    this.parts.burst(T('fx.spark'), fx.x, fx.y, 10, { spMin: 120, spMax: 360, life: 0.4, s0: 1, s1: 0.1, up: 0, blend: 'add', tint: 0xffb35e });
    this.parts.burst(T('fx.smoke'), fx.x, fx.y, 6, { spMin: 40, spMax: 140, life: 0.7, s0: 0.6 * this.portK, s1: 1.4 * this.portK, a0: 0.7, up: 30 });
    sfx('skill_promo_boom');
  }
  bounce(fx: SkFx & { type: 'jet' }): void {
    this.parts.burst(T('fx.smoke'), fx.x, fx.y, 3, { spMin: 20, spMax: 80, life: 0.4, s0: 0.3 * this.portK, s1: 0.6 * this.portK, a0: 0.7, up: 10 });
  }
  wom(x: number, y: number, r: number, n: number): void {
    this.ring(x, y, r, 0.6, 0, 0xbfe9ff);
    const ev = FX.eventText.wom as [string, string, number];
    if (n > 0) this.nums.text(x, y - 60 * this.portK, ev[0], hex(ev[1]), ev[2]);
    sfx('wom');
  }
  hot(fx: SkFx & { type: 'hot' }): void {
    const c = new Container();
    const w = new Sprite(T('fx.whirl'));
    w.anchor.set(0.5);
    w.width = w.height = fx.r * 2;
    c.addChild(w);
    c.position.set(fx.x, fx.y);
    c.alpha = 0;
    gsap.to(c, { alpha: 1, duration: 0.2 });
    this.L.skill.addChildAt(c, 0);
    this.skv.set(fx.id, { c, parts: [w], fx });
    const ev = FX.eventText.hot as [string, string, number];
    this.nums.text(fx.x, fx.y - fx.r * 0.6, ev[0], hex(ev[1]), ev[2]);
    sfx('hot');
  }
  ref(x: number, y: number, n: number): void {
    const hs = new Sprite(T('fx.handshake'));
    hs.anchor.set(0.5);
    hs.position.set(x, y - 40 * this.portK);
    hs.scale.set(0);
    this.L.labels.addChild(hs);
    gsap.to(hs.scale, { x: 1.4 * this.portK, y: 1.4 * this.portK, duration: 0.35, ease: 'back.out(3)' });
    gsap.to(hs, { alpha: 0, y: hs.y - 50, duration: 0.5, delay: 0.8, onComplete: () => hs.destroy() });
    const ev = FX.eventText.ref as [string, string, number];
    this.nums.text(x, y - 110 * this.portK, ev[0].replace('N', String(n)), hex(ev[1]), ev[2]);
    sfx('ref');
  }

  /* ── 선물·문의·아이템 ── */
  chestSpawn(c: Chest): void {
    const spr = new Sprite(T(`o.gift@${Math.min(5, Math.max(1, c.tier))}`));
    spr.anchor.set(0.5, 0.8);
    spr.scale.set(this.portK);
    const sh = new Sprite(T('o.shadow'));
    sh.anchor.set(0.5);
    sh.width = 70 * this.portK;
    sh.height = 20 * this.portK;
    sh.position.set(c.x, c.y);
    const pulse = new Sprite(circle());
    pulse.anchor.set(0.5);
    pulse.tint = 0xffd36b;
    pulse.position.set(c.x, c.y - 30 * this.portK);
    this.L.shadows.addChild(sh);
    this.L.floats.addChild(pulse);
    this.L.actors.addChild(spr);
    spr.position.set(c.x, c.y);
    spr.zIndex = c.y;
    spr.scale.set(0);
    gsap.to(spr.scale, { x: this.portK, y: this.portK, duration: 0.45, ease: 'back.out(3)' });
    this.chv.set(c.id, { spr, sh, pulse, c });
    sfx('gift_spawn');
  }
  chestOpen(c: Chest, r: Reward): void {
    const v = this.chv.get(c.id);
    if (v) {
      this.chv.delete(c.id);
      v.pulse.destroy();
      v.sh.destroy();
      gsap.to(v.spr.scale, { x: this.portK * 1.4, y: this.portK * 0.6, duration: 0.12 });
      gsap.to(v.spr, { alpha: 0, duration: 0.25, delay: 0.1, onComplete: () => v.spr.destroy() });
    }
    this.ring(c.x, c.y - 30 * this.portK, 90 * this.portK * 1.4, 0.5, 0, 0xffd36b);
    this.camera.addShake(FX.legacy.chest.shake * this.portK);
    this.parts.burst(T('fx.coin'), c.x, c.y - 30, 22, { spMin: 90, spMax: 320, g: 620, life: 0.9, s0: this.portK, s1: 0.6 * this.portK, up: 160 });
    this.parts.burst(T('fx.confetti1'), c.x, c.y - 30, 8, { spMin: 90, spMax: 260, g: 400, life: 0.9, s0: this.portK, up: 160 });
    sfx('gift_open');
    this.reward(c.x, c.y - 60 * this.portK, r);
  }
  inquirySpawn(b: Inquiry): void {
    const spr = new Sprite(T('o.inquiry'));
    spr.anchor.set(0.5);
    spr.scale.set(this.portK * 1.1 * (b.vx > 0 ? -1 : 1), this.portK * 1.1);
    const pulse = new Sprite(circle());
    pulse.anchor.set(0.5);
    pulse.tint = 0x8fd3ff;
    this.L.floats.addChild(pulse, spr);
    this.inv.set(b.id, { spr, pulse, b });
    sfx('inquiry_spawn');
  }
  inquiryPick(b: Inquiry, r: Reward): void {
    const v = this.inv.get(b.id);
    if (v) {
      this.inv.delete(b.id);
      v.pulse.destroy();
      gsap.to(v.spr.scale, { x: 0, y: 0, duration: 0.25, ease: 'back.in(2)', onComplete: () => v.spr.destroy() });
    }
    this.ring(b.x, b.y, 70 * this.portK, 0.4, 0, 0x8fd3ff);
    this.parts.burst(T('fx.dot'), b.x, b.y, 14, { spMin: 80, spMax: 240, g: 300, life: 0.7, s0: 0.5, s1: 0.2, tint: 0x9fe0a8, up: 80 });
    sfx('inquiry_pick');
    this.reward(b.x, b.y - 30 * this.portK, r);
  }
  private reward(x: number, y: number, r: Reward): void {
    const from = worldToFx(this.L.stamps, x, y);
    if (r.rev) {
      this.nums.text(x, y, '+' + fmt(r.rev), 0xffe9a8, 30);
      for (let i = 0; i < 6; i++) flyCoin('fx.coin', { x: from.x + (Math.random() - 0.5) * 50, y: from.y }, 'hud.revenue', i * 0.04, 1);
    }
    if (r.point) {
      const ev = FX.eventText.point as [string, string, number];
      this.nums.text(x, y - (r.rev ? 50 : 0), ev[0].replace('N', String(r.point)), hex(ev[1]), ev[2] * 1.2);
      for (let i = 0; i < Math.min(5, r.point); i++) flyCoin('fx.point', from, 'hud.point', i * 0.05, 1);
      sfx('point_get');
    }
    if (r.xp) this.nums.text(x, y + 40 * this.portK, '+' + fmt(r.xp), 0x9fe0a8, 22);
    if (r.item) this.hud.itemGet(r.item, r.itemNew);
  }
  itemDrop(it: FloatItem): void {
    const spr = new Sprite(T(`i.${it.item}`));
    spr.anchor.set(0.5);
    const s = (this.lot * 0.45) / Math.max(1, spr.texture.width);
    spr.scale.set(0);
    gsap.to(spr.scale, { x: s, y: s, duration: 0.4, ease: 'back.out(3)' });
    const pulse = new Sprite(circle());
    pulse.anchor.set(0.5);
    pulse.tint = 0xffffff;
    this.L.floats.addChild(pulse, spr);
    this.itv.set(it.id, { spr, pulse, it });
    sfx('item_drop');
  }
  itemPick(it: FloatItem, isNew: boolean): void {
    const v = this.itv.get(it.id);
    if (v) {
      this.itv.delete(it.id);
      v.pulse.destroy();
      gsap.to(v.spr.scale, { x: 0, y: 0, duration: 0.2, onComplete: () => v.spr.destroy() });
    }
    this.ring(it.x, it.y, 60 * this.portK, 0.4, 0, 0xffffff);
    if (!isNew) {
      const ev = FX.eventText.point as [string, string, number];
      this.nums.text(it.x, it.y - 30, ev[0].replace('N', String(F.ITEM.dupPoint)), hex(ev[1]), ev[2]);
      sfx('point_get');
    }
    this.hud.itemGet(it.item, isNew);
  }
  point(x: number, y: number, n: number, per10: boolean): void {
    const ev = (per10 ? FX.eventText.per10 : FX.eventText.point) as [string, string, number];
    this.nums.text(x, y, ev[0].replace('N', String(n)), hex(ev[1]), ev[2]);
    const from = worldToFx(this.L.stamps, x, y);
    flyCoin('fx.point', from, 'hud.point', 0.2, 1);
    sfx('point_get');
  }
  levelUp(lv: number, gained: number): void {
    this.rGold = 0.35;
    this.hud.levelUp(lv, gained);
  }
  pendingRelease(gmv: number): void {
    this.hud.pendingRelease(gmv);
  }
  matchUp(step: number, M: number): void {
    this.hud.matchUp(step, M);
    sfx('match_up', { pitch: Math.pow(2, step / 12) });
  }
  bossAppear(e: Ent): void {
    const tv = e.view as TV;
    dimScreen(0.6, 1.2);
    slowmo(0.35, 0.7);
    this.camera.punchZoom(1.06, e.x, e.y, 0.6);
    this.camera.addShake(18 * this.portK);
    const gp = this.L.stamps.toGlobal({ x: e.x, y: e.y });
    this.camera.shockwave(gp.x, gp.y, 2);
    const ev = FX.eventText.boss as [string, string, number];
    banner(ev[0], e.t.sizeLabel);
    sfx('boss_appear');
    this.hud.bossAppear();
    if (tv && tv.crown) {
      const c = tv.crown;
      gsap.to(c, { alpha: 1, duration: 0.2, delay: 0.5 });
      gsap.to(c, { y: -tv.box * 0.86, duration: 0.6, delay: 0.5, ease: 'bounce.out' });
    }
    this.ring(e.x, e.y, this.lot * 3, 0.9, 0.2, 0xffd36b, 1, true);
  }
  firstSeen(e: Ent): void {
    const tv = e.view as TV;
    if (!tv) return;
    const pk = this.portK;
    const c = new Container();
    const txt = new Text({ text: `${e.t.name} · ${e.t.sizeLabel}`, style: { fontFamily: FONT_STACK, fontSize: 30, fill: '#5c3a1a' } });
    txt.anchor.set(0.5);
    const w = txt.width + 44;
    const bg = new Graphics().roundRect(-w / 2, -26, w, 52, 26).fill(0xfff8ec).stroke({ width: 4, color: 0xffffff });
    const sh = new Graphics().roundRect(-w / 2, -20, w, 52, 26).fill(0x5c3a1a);
    const tag = new Text({ text: FX.firstSeen.label, style: { fontFamily: FONT_STACK, fontSize: 24, fill: '#ffffff', stroke: { color: '#e0553a', width: 6, join: 'round' } } });
    tag.anchor.set(0.5);
    tag.y = -42;
    c.addChild(sh, bg, txt, tag);
    tv.pillHW = Math.max(w, tag.width) / 2;
    c.scale.set(0);
    /* 첫 프레임부터 제자리(등장 지연 중에도 HUD 띠로 올라가지 않게) */
    const pp = this.pillPos(tv, e.x, e.y);
    c.position.set(pp.x, pp.y);
    this.L.labels.addChild(c);
    tv.pill = c;
    tv.pillT = FX.firstSeen.sec;
    gsap.to(c.scale, { x: pk * 0.9, y: pk * 0.9, duration: 0.4, ease: 'back.out(3)', delay: 0.3 });
    const ar = new Sprite(T('fx.arrow'));
    ar.anchor.set(0.5, 1);
    ar.scale.set(pk * 1.2);
    this.L.labels.addChild(ar);
    tv.arrow = ar;
    tv.arrowT = FX.firstSeen.sec;
    this.ring(e.x, e.y - tv.box * 0.3, this.lot * FX.firstSeen.ring, 0.6, 0.3, 0xffe066);
    sfx('target_new');
    if (e.t.grade >= 3) {
      dimScreen(FX.firstSeen.dimBig, 1.2);
      this.camera.punchZoom(FX.firstSeen.zoomBig, e.x, e.y, 0.5);
      banner(FX.firstSeen.label, `${e.t.name} · ${e.t.sizeLabel}`);
    }
  }
  tick(sec: number): void {
    sfx('lunch_tick', { pitch: sec <= 1 ? 1.5 : 1 });
    this.hud.tick(sec);
  }

  /* ── 매 프레임 ── */
  update(rt: number): void {
    this.rt += rt;
    const lunch = this.lunch;
    this.bubbleCool -= rt;
    this.slowCool -= rt;
    this.persuadeCool -= rt;
    this.updateAmbient(rt);
    const pk = this.portK;
    const logicRunning = clock.stop <= 0;
    const lack = lunch.lacking();
    /* 줌 중에도 알약·숫자가 화면 밖으로 잘리지 않게 보이는 범위를 먼저 잡음 */
    const vx = this.camera.visibleX(this.map.W);
    this.visX0 = vx.x0;
    this.visX1 = vx.x1;
    this.nums.bounds.x0 = vx.x0;
    this.nums.bounds.x1 = vx.x1;
    /* 대상 */
    const pills: { tv: TV; x: number; y: number }[] = [];
    for (const tv of this.tvs.values()) {
      const e = tv.e;
      if (tv.delay > 0) {
        tv.delay -= rt;
        continue;
      }
      if (!tv.body.visible) {
        tv.body.visible = true;
        tv.shadow.visible = true;
        this.parts.burst(T('fx.smoke'), e.x, e.y, FX.appear.dust, { spMin: 30 * pk, spMax: 110 * pk, life: 0.55, s0: 0.35 * pk, s1: 0.8 * pk, a0: 0.75, up: 20, drag: 3 });
      }
      if (tv.appear < 1) {
        const before = tv.appear;
        tv.appear = Math.min(1, tv.appear + rt / FX.appear.sec);
        if (before < 0.6 && tv.appear >= 0.6 && e.t.grade >= 2) {
          this.camera.addShake(FX.appear.bigLand.shake * pk);
          this.ring(e.x, e.y, this.lot * FX.appear.bigLand.ring, 0.45, 0, 0xffffff, 0.5);
        }
      }
      /* 위치: 폴짝 이사 보간 */
      let x = e.x;
      let y = e.y;
      let lift = 0;
      if (tv.hopT >= 0) {
        tv.hopT += rt / 0.32;
        const k = Math.min(1, tv.hopT);
        x = tv.hopFrom.x + (e.x - tv.hopFrom.x) * k;
        y = tv.hopFrom.y + (e.y - tv.hopFrom.y) * k;
        lift = Math.sin(k * Math.PI) * this.lot * 0.55;
        if (k >= 1) {
          tv.hopT = -1;
          this.parts.burst(T('fx.smoke'), e.x, e.y, 4, { spMin: 20, spMax: 60, life: 0.4, s0: 0.3 * pk, s1: 0.6 * pk, a0: 0.7, up: 10 });
        }
      } else if (e.road) {
        tv.dx += (x - tv.dx) * Math.min(1, rt * 30);
        tv.dy += (y - tv.dy) * Math.min(1, rt * 30);
        x = tv.dx;
        y = tv.dy;
      }
      /* 그림 */
      const key = this.texFor(tv);
      if (key !== tv.texKey) {
        tv.texKey = key;
        tv.spr.texture = T(key);
        tv.add.texture = tv.spr.texture;
      }
      const texW = Math.max(1, tv.spr.texture.width);
      const base = tv.box / texW;
      const ap = tv.appear;
      const pop = ap >= 1 ? 1 : ap < 0.55 ? 0.2 + (ap / 0.55) * 0.9 : 1.1 - ((ap - 0.55) / 0.45) * 0.1;
      const breathe = 1 + Math.sin(this.rt * ((Math.PI * 2) / 1.5) + tv.ph) * 0.02;
      const hitOn = e.hit > 0 && logicRunning;
      const wob = hitOn ? Math.sin(this.rt * FX.persuade.wobbleHz * Math.PI * 2 + tv.ph) * ((FX.persuade.wobbleDeg * Math.PI) / 180) : 0;
      let sx = base * pop;
      let sy = base * pop * breathe;
      const flip = e.road && e.road.ax === 'h' && e.dir > 0 ? -1 : 1;
      tv.body.position.set(x, y - lift - (1 - Math.min(1, ap * 1.6)) * this.lot * 0.25);
      tv.spr.scale.set(sx * flip, sy);
      tv.add.scale.copyFrom(tv.spr.scale);
      /* 설득받는 중: 하얗게 깜빡(피격 느낌) */
      tv.add.alpha = hitOn ? (Math.sin(this.rt * 34 + tv.ph) > 0.35 ? 0.28 : 0.06) : 0;
      tv.body.rotation = wob;
      tv.body.zIndex = y;
      /* 솔깃(입소문) 파란 틴트 */
      tv.spr.tint = e.frz > 0 ? 0xa8dcff : 0xffffff;
      /* 깜빡(수명 끝) */
      tv.body.alpha = e.warn ? (Math.sin(this.rt * FX.warn.hz * Math.PI * 2) > 0 ? 1 : 0.5) : 1;
      /* 그림자 */
      const shs = Math.min(1, ap * 1.4) * (1 - lift / (this.lot * 1.5));
      tv.shadow.position.set(x, y);
      tv.shadow.width = tv.box * 0.84 * shs;
      tv.shadow.height = tv.box * 0.24 * shs;
      /* 창 불빛 */
      for (const l of tv.lights) l.alpha = 0.55 + Math.sin(this.rt * 3 + l.x) * 0.35;
      /* 땀·설득 소리 */
      if (hitOn) {
        tv.sweatT -= rt;
        if (tv.sweatT <= 0) {
          tv.sweatT = FX.persuade.sweatEvery;
          this.parts.emit(T('fx.sweat'), { x: x + tv.box * 0.3 * (Math.random() > 0.5 ? 1 : -1), y: y - tv.box * 0.75, vx: (Math.random() - 0.5) * 40, vy: -60, g: 260, life: 0.55, s0: pk * 0.9, s1: pk * 0.7 });
        }
        if (this.persuadeCool <= 0) {
          this.persuadeCool = 0.12;
          sfx('persuade', { pitch: 1 + (1 - e.hp / e.max) * 1.2, vol: 0.12 });
        }
      }
      /* 달아나는 푸드트럭·튀어 나가는 배달 */
      if ((e.fleeing || tv.fleeT > 0) && e.road) {
        tv.fleeT -= rt;
        if (Math.random() < rt / 0.2) {
          const bx = e.road.ax === 'h' ? x - e.dir * tv.box * 0.45 : x;
          const by = e.road.ax === 'v' ? y - e.dir * tv.box * 0.45 : y - tv.box * 0.2;
          this.parts.emit(T('fx.smoke'), { x: bx, y: by, vx: 0, vy: -20, life: 0.5, s0: 0.25 * pk, s1: 0.55 * pk, a0: 0.7 });
          this.parts.emit(T('fx.streak'), { x: bx, y: by - 10, vx: 0, vy: 0, life: 0.25, s0: pk, s1: pk * 0.6, a0: 0.8, rot: e.road.ax === 'h' ? (e.dir > 0 ? 0 : Math.PI) : e.dir > 0 ? Math.PI / 2 : -Math.PI / 2 });
        }
      }
      /* 게이지 */
      if (e.damaged || e.boss) {
        const gg = this.gaugeFor(tv);
        const r = Math.max(0, e.hp / e.max);
        gg.ghostR += (r - gg.ghostR) * (1 - Math.pow(1 - FX.persuade.ghostLerp, rt * 60));
        if (gg.ghostR < r) gg.ghostR = r;
        const k = gg.c.scale.x;
        const fw = gg.w / k;
        gg.fill.width = Math.max(16, fw * r);
        gg.fill.visible = r > 0.001;
        gg.ghost.width = Math.max(16, fw * gg.ghostR);
        gg.fill.tint = e.boss ? 0xff8fab : hitOn ? 0xffd36b : 0x7dff8a;
        gg.c.position.set(x - gg.w / 2, y - tv.box * 0.8 - 14 * pk - gg.h - lift);
        gg.c.alpha = Math.min(1, ap * 2);
      }
      /* 배지: 수명 시계·솔깃 */
      if (e.warn && !tv.clock) {
        tv.clock = new Sprite(T('fx.clock'));
        tv.clock.anchor.set(0.5);
        tv.clock.scale.set(pk);
        this.L.gauges.addChild(tv.clock);
      }
      if (tv.clock) {
        tv.clock.visible = e.warn;
        tv.clock.position.set(x + tv.box * 0.42, y - tv.box * 0.72);
      }
      if (e.frz > 0 && !tv.wmark) {
        tv.wmark = new Sprite(T('fx.womMark'));
        tv.wmark.anchor.set(0.5, 1);
        tv.wmark.scale.set(pk);
        this.L.gauges.addChild(tv.wmark);
      }
      if (tv.wmark) {
        tv.wmark.visible = e.frz > 0;
        tv.wmark.position.set(x, y - tv.box * 0.85 - 18 * pk + Math.sin(this.rt * 6) * 3);
      }
      /* 새 거래처 알약·화살표(알약 자리는 루프 뒤에 서로 겹치지 않게 한꺼번에 잡음) */
      const pp = this.pillPos(tv, x, y);
      const pillLow = pp.low;
      if (tv.pill) {
        tv.pillT -= rt;
        pills.push({ tv, x: pp.x, y: pp.y });
        if (tv.pillT <= 0) {
          const p = tv.pill;
          tv.pill = null;
          gsap.to(p, { alpha: 0, duration: 0.25, onComplete: () => p.destroy({ children: true }) });
        }
      }
      if (tv.arrow) {
        tv.arrowT -= rt;
        tv.arrow.visible = !pillLow;
        tv.arrow.position.set(x, y - tv.box * 0.8 - 130 * pk - Math.abs(Math.sin(this.rt * 7)) * 16 * pk);
        if (tv.arrowT <= 0) {
          tv.arrow.destroy();
          tv.arrow = null;
        }
      }
      /* 매칭 부족 쪽: 살짝 들썩 */
      if (lack && e.t.side === lack && !e.boss && ap >= 1) tv.body.y -= Math.abs(Math.sin(this.rt * 5 + tv.ph)) * 3 * pk;
    }
    this.placePills(pills, rt);
    /* 퇴장 애니메이션 */
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const tv = this.dying[i];
      tv.leaveT += rt;
      const e = tv.e;
      const base = tv.box / Math.max(1, tv.spr.texture.width);
      const flip = e.road && e.road.ax === 'h' && e.dir > 0 ? -1 : 1;
      let done = false;
      if (tv.state === 'signed') {
        const key = this.texFor(tv);
        if (key !== tv.texKey) {
          tv.texKey = key;
          tv.spr.texture = T(key);
          tv.add.texture = tv.spr.texture;
        }
        const t = tv.leaveT;
        tv.flash = Math.max(0, 1 - t / 0.15);
        tv.add.alpha = tv.flash;
        let sq = 1;
        if (t < 0.08) sq = 1 + (t / 0.08) * 0.15;
        else if (t < 0.2) sq = 1.15 - ((t - 0.08) / 0.12) * 0.3;
        else if (t < 0.32) sq = 0.85 + ((t - 0.2) / 0.12) * 0.15;
        const t2 = t - 0.57;
        let s = 1;
        let up = 0;
        if (t2 > 0) {
          const k = Math.min(1, t2 / 0.35);
          s = 1 - k;
          up = k * tv.box * 0.5;
          if (k >= 1) done = true;
          if (!tv.popped) {
            tv.popped = true;
            if (tv.gauge) tv.gauge.c.visible = false;
            for (let h = 0; h < 2 + (Math.random() < 0.5 ? 1 : 0); h++)
              this.parts.emit(T('fx.heart'), { x: e.x + (Math.random() - 0.5) * tv.box * 0.5, y: e.y - tv.box * 0.6, vx: (Math.random() - 0.5) * 60, vy: -90 - Math.random() * 50, life: 0.9, s0: this.portK * 0.9, s1: this.portK * 0.6, a0: 1 });
            this.parts.burst(T('fx.smoke'), e.x, e.y, 5, { spMin: 30, spMax: 90, life: 0.5, s0: 0.35 * this.portK, s1: 0.8 * this.portK, a0: 0.7, up: 15 });
          }
        }
        tv.spr.scale.set(base * (2 - sq) * s * flip, base * sq * s);
        tv.add.scale.copyFrom(tv.spr.scale);
        tv.body.position.set(e.x, e.y - up);
        tv.body.rotation = 0;
        tv.body.alpha = 1;
        tv.shadow.width = tv.box * 0.84 * s;
        tv.shadow.height = tv.box * 0.24 * s;
        if (tv.gauge) {
          const r = 0;
          tv.gauge.fill.visible = r > 0;
          tv.gauge.ghostR += (0 - tv.gauge.ghostR) * Math.min(1, rt * 8);
          tv.gauge.ghost.width = Math.max(16, (tv.gauge.w / tv.gauge.c.scale.x) * tv.gauge.ghostR);
        }
      } else if (tv.state === 'miss') {
        const k = Math.min(1, tv.leaveT / FX.leave.missSec);
        tv.spr.scale.set(base * (1 - k) * flip, base * (1 - k));
        tv.body.alpha = 1 - k * 0.5;
        tv.shadow.width = tv.box * 0.84 * (1 - k);
        if (k >= 1) done = true;
      } else done = true;
      if (done) {
        this.dying.splice(i, 1);
        this.destroyTV(tv);
      }
    }
    /* 번개 */
    this.boltG.clear();
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += rt;
      const a = 1 - b.t / b.life;
      if (a <= 0) {
        b.glows.forEach((g) => g.destroy());
        this.bolts.splice(i, 1);
        continue;
      }
      const layers: [number, number, number][] = [
        [14, 0x8cdcff, a * 0.5],
        [7, 0xd2f0ff, a],
        [3, 0xffffff, a],
      ];
      const jit = b.pts.map((p, j) => (j ? { x: p.x + (Math.random() * 18 - 9), y: p.y + (Math.random() * 18 - 9) } : p));
      for (const [w, col, al] of layers) {
        this.boltG.moveTo(jit[0].x, jit[0].y);
        for (let j = 1; j < jit.length; j++) {
          const p0 = jit[j - 1];
          const p1 = jit[j];
          const mx = (p0.x + p1.x) / 2 + (Math.random() - 0.5) * 30;
          const my = (p0.y + p1.y) / 2 + (Math.random() - 0.5) * 30;
          this.boltG.lineTo(mx, my).lineTo(p1.x, p1.y);
        }
        this.boltG.stroke({ width: w * this.portK, color: col, alpha: al, cap: 'round', join: 'round' });
      }
      b.glows.forEach((g) => (g.alpha = a));
    }
    /* 프로모션 폭발 원 */
    this.boomG.clear();
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += rt;
      const k = b.t / 0.35;
      if (k >= 1) {
        this.booms.splice(i, 1);
        continue;
      }
      this.boomG.circle(b.x, b.y, b.r * (0.4 + k * 0.7)).fill({ color: 0xffaa3c, alpha: 0.45 * (1 - k) });
      this.boomG.circle(b.x, b.y, b.r * (0.5 + k * 0.6)).stroke({ width: 14 - 11 * k, color: 0xffdc78, alpha: 1 - k });
    }
    /* 스킬 효과 */
    const live = new Set(lunch.fx.map((f) => f.id));
    for (const [id, v] of this.skv) {
      const fx = v.fx;
      if (!live.has(id)) {
        if (fx.type !== 'bomb') {
          const c = v.c;
          gsap.to(c, { alpha: 0, duration: 0.2, onComplete: () => c.destroy({ children: true }) });
        }
        this.skv.delete(id);
        continue;
      }
      if (fx.type === 'bomb') {
        const left = Math.max(0, fx.fuse - fx.t);
        if (v.txt) v.txt.text = fx.isEcho ? '' : String(Math.ceil(left));
        v.c.rotation = Math.sin(this.rt * 20) * 0.05 * (1 + (1 - left / fx.fuse) * 2);
        if (Math.random() < rt * 12) this.parts.emit(T('fx.spark'), { x: fx.x + 20 * this.portK, y: fx.y - 95 * this.portK, vx: (Math.random() - 0.5) * 80, vy: -60, life: 0.25, s0: 0.5, s1: 0.1, blend: 'add', tint: 0xffb35e });
      } else if (fx.type === 'jet') {
        fx.trail.unshift({ x: fx.x, y: fx.y });
        if (fx.trail.length > 24) fx.trail.length = 24;
        v.parts.forEach((r, j) => {
          const p = fx.trail[Math.min(fx.trail.length - 1, j * 7)];
          r.position.set(p.x, p.y);
          r.scale.x = Math.abs(r.scale.y) * (fx.vx > 0 ? -1 : 1);
          r.rotation = Math.sin(this.rt * 18 + j) * 0.12;
          r.zIndex = p.y;
        });
        if (Math.random() < rt * 20) this.parts.emit(T('fx.smoke'), { x: fx.x, y: fx.y, vx: -fx.vx * 0.1, vy: -20, life: 0.35, s0: 0.2 * this.portK, s1: 0.45 * this.portK, a0: 0.6 });
        if (Math.random() < rt * 14) this.parts.emit(T('fx.streak'), { x: fx.x - fx.vx * 0.06, y: fx.y - 30 * this.portK, life: 0.2, s0: this.portK, s1: this.portK * 0.5, a0: 0.7, rot: Math.atan2(fx.vy, fx.vx) });
      } else if (fx.type === 'qr') {
        v.c.position.set(fx.x, fx.y);
        const ring = v.parts[0];
        ring.width = ring.height = fx.r * 2;
        ring.rotation += rt * 0.8;
        const k = fx.t / fx.life;
        v.c.alpha = k > 0.85 ? (1 - k) / 0.15 : 1;
        for (let j = 1; j < v.parts.length; j++) {
          const t = v.parts[j];
          const a = (j / (v.parts.length - 1)) * Math.PI * 2 + this.rt * 0.6;
          const rr = fx.r * (0.25 + ((j * 37) % 60) / 100);
          t.position.set(Math.cos(a) * rr, Math.sin(a) * rr);
          t.alpha = Math.max(0, Math.sin(this.rt * 9 + j * 1.7)) * 0.9;
        }
      } else if (fx.type === 'hot') {
        v.parts[0].rotation += rt * 4;
        const k = fx.t / fx.life;
        v.c.alpha = k > 0.8 ? (1 - k) / 0.2 : Math.min(1, fx.t * 5);
        if (Math.random() < rt * 30) {
          const a = Math.random() * Math.PI * 2;
          const rr = fx.r * (0.8 + Math.random() * 0.3);
          this.parts.emit(T('fx.dot'), { x: fx.x + Math.cos(a) * rr, y: fx.y + Math.sin(a) * rr, vx: -Math.cos(a) * rr * 2 + Math.sin(a) * 120, vy: -Math.sin(a) * rr * 2 - Math.cos(a) * 120, life: 0.45, s0: 0.35, s1: 0.1, tint: 0xd6b8ff });
        }
      }
    }
    /* 선물·문의·아이템 */
    for (const [, v] of this.chv) {
      const c = v.c;
      v.pulse.width = v.pulse.height = (52 + Math.sin(this.rt * 5) * 8) * this.portK;
      v.pulse.alpha = 0.55 + Math.sin(this.rt * 5) * 0.25;
      v.spr.rotation = Math.sin(this.rt * 4 + c.id) * 0.06;
      v.spr.alpha = c.t > 14 ? (Math.sin(this.rt * 30) > 0 ? 1 : 0.4) : 1;
    }
    for (const [id, v] of this.chv) if (!lunch.chests.some((c) => c.id === id)) {
      v.spr.destroy();
      v.sh.destroy();
      v.pulse.destroy();
      this.chv.delete(id);
    }
    for (const [id, v] of this.inv) {
      const b = v.b;
      if (!lunch.inquiries.some((q) => q.id === id)) {
        v.spr.destroy();
        v.pulse.destroy();
        this.inv.delete(id);
        continue;
      }
      const bob = Math.sin(this.rt * 3 + b.id) * 10 * this.portK;
      v.spr.position.set(b.x, b.y + bob);
      v.spr.rotation = Math.sin(this.rt * 2 + b.id) * 0.12;
      v.pulse.position.set(b.x, b.y + bob);
      v.pulse.width = v.pulse.height = (44 + Math.sin(this.rt * 5) * 6) * this.portK;
      v.pulse.alpha = 0.45 + Math.sin(this.rt * 5) * 0.2;
    }
    for (const [id, v] of this.itv) {
      const it = v.it;
      if (!lunch.items.some((q) => q.id === id)) {
        v.spr.destroy();
        v.pulse.destroy();
        this.itv.delete(id);
        continue;
      }
      v.spr.position.set(it.x, it.y);
      v.spr.rotation = Math.sin(this.rt * 3) * 0.15;
      v.pulse.position.set(it.x, it.y);
      v.pulse.width = v.pulse.height = this.lot * 0.48 + Math.sin(this.rt * 6) * 4;
      v.pulse.alpha = 0.55;
    }
    /* 반경 */
    this.rAppear = Math.min(1, this.rAppear + rt / 0.3);
    this.rGold = Math.max(0, this.rGold - rt);
    const R = lunch.R * (this.rAppear < 1 ? 0.3 + this.rAppear * 0.7 : 1);
    const anyIn = lunch.ents.some((e) => e.inR);
    const pulse = anyIn ? 1 + (Math.sin(this.rt * FX.radius.pulseHz * Math.PI * 2) * 0.5 + 0.5) * (FX.radius.pulseScale - 1) : 1;
    this.radiusC.position.set(lunch.net.x, lunch.net.y);
    this.radiusC.alpha = this.rAppear;
    this.rDisk.width = this.rDisk.height = R * 2 * pulse;
    this.rDisk.rotation += rt * ((FX.radius.dashRotDegPerSec * Math.PI) / 180);
    this.rDisk.tint = this.rGold > 0 ? 0xffd36b : anyIn ? 0xffe28a : 0xffffff;
    this.rShadow.width = this.rShadow.height = R * 2 * pulse;
    this.rShadow.rotation = this.rDisk.rotation;
    this.rShadow.position.set(0, 3 * pk);
    this.rGlow.width = this.rGlow.height = R * 2.3 * pulse;
    this.rGlow.alpha = (anyIn ? 0.1 + Math.sin(this.rt * 6) * 0.03 : 0) + (this.rGold > 0 ? 0.25 : 0);
    this.touchG.clear();
    if (this.touch) {
      const x0 = lunch.net.x;
      const y0 = lunch.net.y + R;
      const x1 = this.finger.x;
      const y1 = this.finger.y;
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len > 4 && y1 > y0) {
        const n = Math.floor(len / 10);
        for (let i = 0; i < n; i++) {
          const a = i / n;
          const b = Math.min(1, a + 4 / len);
          this.touchG.moveTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a).lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
        }
        this.touchG.stroke({ width: 3, color: 0xffffff, alpha: 0.85 });
        this.touchG.circle(x1, y1, 10).fill({ color: 0xffffff, alpha: 0.35 });
      }
    }
    /* 판교 어둠 */
    if (this.darkHole && this.darkG) {
      const r = lunch.R * 3.4;
      this.darkHole.position.set(lunch.net.x, lunch.net.y);
      this.darkHole.width = this.darkHole.height = r * 2;
      const m = this.map;
      const pad = 400;
      const x0 = lunch.net.x - r;
      const x1 = lunch.net.x + r;
      const y0 = lunch.net.y - r;
      const y1 = lunch.net.y + r;
      this.darkG.clear();
      const col = { color: 0x0a0f2a, alpha: 0.82 };
      this.darkG.rect(-pad, -pad, m.W + pad * 2, Math.max(0, y0 + pad)).fill(col);
      this.darkG.rect(-pad, y1, m.W + pad * 2, Math.max(0, m.H + pad - y1)).fill(col);
      this.darkG.rect(-pad, y0, Math.max(0, x0 + pad), y1 - y0).fill(col);
      this.darkG.rect(x1, y0, Math.max(0, m.W + pad - x1), y1 - y0).fill(col);
    }
    this.parts.update(rt);
    this.nums.update(rt);
    this.updateStamps(rt);
    this.updateBubbles(rt);
    this.camera.update(rt);
    markFx();
  }

  /**
   * 새 거래처 알약 자리: 대상 위. HUD 띠(지도 영역 위)에 걸리면 대상 아래로(화살표는 숨김).
   * 가로는 화면(지도 폭) 안으로 밀어 넣는다(가장자리 부지·지도 밖에서 들어오는 도로형 대상도 글자가 잘리지 않게).
   */
  private pillPos(tv: TV, x: number, y: number): { x: number; y: number; low: boolean } {
    const pk = this.portK;
    const up = y - tv.box * 0.8 - 80 * pk;
    const low = up - 78 * pk < this.map.area.y;
    return { x: this.clampPillX(tv, x, pk * 0.9), y: low ? y + 44 * pk : up, low };
  }
  private clampPillX(tv: TV, x: number, scale: number): number {
    const hw = tv.pillHW * scale + 8 * this.portK;
    const x0 = this.visX0;
    const x1 = this.visX1 > x0 ? this.visX1 : this.map.W;
    if (hw <= 0 || x1 - x0 < hw * 2) return x;
    return Math.max(x0 + hw, Math.min(x1 - hw, x));
  }
  /**
   * 떠 있는 새 거래처 알약끼리 겹치면 나중 것을 빈 자리(위·아래 한 칸씩, 그다음 옆)로 옮긴다
   * (판 후반 새 거래처가 몰릴 때 이름표가 깔리지 않게). 빈 자리가 없으면 가장 덜 겹치는 자리.
   */
  private placePills(list: { tv: TV; x: number; y: number }[], rt: number): void {
    if (!list.length) return;
    const s = this.portK * 0.9;
    /* 알약 위아래 끝(태그 '새 거래처!' 포함) + 등장 때 튀는 만큼 여유 */
    const top = 60 * s * 1.1;
    const bot = 32 * s * 1.1;
    const hh = top + bot + 8 * s;
    const minY = this.map.area.y + top;
    const maxY = this.map.H - bot;
    list.sort((a, b) => a.tv.e.id - b.tv.e.id);
    const placed: { x: number; y: number; hw: number }[] = [];
    for (const p of list) {
      const hw = p.tv.pillHW * s * 1.1;
      const over = (x: number, y: number) => {
        let n = 0;
        for (const q of placed) if (Math.abs(q.x - x) < q.hw + hw + 8 * s && Math.abs(q.y - y) < hh) n++;
        return n;
      };
      let bx = p.x;
      let by = p.y;
      let bn = over(bx, by);
      if (bn > 0) {
        search: for (const dxk of [0, 1, -1]) {
          for (const k of [1, -1, 2, -2, 3, -3]) {
            const xx = this.clampPillX(p.tv, p.x + dxk * (hw * 2 + 12 * s), s * 1.1);
            const yy = p.y + (dxk === 0 ? k * hh : (k > 0 ? k - 1 : k) * hh);
            if (yy < minY || yy > maxY) continue;
            const o = over(xx, yy);
            if (o < bn) {
              bn = o;
              bx = xx;
              by = yy;
              if (o === 0) break search;
            }
          }
        }
      }
      placed.push({ x: bx, y: by, hw });
      const pill = p.tv.pill;
      if (!pill || pill.destroyed) continue;
      /* 처음 뜰 때(아직 커지는 중)는 제자리, 그 뒤 자리를 옮길 때는 부드럽게 */
      const k = pill.scale.x < s * 0.5 ? 1 : Math.min(1, rt * 12);
      const tx = this.clampPillX(p.tv, bx, Math.max(s, pill.scale.x));
      pill.position.set(pill.x + (tx - pill.x) * k, pill.y + (by - pill.y) * k);
    }
  }

  private destroyTV(tv: TV): void {
    killDeep(tv.body);
    killDeep(tv.pill);
    tv.body.destroy({ children: true });
    tv.shadow.destroy();
    tv.gauge?.c.destroy({ children: true });
    tv.clock?.destroy();
    tv.wmark?.destroy();
    tv.pill?.destroy({ children: true });
    tv.arrow?.destroy();
  }

  destroy(): void {
    gsap.killTweensOf(this.camera);
    killDeep(this.root);
    for (const tv of this.tvs.values()) this.destroyTV(tv);
    for (const tv of this.dying) this.destroyTV(tv);
    this.tvs.clear();
    this.dying = [];
    this.camera.destroy();
    this.root.destroy({ children: true });
  }
}

export function tierOf(id: string): number {
  return TIER_OF[id] ?? 0;
}
export type { TargetDef };
void ROAD_KEYS;

/**
 * 영업 그림(PixiJS). 로직(Lunch)이 알려 주는 사건을 받아 연출한다. 층 순서는 설계서 8-4.
 *  바닥 → 도로 → 그림자 → 배우(y 정렬: 장식·대상·선물·보행자·차) → 구름 그림자 → 설득 게이지 → 스킬 효과 → 문의·아이템
 *  → 판교 어둠·세종 꽃잎 → 영업 반경 → 파티클 → 숫자 → 도장·말풍선 → (화면) 번쩍·비네트
 */
import { BitmapText, Container, Graphics, NineSliceSprite, Point, RenderTexture, Sprite, Text, type Renderer, type Texture } from 'pixi.js';
import gsap from 'gsap';
import { FONT_STACK } from '../../fonts';
import type { MapLayers } from '../contracts';
import { CONTRACT_FX, DISTRICT_BY, FX, TARGETS, type SkillId, type TargetDef } from '../data';
import { sfx, music, audio } from '../deps';
import { fmt } from '../format';
import { clock, hitstop, slowmo } from '../core/clock';
import { EV_BASE, EV_FONT, NUM_BASE, NUM_FONT } from '../core/fonts';
import { unlockedTargets } from '../rules';
import { breath } from '../map/today';
import { view, worldToFx } from '../core/stage';
import { budget, type TierBudget } from '../core/quality';
import { hudVersion, onHudResize } from '../../ui/hud';
import { T, circle, pill, setTint } from '../core/tex';
import { detachCached, releaseText, takeText } from '../core/textcache';
import { Camera } from '../fx/camera';
import { Numbers, type KeepOut } from '../fx/numbers';
import { Particles } from '../fx/particles';
import { banner, bannerRects, climax, confetti, dimScreen, fireworks, flyCoin, holdLevelUp, type HudId } from '../fx/top';
import { S } from '../state';
import type { Chest, ContractResult, Ent, FloatItem, Inquiry, Lunch, LunchEvents, Reward, SkFx } from './logic';
import type { MapPt } from '../data';
import { cumLen, offsetLine, poseAt, type Pose } from '../map/geom';
import { roadAxis } from '../map/route';

/** 차·보행자 위치 계산 임시 객체 */
const AMB: Pose = { x: 0, y: 0, tx: 1, ty: 0 };

export interface HudHooks {
  skillFired(sk: SkillId): void;
  matchUp(step: number, M: number): void;
  portrait(kind: 'nod' | 'cheer'): void;
  itemGet(id: string, isNew: boolean): void;
  levelUp(lv: number, gained: number): void;
  /** 결제 대기가 풀림: gmv = 풀린 거래액, comm = 그만큼 들어온 수수료 매출 */
  pendingRelease(gmv: number, comm: number): void;
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
  /** 그림 key 표(매 프레임 문자열을 새로 만들지 않게) · 지금 틴트 */
  keys: TexKeys;
}
interface TexKeys { idle: string; hit: string; happy: string; blink: string; up: string; down: string }
const KEYS = new Map<string, TexKeys>();
function keysOf(id: string): TexKeys {
  let k = KEYS.get(id);
  if (!k) {
    const b = `t.${id}@`;
    k = { idle: b + 'idle', hit: b + 'hit', happy: b + 'happy', blink: b + 'blink', up: b + 'up', down: b + 'down' };
    KEYS.set(id, k);
  }
  return k;
}
interface Stamp { c: Container; ink: Sprite; ring: Sprite; txt: Text; t: number; s: number; rot: number; x: number; y: number; alive: boolean; boss?: boolean }
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
/** 도장 지름 최소(화면 CSS px). 폰 세로처럼 지도가 작게 보일 때도 '영업 성공!' 두 줄이 한 줄 약 13px 로 읽히게 */
const STAMP_MIN_PX = 50;
/** 도장 테 바깥 반지름 ÷ 그림 폭(fx.stamp 300 기준 바깥 원 141) */
const STAMP_R = 0.47;
/** 도장 글자 모양 */
const STAMP_STYLE = { fontFamily: FONT_STACK, fontSize: 80, lineHeight: 78, align: 'center' as const, fill: FX.stamp.color, stroke: { color: '#ffffff', width: 9, join: 'round' as const }, letterSpacing: -2 };
/** 말풍선 글자 모양 */
const BUBBLE_STYLE = { fontFamily: FONT_STACK, fontSize: 30, fill: '#5c3a1a' };
/** 새 거래처 알약 글자 모양 */
const FS_NAME = { fontFamily: FONT_STACK, fontSize: 30, fill: '#5c3a1a' };
const FS_TAG = { fontFamily: FONT_STACK, fontSize: 24, fill: '#ffffff', stroke: { color: '#e0553a', width: 6, join: 'round' as const } };
/** 새 거래처 알약 치우기: 캐시 글자는 떼어 두고 나머지만 부숨 */
function dropPill(p: Container): void {
  if (p.destroyed) return;
  detachCached(p);
  p.destroy({ children: true });
}
/**
 * 움직이는 것의 앞뒤(y) 순서: zIndex 를 매 프레임 y 로 쓰면 값이 바뀔 때마다 Pixi 가 그 묶음의 그리기 목록을 새로 짬(순서가 그대로여도).
 * y 는 따로 적어 두고(setZ), 실제 순서가 어긋난 프레임에만 zIndex 를 한꺼번에 맞춤(sortByZ) — 그리는 순서는 예전과 같음
 */
type ZC = Container & { zy?: number };
/** 이미 빈 Graphics 는 다시 비우지 않음(비울 때마다 Pixi 가 GPU 데이터를 다시 만들고 그 층 그리기 목록을 새로 짬) */
function clearG(g: Graphics): void {
  if (g.context.instructions.length) g.clear();
}

/** 층에서 떼지 않고 안 보이게(알파 0 · 크기 0): 다시 쓸 때 알파·크기를 다시 넣음 */
function park(o: Container): void {
  o.alpha = 0;
  o.scale.set(0);
}
function setZ(o: Container, y: number): void {
  (o as ZC).zy = y;
}
function sortByZ(layer: Container): void {
  const ch = layer.children as ZC[];
  let prev = -Infinity;
  for (let i = 0; i < ch.length; i++) {
    const k = ch[i].zy ?? ch[i].zIndex;
    if (k < prev) {
      for (const c of ch) if (c.zy !== undefined) c.zIndex = c.zy;
      return;
    }
    prev = k;
  }
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
  /** 차·보행자: 곡선 길(차선·보도 선)을 길이 s 로 따라감 */
  private cars: { sp: Sprite; path: MapPt[]; cum: number[]; s: number; dir: 1 | -1; v: number; key: string; ax: 'h' | 'v' | ''; sd: number }[] = [];
  private walkers: { sp: Sprite; path: MapPt[]; cum: number[]; s: number; dir: 1 | -1; v: number; key: string; ph: number; ka: string; kb: string; fr: string }[] = [];
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
  /** 화질 등급 예산(설계서 7장 9·10): 연출 개수만 줄이고 규칙·수치는 그대로 */
  private bud: TierBudget;
  /* 매 프레임 다시 쓰는 임시 값(설계서 7장 11: 새 객체 줄이기) */
  private tmpA = new Point();
  private tmpB = new Point();
  private pillBuf: { tv: TV; x: number; y: number }[] = [];
  private liveFx = new Set<number>();
  private avoidBuf: KeepOut[] = [];
  private stampMax(): number {
    return Math.min(FX.stamp.maxOnScreen, this.bud.stamps);
  }
  /** 영업 중 화질이 바뀜(자동 낮춤): 바로 줄일 수 있는 것만 — 파티클·숫자·도장·필터·흔들림. 차·보행자 수는 다음 영업일부터 */
  applyBudget(b: TierBudget): void {
    this.bud = b;
    this.parts.budget = Math.min(FX.budget.particles, b.particles);
    this.nums.max = Math.min(FX.budget.numbers, b.numbers);
    this.camera.maxWaves = Math.min(FX.budget.filtersMax, b.waves);
    this.camera.shakeK = b.shake;
    if (!b.ambient) for (const g of this.glints) g.sp.alpha = 0.5;
  }

  /**
   * 와이프가 덮고 있는 동안 미리 그려 둠(설계서 7장 · 7-추가 로딩): 첫 계약·첫 새 거래처·첫 말풍선 프레임에 생기던 긴 작업
   * (글자 텍스처 만들기·그림 첫 GPU 업로드·셰이더 준비)을 영업 시작 전으로 옮긴다. 작은 렌더 타깃에 몇 개씩 나눠 그린다.
   * 글자는 textcache 에 남아 다음 영업일에도 그대로 쓴다(두 번째 영업일부터는 거의 할 일 없음)
   */
  async warm(renderer: Renderer): Promise<void> {
    const rt = RenderTexture.create({ width: 8, height: 8 });
    const box = new Container();
    const own: Container[] = [];
    const draw = (objs: Container[]) => {
      for (const o of objs) box.addChild(o);
      try {
        renderer.render({ container: box, target: rt, clear: true });
      } catch {
        /* 무시 */
      }
      detachCached(box);
      box.removeChildren();
    };
    try {
      /* 지도 전체(바닥·도로 큰 텍스처 업로드, 스프라이트·그래픽 셰이더) */
      try {
        renderer.render({ container: this.root, target: rt, clear: true });
      } catch {
        /* 무시 */
      }
      await breath();
      const ts = unlockedTargets();
      const texts: Container[] = [takeText('stamp', String(FX.stamp.text).replace(' ', '\n'), STAMP_STYLE), takeText('fs-tag', FX.firstSeen.label, FS_TAG)];
      for (const t of ts) texts.push(takeText('bubble', `${t.name} 계약!`, BUBBLE_STYLE), takeText('fs-name', `${t.name} · ${t.sizeLabel}`, FS_NAME));
      const bt = [new BitmapText({ text: '+0123456789원', style: { fontFamily: NUM_FONT, fontSize: NUM_BASE } }), new BitmapText({ text: 'LEVEL UP! 대박', style: { fontFamily: EV_FONT, fontSize: EV_BASE } })];
      const sp = [new Sprite(circle()), new Sprite(pill())];
      own.push(...bt, ...sp);
      draw([...bt, ...sp]);
      /* 그림 묶음(아틀라스)은 art.loadAll 이 이미 GPU 에 올려 둠 */
      for (let i = 0; i < texts.length; i += 3) {
        draw(texts.slice(i, i + 3));
        await breath();
      }
    } finally {
      for (const o of own) o.destroy();
      box.destroy();
      rt.destroy(true);
    }
  }

  constructor(map: MapLayers, ground: Texture, roads: Texture, public hud: HudHooks) {
    this.map = map;
    this.lot = map.lot;
    this.portK = map.lot / 129;
    this.dark = !!DISTRICT_BY[map.district].mod.dark;
    this.bud = budget();
    this.parts = new Particles(Math.min(FX.budget.particles, this.bud.particles), true);
    this.nums = new Numbers(Math.min(FX.budget.numbers, this.bud.numbers));
    this.nums.scale = map.orient === 'port' ? FX.number.portScale : 1;
    this.nums.merge = S.settings.mergeNumbers;
    this.nums.bounds = { x0: 0, x1: map.W, y0: map.area.y - 10, y1: map.H };
    this.camera = new Camera();
    this.camera.reduce = S.settings.reduceShake;
    this.camera.maxWaves = Math.min(FX.budget.filtersMax, this.bud.waves);
    this.camera.shakeK = this.bud.shake;
    const Ls = this.L;
    this.root.addChild(this.camera.cam);
    /* 도장은 숫자 아래(금액이 도장에 덮이지 않게), 말풍선·새 거래처 알약은 맨 위 */
    this.camera.cam.addChild(Ls.ground, Ls.roads, Ls.shadows, Ls.actors, Ls.clouds, Ls.gauges, Ls.skill, Ls.floats, Ls.dark, Ls.radius, Ls.parts, Ls.stamps, Ls.nums, Ls.labels);
    Ls.actors.sortableChildren = true;
    /*
     * 자주 바뀌는 층은 따로 묶음(Pixi render group, 설계서 7장): 생기고 사라지는 것이 많은 층(대상·차·보행자 / 파티클 / 숫자)과
     * 매 프레임 다시 그리는 Graphics 가 있는 층(어둠 가림 / 반경·손가락 선).
     * Pixi 는 보이기·순서가 바뀌거나 작은 Graphics 를 다시 그릴 때마다 그 묶음 전체의 그리기 목록을 새로 짜는데, 세계 전체가 한 묶음이라
     * 영업 내내 프레임마다 지도·도장·알약까지 다시 훑었음(측정: 426프레임 중 429번). 그림 순서·모양은 그대로
     */
    /* 묶음 경계마다 그리기 호출이 하나씩 끊기므로 비어 있기 쉬운 층은 뺌: 어둠 가림은 어두운 상권에서만, 스킬 번개·폭발(쓰는 동안만 다시 그림)은 묶지 않음 */
    for (const c of [Ls.actors, Ls.radius, Ls.parts, Ls.nums]) c.isRenderGroup = true;
    if (this.dark) Ls.dark.isRenderGroup = true;
    /*
     * 세계 묶음에 남아 있던 층 가운데 물체가 많고 자주 바뀌는 두 층도 따로 묶음: 그림자(대상 등장·퇴장) · 게이지(설득 시작·시계·솔깃 배지, 대상마다 나인슬라이스 3장).
     * 후반 측정에서 세계 묶음이 537프레임 중 493번 다시 짜였고 그 물체 대부분이 이 두 층이었음. 도장·말풍선·스킬 효과처럼 물체가 적은 층은
     * 세계 묶음에 둠(묶음마다 그리기 호출·전역 유니폼이 하나씩 늘어 오히려 손해 — 여섯 층을 묶어 본 측정에서 그리기 +4, 렌더 시간 그대로).
     * 그리는 순서·모양은 같음
     */
    for (const c of [Ls.shadows, Ls.gauges]) c.isRenderGroup = true;
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
    /* 장식: 생성 지도는 바닥 텍스처에 구워 넣음(설계서 5-5). 옛 고정 지도만 스프라이트로 */
    if (!map.streets) for (const d of map.decor) {
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
    const nCars = this.bud.cars;
    for (let i = 0; i < nCars && m.routes.length; i++) {
      const rt = m.routes[i % m.routes.length];
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const key = `a.car${i % 4}`;
      const sp = new Sprite(T(`${key}@${rt.ax}`));
      sp.anchor.set(0.5);
      sp.scale.set(pk);
      /* 오른쪽 차선(진행 방향 오른쪽으로 0.17 도로 폭) */
      const path = offsetLine(rt.pts, m.road * 0.17 * dir);
      const cum = cumLen(path);
      this.cars.push({ sp, path, cum, s: Math.random() * cum[cum.length - 1], dir, v: (70 + Math.random() * 60) * m.U, key, ax: '', sd: 0 });
      this.L.actors.addChild(sp);
    }
    const nW = this.bud.walkers;
    const walks = (m.streets || []).filter((s) => !s.stub);
    for (let i = 0; i < nW && walks.length; i++) {
      const st = walks[i % walks.length];
      const side = i % 2 ? 1 : -1;
      const path = offsetLine(st.pts, side * st.w * 0.41);
      const cum = cumLen(path);
      const key = `a.walker${i % 4}`;
      const sp = new Sprite(T(`${key}@a`));
      sp.anchor.set(0.5, 1);
      sp.scale.set(pk * 0.95);
      this.walkers.push({ sp, path, cum, s: Math.random() * cum[cum.length - 1], dir: Math.random() < 0.5 ? 1 : -1, v: (22 + Math.random() * 14) * m.U, key, ph: Math.random() * 6, ka: `${key}@a`, kb: `${key}@b`, fr: 'a' });
      this.L.actors.addChild(sp);
    }
    for (let i = 0; i < this.bud.cloudShadows; i++) {
      const sp = new Sprite(T('a.cloudShadow'));
      sp.anchor.set(0.5);
      sp.scale.set(1.6 * pk + i * 0.4);
      sp.position.set(Math.random() * m.W, m.area.y + m.area.h * (0.25 + i * 0.45));
      this.cloudsS.push({ sp, v: (18 + i * 9) * m.U });
      this.L.clouds.addChild(sp);
    }
    const dmod = DISTRICT_BY[m.district].mod;
    if (dmod.spark) {
      for (let i = 0; i < (this.bud.ambient ? 16 : 0); i++) {
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
    const pk = this.portK;
    for (const c of this.cars) {
      const len = c.cum[c.cum.length - 1];
      c.s += c.dir * c.v * dt;
      if (c.s > len + 60) c.s = -60;
      if (c.s < -60) c.s = len + 60;
      const p = poseAt(c.path, c.cum, c.s, AMB);
      const ax = roadAxis(p.tx * c.dir, p.ty * c.dir, c.ax || 'h');
      if (ax.ax !== c.ax || ax.d !== c.sd) {
        c.ax = ax.ax;
        c.sd = ax.d;
        c.sp.texture = T(`${c.key}@${ax.ax}`);
        c.sp.scale.set(ax.ax === 'h' && ax.d < 0 ? -pk : pk, ax.ax === 'v' && ax.d < 0 ? -pk : pk);
      }
      c.sp.position.set(p.x, p.y);
      setZ(c.sp, p.y);
    }
    for (const w of this.walkers) {
      const len = w.cum[w.cum.length - 1];
      w.s += w.dir * w.v * dt;
      if (w.s > len + 40) w.s = -40;
      if (w.s < -40) w.s = len + 40;
      w.ph += dt * 6;
      const frame = Math.sin(w.ph) > 0 ? 'a' : 'b';
      if (frame !== w.fr) {
        w.fr = frame;
        w.sp.texture = T(frame === 'a' ? w.ka : w.kb);
      }
      const p = poseAt(w.path, w.cum, w.s, AMB);
      const x = p.x, y = p.y;
      w.sp.position.set(x, y);
      w.sp.scale.x = Math.abs(w.sp.scale.y) * (p.tx * w.dir > 0 ? -1 : 1);
      setZ(w.sp, y);
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
    const k = tv.keys;
    if (e.road) {
      if (e.rax === 'v') return e.rdir > 0 ? k.down : k.up;
      if (tv.state === 'signed') return k.happy;
      return e.hit > 0 ? k.hit : k.idle;
    }
    if (tv.state === 'signed') return k.happy;
    if (e.hit > 0) return k.hit;
    /* 가끔 눈 깜빡임(그림 모듈의 t.<id>@blink 가 있을 때만) */
    if (tv.state === 'live' && (this.rt + tv.ph * 0.9) % 3.4 < 0.13 && blinkOk(e.t.id)) return k.blink;
    return k.idle;
  }
  spawn(e: Ent, initial: boolean): void {
    const body = new Container();
    const key = `t.${e.t.id}@${e.road && e.rax === 'v' ? (e.rdir > 0 ? 'down' : 'up') : 'idle'}`;
    const spr = new Sprite(T(key));
    spr.anchor.set(0.5, 0.8);
    const add = new Sprite(spr.texture);
    add.anchor.set(0.5, 0.8);
    add.blendMode = 'add';
    add.alpha = 0;
    /* 번쩍일 때만 보임(alpha 0 이어도 add 스프라이트는 대상마다 그리기를 끊음, 설계서 7장 6) */
    add.visible = false;
    body.addChild(spr, add);
    const box = e.w;
    const shadow = this.takeShadow();
    this.L.actors.addChild(body);
    const tv: TV = {
      e, body, spr, add, shadow, gauge: null, box, appear: 0, delay: initial ? Math.random() * 0.35 : 0, state: 'live', leaveT: 0, flash: 0, squash: 0,
      hopT: -1, hopFrom: { x: e.x, y: e.y }, sweatT: 0, fleeT: 0, texKey: key, ph: Math.random() * 6.28, clock: null, wmark: null, crown: null, lights: [],
      pill: null, pillT: 0, pillHW: 0, arrow: null, arrowT: 0, dx: e.x, dy: e.y, popped: false, keys: keysOf(e.t.id),
    };
    body.visible = false;
    /* 그림자는 나타날 때까지 알파 0(visible 을 끄고 켜면 그림자 층 그리기 목록을 새로 짬) */
    shadow.alpha = 0;
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
  /** 층에 붙여 둔 채 다시 쓰는 그림자·게이지·배지(수명 시계·솔깃) */
  private shadowFree: Sprite[] = [];
  private gaugeFree: Gauge[] = [];
  private clockFree: Sprite[] = [];
  private wmarkFree: Sprite[] = [];
  private takeShadow(): Sprite {
    let sp = this.shadowFree.pop();
    if (!sp) {
      sp = new Sprite(T('o.shadow'));
      sp.anchor.set(0.5);
      this.L.shadows.addChild(sp);
    }
    return sp;
  }
  private takeBadge(pool: Sprite[], key: string, ay: number): Sprite {
    let sp = pool.pop();
    if (!sp) {
      sp = new Sprite(T(key));
      sp.anchor.set(0.5, ay);
      this.L.gauges.addChild(sp);
    }
    sp.alpha = 1;
    return sp;
  }
  private gaugeFor(tv: TV): Gauge {
    if (tv.gauge) return tv.gauge;
    const e = tv.e;
    const big = e.t.big || e.boss;
    const w = Math.max(30, tv.box * (big ? FX.persuade.gaugeWBig : FX.persuade.gaugeW));
    const h = (e.boss ? FX.persuade.gaugeHBoss : FX.persuade.gaugeH) * this.portK * (e.boss ? 1.6 : 1.25);
    const k = h / 16;
    /* 다 쓴 게이지는 층에 붙인 채 풀에 둠(붙였다 부수면 그때마다 게이지 층 그리기 목록을 새로 짬). 모양은 새로 만든 것과 같게 다시 맞춤 */
    let gg = this.gaugeFree.pop();
    if (!gg) {
      const c = new Container();
      const mk = () => new NineSliceSprite({ texture: pill(), leftWidth: 8, topHeight: 8, rightWidth: 8, bottomHeight: 8 });
      const bg = mk();
      const ghost = mk();
      const fill = mk();
      c.addChild(bg, ghost, fill);
      this.L.gauges.addChild(c);
      gg = { c, bg, ghost, fill, ghostR: 1, w, h };
    }
    const set = (s: NineSliceSprite, tint: number, alpha: number) => {
      s.height = 16;
      s.width = w / k;
      s.tint = tint;
      s.alpha = alpha;
    };
    set(gg.bg, 0x000000, 0.45);
    gg.bg.width = w / k + 6;
    gg.bg.height = 22;
    gg.bg.position.set(-3, -3);
    set(gg.ghost, 0xffffff, 0.9);
    set(gg.fill, e.boss ? 0xff8fab : 0x7dff8a, 1);
    gg.c.scale.set(k);
    gg.c.alpha = 1;
    gg.ghostR = 1;
    gg.w = w;
    gg.h = h;
    tv.gauge = gg;
    return gg;
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
      gsap.to(p, { alpha: 0, duration: 0.2, onComplete: () => dropPill(p) });
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
    /* 도장 + 말풍선. 숫자는 도장(과 말풍선) 위에 띄워 '영업 성공!' 글자를 덮지 않게 */
    let stampBox: { top: number; bottom: number } | undefined;
    const onScreen = this.stamps.filter((s) => s.alive).length;
    if (onScreen < this.stampMax() || c.grade >= 2) {
      if (onScreen >= this.stampMax()) {
        const old = this.stamps.find((s) => s.alive);
        if (old) this.killStamp(old);
      }
      /* 도장이 많이 떠 있을수록 조금씩 작게(화면이 도장으로 덮이지 않게). 단 화면에서 STAMP_MIN_PX 아래로는 안 줄임 */
      const crowdK = Math.max(0.55, 1 - 0.055 * Math.min(onScreen, 7) - 0.012 * Math.min(this.nums.count, 12));
      const wt = this.L.stamps.worldTransform;
      const onPx = Math.hypot(wt.a, wt.b) || 1;
      const texW = T('fx.stamp').width || 300;
      const sMin = STAMP_MIN_PX / (2 * STAMP_R * texW * 0.64 * onPx);
      const ss = Math.max(sMin, g.stampScale * pk * (e.boss ? 1.2 : crowdK));
      /* 보스는 도장·숫자를 몸 가운데 아래쪽에(위쪽은 전국 계약 배너 자리) */
      let sy = e.boss ? e.y - (tv ? tv.box : e.w) * 0.05 : top + (tv ? tv.box : e.w) * 0.3;
      const R = STAMP_R * texW * ss * 0.64;
      /* 화면 위 HUD(재화 알약·초상 등)에 걸리면 그 아래로(폰 가로에서 지도 맨 윗줄 도장이 알약 사이에 끼지 않게) */
      if (!e.boss) sy = this.belowHud(x, sy, R);
      if (this.stamp(x, sy, ss, e.boss)) {
        stampBox = { top: sy - R, bottom: sy + R };
        sfx('stamp');
      }
    }
    if (c.grade >= 4) {
      /* 절정(보스 계약): 떠 있는 숫자는 걷고 LEVEL UP 은 미뤄서 전국 계약 배너·도장·보스 숫자만 보이게 */
      climax(2.4);
      this.nums.hush(2.2);
    } else if (c.grade >= 1 && c.grade < 3 && this.bubbleCool <= 0) {
      /* 말풍선 꼬리를 도장 테 위에 얹음(글자 자리는 비움) */
      const b = this.bubble(x, stampBox ? stampBox.top + 14 * pk : top - 20 * pk, `${e.t.name} 계약!`);
      if (b && stampBox) stampBox.top = Math.min(stampBox.top, b.y - 100 * 0.62 * pk * 1.15);
      this.bubbleCool = 0.3;
    }
    /* 숫자: 큰 줄 = 매출, 둘째 줄 = 기술력, 셋째 줄 = 거래액(결제 대기면 대기 금액) */
    this.nums.deal(x, e.boss ? e.y + (tv ? tv.box : e.w) * 0.3 : top, { rev: c.rev, tech: c.tech, gmv: c.gmv }, { crit, boss: e.boss, pending: c.pending, stamp: stampBox, hero: c.grade >= 3 });
    if (c.grade >= 3) {
      /* 배너는 이 계약의 도장·금액 자리를 피해서(지도 위쪽 계약이면 배너가 아래로). 금액은 지도 숫자가 보여 주므로 배너에는 이름만 */
      const clear = this.clearBand(x, stampBox ? stampBox.top : top, stampBox ? stampBox.bottom : e.y);
      banner(g.banner || '대형 계약', `${e.t.name} · ${e.t.sizeLabel}`, undefined, c.grade >= 4, clear);
      /* 대형 계약 배너가 떠 있는 동안 LEVEL UP 큰 글자는 잠깐 미룸(배너·금액·새 거래처 알약과 한 화면에 겹치지 않게) */
      if (c.grade < 4) holdLevelUp(1.6);
    }
    /* 링·쇼크웨이브·파티클 */
    gsap.delayedCall(0.06, () => {
      g.rings.forEach((r, i) => this.ring(x, e.y - (tv ? tv.box : e.w) * 0.3, r * this.lot, 0.45 + i * 0.12, i * 0.08, 0xfff4c4, 1, c.grade >= 3));
      if (c.grade >= 2) {
        const gp = this.L.stamps.toGlobal({ x, y: e.y - (tv ? tv.box : e.w) * 0.3 });
        this.camera.shockwave(gp.x, gp.y, c.grade >= 4 ? 1.8 : c.grade >= 3 ? 1.3 : 0.9);
      }
      const nT = Math.round(g.tickets * this.bud.burst);
      const nC = Math.round(g.coins * this.bud.burst);
      const cy = e.y - (tv ? tv.box : e.w) * 0.35;
      this.parts.burst(T('fx.ticket'), x, cy, nT, { spMin: 90 * pk, spMax: 320 * pk, g: 620 * pk, life: 0.8, s0: 0.75 * pk, s1: 0.45 * pk, up: 120 * pk });
      this.parts.burst(T('fx.coin'), x, cy, nC, { spMin: 90 * pk, spMax: 300 * pk, g: 620 * pk, life: 0.8, s0: 0.8 * pk, s1: 0.5 * pk, up: 140 * pk });
      this.parts.burst(T('fx.spark'), x, cy, 4 + c.grade * 3, { spMin: 60 * pk, spMax: 260 * pk, life: 0.45, s0: 0.9 * pk, s1: 0.1, up: 0, blend: 'add' });
      if (crit) this.parts.burst(T('fx.star'), x, cy, 8, { spMin: 120 * pk, spMax: 340 * pk, g: 500 * pk, life: 0.8, s0: 0.6 * pk, s1: 0.2, up: 160 * pk });
    });
    /* 0.25초~: HUD 로 날아감 — 동전(매출) 최대 6 · 톱니(기술력) 최대 3 · 식권(거래액) 최대 2. 계약당 최대 11개 */
    const flyC = Math.min(6, 1 + c.grade + (crit ? 1 : 0));
    const flyG = Math.min(3, 1 + Math.floor(c.grade / 2));
    const flyT = Math.min(2, 1 + (c.grade >= 2 ? 1 : 0));
    /* 날아가는 식권·코인은 숫자 자리(도장 위)에서 출발 — 도장 글자 위를 지나가지 않게 */
    const flyY = stampBox && !e.boss ? stampBox.top - 24 * pk : e.y - (tv ? tv.box : e.w) * 0.4;
    gsap.delayedCall(0.25, () => {
      const from = worldToFx(this.L.stamps, x, flyY);
      const toT: HudId = c.pending ? this.hud.pendingAnchor() : 'hud.gmv';
      if (c.rev > 0) for (let i = 0; i < flyC; i++) flyCoin('fx.coin', { x: from.x + (Math.random() - 0.5) * 40, y: from.y }, 'hud.revenue', i * 0.03, 0.9);
      if (c.tech > 0) for (let i = 0; i < flyG; i++) flyCoin('ic.tech', { x: from.x + (Math.random() - 0.5) * 40, y: from.y }, 'hud.tech', 0.06 + i * 0.04, 0.55);
      for (let i = 0; i < flyT; i++) flyCoin('fx.ticket', { x: from.x + (Math.random() - 0.5) * 40, y: from.y + (Math.random() - 0.5) * 30 }, toT, 0.12 + i * 0.05, 0.75);
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

  /** 배너가 가리면 안 되는 세로 띠들(fxTop 좌표): 도장(y0~y1, 도장 좌표) · 방금 띄운 금액 덩어리(떠오를 만큼 위로 여유). 따로 두어 배너가 둘 사이에도 설 수 있게 */
  private clearBand(x: number, y0: number, y1: number): { y0: number; y1: number }[] {
    const band = (a0: number, a1: number) => {
      const a = worldToFx(this.L.nums, x, a0);
      const b = worldToFx(this.L.nums, x, a1);
      return { y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
    };
    const out = [band(y0 - 20 * this.portK, y1 + 10 * this.portK)];
    const nb = this.nums.lastBox;
    if (nb) out.push(band(nb.y0 - 45 * this.portK, nb.y1 + 10 * this.portK));
    return out;
  }
  /**
   * 화면 위·아래 DOM HUD(재화 알약·레벨·타이머·매칭·초상·보스 게이지·스킬 칸·사무실로)의 자리(숫자 좌표).
   * DOM 자리(화면 px)는 HUD 배치가 바뀔 때(레이아웃·보스 게이지·결제 대기 알약, hudVersion)만 다시 잰다 — getBoundingClientRect 가
   * 레이아웃을 강제하므로(설계서 7장 3). 안전망 2초. 숫자 좌표로 바꾸는 계산은 프레임마다(흔들림·줌 반영).
   */
  private hudScreen: { at: number; v: number; rects: { l: number; t: number; r: number; b: number }[] } = { at: -1e9, v: -1, rects: [] };
  private hudLocal: { rt: number; rects: KeepOut[] } = { rt: -1, rects: [] };
  /** 지난 변환(a b c d tx ty · 화면 자리 잰 시각) */
  private hudKey = [NaN, NaN, NaN, NaN, NaN, NaN, NaN];
  /** HUD 자리(화면 px)를 지금 잼. ResizeObserver 콜백(레이아웃 직후 — 강제 레이아웃 없음)과 배치 버전이 바뀐 뒤 처음 쓸 때 */
  private measureHud(now = performance.now()): void {
    const out: { l: number; t: number; r: number; b: number }[] = [];
    const sel = '#lunch .lhud .cur, #lunch .lhud .lvl, #lunch .lhud .timer, #lunch .lhud .match, #lunch .lhud .pend, #lunch .lhud .dname, #lunch .lportrait, #lunch .bossbar.on, #lunch .slots .slot, #lunch .endbtn';
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
    }
    this.hudScreen = { at: now, v: hudVersion(), rects: out };
    this.hudLocal.rt = -1;
  }
  private offHudResize = onHudResize(() => this.measureHud());
  private hudRects(): KeepOut[] {
    const now = performance.now();
    const hs = this.hudScreen;
    if (hs.v !== hudVersion() || now - hs.at > 2000) this.measureHud(now);
    if (this.hudLocal.rt === this.rt) return this.hudLocal.rects;
    /* 화면 → 숫자 좌표 변환이 그대로면(흔들림·줌 없음) 지난 값 그대로 */
    const wt = this.L.nums.worldTransform;
    const hk = this.hudKey;
    if (hk[0] === wt.a && hk[1] === wt.b && hk[2] === wt.c && hk[3] === wt.d && hk[4] === wt.tx && hk[5] === wt.ty && hk[6] === this.hudScreen.at) {
      this.hudLocal.rt = this.rt;
      return this.hudLocal.rects;
    }
    hk[0] = wt.a;
    hk[1] = wt.b;
    hk[2] = wt.c;
    hk[3] = wt.d;
    hk[4] = wt.tx;
    hk[5] = wt.ty;
    hk[6] = this.hudScreen.at;
    const rects = this.hudLocal.rects;
    const src = this.hudScreen.rects;
    rects.length = src.length;
    for (let i = 0; i < src.length; i++) {
      const r = src[i];
      const p0 = this.L.nums.toLocal(this.tmpA.set(r.l, r.t), undefined, this.tmpB);
      const x0 = p0.x;
      const y0 = p0.y;
      const p1 = this.L.nums.toLocal(this.tmpA.set(r.r, r.b), undefined, this.tmpB);
      const o = rects[i] || (rects[i] = { x0: 0, x1: 0, y0: 0, y1: 0 });
      o.x0 = Math.min(x0, p1.x);
      o.x1 = Math.max(x0, p1.x);
      o.y0 = Math.min(y0, p1.y);
      o.y1 = Math.max(y0, p1.y);
    }
    this.hudLocal.rt = this.rt;
    return rects;
  }
  /** 도장(가운데 x,y · 반지름 R)이 화면 위쪽 HUD 에 걸리면 걸리지 않는 높이까지 내림 */
  private belowHud(x: number, y: number, R: number): number {
    const mid = this.map.area.y + this.map.area.h * 0.5;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const h of this.hudRects()) {
        if (h.y1 > mid) continue;
        if (x + R > h.x0 && x - R < h.x1 && y - R < h.y1 && y + R > h.y0) {
          y = h.y1 + R + 2;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return y;
  }
  /** 도장 찍기. 보스 도장이 떠 있는 동안 그 위에 겹칠 도장은 찍지 않음(false) */
  private stamp(x: number, y: number, s: number, boss = false): boolean {
    const texW = T('fx.stamp').width || 300;
    const R = STAMP_R * texW * s * 0.64;
    if (!boss) {
      for (const o of this.stamps) {
        if (!o.alive || !o.boss) continue;
        if (Math.hypot(o.x - x, o.y - y) < (R + STAMP_R * texW * o.s * 0.64) * 0.95) return false;
      }
    }
    let st = this.stampFree.pop();
    if (!st) {
      const c = new Container();
      const ink = new Sprite(T('fx.stampInk'));
      ink.anchor.set(0.5);
      const ring = new Sprite(T('fx.stamp'));
      ring.anchor.set(0.5);
      /* 도장 글자는 영업일이 바뀌어도 같은 글자 텍스처를 다시 씀(textcache) — 첫 계약 프레임에 글자를 새로 그리지 않게 */
      const txt = takeText('stamp', String(FX.stamp.text).replace(' ', '\n'), STAMP_STYLE);
      txt.anchor.set(0.5);
      c.addChild(ink, ring, txt);
      st = { c, ink, ring, txt, t: 0, s: 1, rot: 0, x, y, alive: true };
    }
    /* 새 도장과 반 넘게 겹치는 먼저 찍힌 도장은 바로 흐려지기 시작(도장끼리 겹쳐 글자가 가려지지 않게) */
    for (const o of this.stamps) {
      if (!o.alive || o.boss) continue;
      const Ro = STAMP_R * texW * o.s * 0.64;
      if (Math.hypot(o.x - x, o.y - y) < (R + Ro) * 0.75) o.t = Math.max(o.t, FX.stamp.inSec + FX.stamp.holdSec);
    }
    st.t = 0;
    st.s = s;
    st.rot = ((FX.stamp.rot[0] + Math.random() * (FX.stamp.rot[1] - FX.stamp.rot[0])) * Math.PI) / 180;
    st.x = x;
    st.y = y;
    st.alive = true;
    st.boss = boss;
    st.c.visible = true;
    st.c.alpha = 0;
    this.L.stamps.addChild(st.c);
    this.stamps.push(st);
    return true;
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
  /**
   * 말풍선 글자 캐시: 글자(대상 이름)마다 Text 를 한 번만 래스터해 두고 돌려 씀 — 계약마다 글자를 다시 그려 텍스처를 올리던 것
   * (긴 프레임의 한 원인, 설계서 7장 6). 같은 글자가 동시에 두 말풍선에 뜨면 하나 더 만듦
   */
  private bubbleText(text: string): Text {
    /* 영업일 사이에도 남는 캐시(textcache): 대상 이름 21종 */
    const t = takeText('bubble', text, BUBBLE_STYLE);
    t.anchor.set(0.5);
    return t;
  }
  private bubble(x: number, y: number, text: string): Bubble | null {
    let b = this.bubbles.find((q) => !q.alive);
    if (!b) {
      if (this.bubbles.length >= 4) return null;
      const c = new Container();
      const bg = new NineSliceSprite({ texture: T('fx.bubble'), leftWidth: 40, topHeight: 36, rightWidth: 40, bottomHeight: 44 });
      c.addChild(bg);
      b = { c, bg, txt: this.bubbleText(text), t: 0, alive: true, x, y };
      c.addChild(b.txt);
      this.bubbles.push(b);
      this.L.labels.addChild(c);
    }
    if (b.txt.text !== text || b.txt.destroyed) {
      releaseText(b.txt);
      b.txt = this.bubbleText(text);
    }
    if (b.txt.parent !== b.c) b.c.addChild(b.txt);
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
    return b;
  }
  /** 숫자가 비킬 자리: 떠 있는 도장(글자가 보이는 동안)·말풍선·화면 위 큰 계약 배너 */
  private updateAvoid(): void {
    const A = this.avoidBuf;
    let n = 0;
    const put = (x0: number, x1: number, y0: number, y1: number, up: boolean, boss: boolean, ban: boolean): void => {
      const o = A[n] || (A[n] = { x0: 0, x1: 0, y0: 0, y1: 0 });
      o.x0 = x0;
      o.x1 = x1;
      o.y0 = y0;
      o.y1 = y1;
      o.up = up;
      o.boss = boss;
      o.banner = ban;
      n++;
    };
    const S0 = FX.stamp;
    const texW = T('fx.stamp').width || 300;
    for (const st of this.stamps) {
      if (!st.alive || st.t > S0.inSec + S0.holdSec + S0.outSec * 0.5) continue;
      const R = STAMP_R * texW * st.s * 0.64;
      const y = st.c.position.y;
      put(st.x - R, st.x + R, y - R, y + R, true, !!st.boss, false);
    }
    for (const b of this.bubbles) {
      if (!b.alive || b.t > 0.85) continue;
      const k = 0.62 * this.portK;
      const hw = (b.bg.width * k) / 2;
      const y = b.c.position.y;
      put(b.x - hw, b.x + hw, y - 100 * k, y - 20 * k, true, false, false);
    }
    for (const r of bannerRects(true)) {
      const p0 = this.L.nums.toLocal({ x: r.x0, y: r.y0 });
      const p1 = this.L.nums.toLocal({ x: r.x1, y: r.y1 });
      put(Math.min(p0.x, p1.x), Math.max(p0.x, p1.x), Math.min(p0.y, p1.y), Math.max(p0.y, p1.y), false, false, true);
    }
    /* DOM HUD 밑(재화 알약·스킬 칸 등)에 숫자가 깔리지 않게 */
    for (const h of this.hudRects()) put(h.x0, h.x1, h.y0, h.y1, false, false, false);
    A.length = n;
    this.nums.avoid = A;
  }
  private updateBubbles(dt: number): void {
    for (const b of this.bubbles) {
      if (!b.alive) continue;
      b.t += dt;
      const t = b.t;
      if (t > 1.1) {
        b.alive = false;
        b.c.visible = false;
        /* 글자는 캐시로 돌려줌(다른 말풍선이 같은 글자를 쓸 수 있게) */
        if (b.txt.parent === b.c) b.c.removeChild(b.txt);
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
      const nt = Math.max(6, Math.round(12 * this.bud.burst));
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
      this.nums.text(x, y, '+' + fmt(r.rev) + '원', 0xffe9a8, 30);
      for (let i = 0; i < 6; i++) flyCoin('fx.coin', { x: from.x + (Math.random() - 0.5) * 50, y: from.y }, 'hud.revenue', i * 0.04, 1);
    }
    if (r.tech) {
      const ev = FX.eventText.point as [string, string, number];
      this.nums.text(x, y - (r.rev ? 50 : 0), ev[0].replace('N', fmt(r.tech)), hex(ev[1]), ev[2] * 1.2);
      for (let i = 0; i < 4; i++) flyCoin('ic.tech', from, 'hud.tech', i * 0.05, 0.6);
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
      this.nums.text(it.x, it.y - 30, ev[0].replace('N', fmt(this.lunch.dupTech())), hex(ev[1]), ev[2]);
      sfx('point_get');
    }
    this.hud.itemGet(it.item, isNew);
  }
  tech(x: number, y: number, n: number, per10: boolean): void {
    const ev = (per10 ? FX.eventText.per10 : FX.eventText.point) as [string, string, number];
    this.nums.text(x, y, ev[0].replace('N', fmt(n)), hex(ev[1]), ev[2]);
    const from = worldToFx(this.L.stamps, x, y);
    flyCoin('ic.tech', from, 'hud.tech', 0.2, 0.6);
    sfx('point_get');
  }
  levelUp(lv: number, gained: number): void {
    this.rGold = 0.35;
    this.hud.levelUp(lv, gained);
  }
  pendingRelease(gmv: number, comm: number): void {
    this.hud.pendingRelease(gmv, comm);
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
    const box = tv ? tv.box : e.w;
    const a = worldToFx(this.L.stamps, e.x, e.y - box * 1.1);
    const b = worldToFx(this.L.stamps, e.x, e.y + box * 0.2);
    banner(ev[0], e.t.sizeLabel, undefined, false, { y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) });
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
    /* 글자는 캐시(textcache): 새 거래처가 뜰 때마다 글자 텍스처를 새로 만들지 않게(설계서 7장 6) */
    const txt = takeText('fs-name', `${e.t.name} · ${e.t.sizeLabel}`, FS_NAME);
    txt.anchor.set(0.5);
    const w = txt.width + 44;
    const bg = new Graphics().roundRect(-w / 2, -26, w, 52, 26).fill(0xfff8ec).stroke({ width: 4, color: 0xffffff });
    const sh = new Graphics().roundRect(-w / 2, -20, w, 52, 26).fill(0x5c3a1a);
    const tag = takeText('fs-tag', FX.firstSeen.label, FS_TAG);
    tag.anchor.set(0.5);
    tag.y = -42;
    c.addChild(sh, bg, txt, tag);
    tv.pillHW = Math.max(w, tag.width) / 2;
    c.scale.set(0);
    /* 첫 프레임부터 제자리(등장 지연 중에도 HUD 띠로 올라가지 않게) */
    const pp = { ...this.pillPos(tv, e.x, e.y) };
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
      /* 배너는 이 대상·알약 자리를 피해서 */
      const a = worldToFx(this.L.labels, e.x, Math.min(pp.y - 70 * pk, e.y - tv.box));
      const b = worldToFx(this.L.labels, e.x, Math.max(pp.y + 40 * pk, e.y));
      banner(FX.firstSeen.label, `${e.t.name} · ${e.t.sizeLabel}`, undefined, false, { y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) });
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
    this.tmpA.set(0, view.h - 4);
    this.nums.bounds.y1 = Math.min(this.map.H, this.L.nums.toLocal(this.tmpA, undefined, this.tmpB).y);
    /* 숫자 최소 글자 크기(화면 px)용: 숫자 좌표 1 이 화면 몇 px 인지 */
    {
      const wt = this.L.nums.worldTransform;
      const onPx = Math.hypot(wt.a, wt.b);
      this.nums.pxK = onPx > 0 ? 1 / onPx : 0;
    }
    /* 대상 */
    const ghostK = 1 - Math.pow(1 - FX.persuade.ghostLerp, rt * 60);
    const pills = this.pillBuf;
    let nPill = 0;
    for (const tv of this.tvs.values()) {
      const e = tv.e;
      if (tv.delay > 0) {
        tv.delay -= rt;
        continue;
      }
      if (!tv.body.visible) {
        tv.body.visible = true;
        tv.shadow.alpha = 1;
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
      const flip = e.road && e.rax === 'h' && e.rdir > 0 ? -1 : 1;
      tv.body.position.set(x, y - lift - (1 - Math.min(1, ap * 1.6)) * this.lot * 0.25);
      tv.spr.scale.set(sx * flip, sy);
      /* 번쩍 스프라이트는 보일 때만 크기를 따라감(숨은 동안 매 프레임 쓰면 그만큼 갱신 목록에 오름) */
      if (e.hit > 0) tv.add.scale.copyFrom(tv.spr.scale);
      /* 설득받는 중: 하얗게 깜빡(피격 느낌) */
      tv.add.alpha = hitOn ? (Math.sin(this.rt * 34 + tv.ph) > 0.35 ? 0.28 : 0.06) : 0;
      /* 보이기는 설득받는 동안(e.hit)만 켜고, 히트스톱으로 잠깐 멈춘 동안은 알파 0 — 계약마다 오는 히트스톱 때 설득 중인 대상 전부가
         껐다 켜지며 대상 층 그리기 목록을 두 번씩 새로 짰음. 보이는 모양은 같음 */
      tv.add.visible = e.hit > 0;
      tv.body.rotation = wob;
      setZ(tv.body, y);
      /* 솔깃(입소문) 파란 틴트 */
      setTint(tv.spr, e.frz > 0 ? 0xa8dcff : 0xffffff);
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
          const bx = e.rax === 'h' ? x - e.rdir * tv.box * 0.45 : x;
          const by = e.rax === 'v' ? y - e.rdir * tv.box * 0.45 : y - tv.box * 0.2;
          this.parts.emit(T('fx.smoke'), { x: bx, y: by, vx: 0, vy: -20, life: 0.5, s0: 0.25 * pk, s1: 0.55 * pk, a0: 0.7 });
          this.parts.emit(T('fx.streak'), { x: bx, y: by - 10, vx: 0, vy: 0, life: 0.25, s0: pk, s1: pk * 0.6, a0: 0.8, rot: e.rax === 'h' ? (e.rdir > 0 ? 0 : Math.PI) : e.rdir > 0 ? Math.PI / 2 : -Math.PI / 2 });
        }
      }
      /* 게이지 */
      if (e.damaged || e.boss) {
        const gg = this.gaugeFor(tv);
        const r = Math.max(0, e.hp / e.max);
        gg.ghostR += (r - gg.ghostR) * ghostK;
        if (gg.ghostR < r) gg.ghostR = r;
        const k = gg.c.scale.x;
        const fw = gg.w / k;
        /* 나인슬라이스 폭은 값이 같아도 쓸 때마다 모양을 다시 만듦 — 바뀐 때만 씀. 폭은 게이지 좌표 1 단위(화면 1px 미만)로 반올림:
           후반엔 거의 모든 대상이 매 스텝 조금씩 깎여(자동 설득) 대상 수 × 2 장이 매 프레임 다시 만들어졌음 */
        const fillW = Math.max(16, Math.round(fw * r));
        if (gg.fill.width !== fillW) gg.fill.width = fillW;
        gg.fill.alpha = r > 0.001 ? 1 : 0;
        const ghostW = Math.max(16, Math.round(fw * gg.ghostR));
        if (gg.ghost.width !== ghostW) gg.ghost.width = ghostW;
        setTint(gg.fill, e.boss ? 0xff8fab : hitOn ? 0xffd36b : 0x7dff8a);
        gg.c.position.set(x - gg.w / 2, y - tv.box * 0.8 - 14 * pk - gg.h - lift);
        gg.c.alpha = Math.min(1, ap * 2);
      }
      /* 배지: 수명 시계·솔깃 */
      if (e.warn && !tv.clock) {
        tv.clock = this.takeBadge(this.clockFree, 'fx.clock', 0.5);
        tv.clock.scale.set(pk);
      }
      if (tv.clock) {
        /* 보이기는 알파로(visible 을 끄고 켜면 게이지 층 그리기 목록을 새로 짬) */
        tv.clock.alpha = e.warn ? 1 : 0;
        tv.clock.position.set(x + tv.box * 0.42, y - tv.box * 0.72);
      }
      if (e.frz > 0 && !tv.wmark) {
        tv.wmark = this.takeBadge(this.wmarkFree, 'fx.womMark', 1);
        tv.wmark.scale.set(pk);
      }
      if (tv.wmark) {
        tv.wmark.alpha = e.frz > 0 ? 1 : 0;
        tv.wmark.position.set(x, y - tv.box * 0.85 - 18 * pk + Math.sin(this.rt * 6) * 3);
      }
      /* 새 거래처 알약·화살표(알약 자리는 루프 뒤에 서로 겹치지 않게 한꺼번에 잡음) */
      /* 알약·화살표가 있는 대상만 자리 계산 */
      const pp = tv.pill || tv.arrow ? this.pillPos(tv, x, y) : null;
      const pillLow = !!pp && pp.low;
      if (tv.pill && pp) {
        tv.pillT -= rt;
        let q = pills[nPill];
        if (!q) q = pills[nPill] = { tv, x: 0, y: 0 };
        q.tv = tv;
        q.x = pp.x;
        q.y = pp.y;
        nPill++;
        if (tv.pillT <= 0) {
          const p = tv.pill;
          tv.pill = null;
          gsap.to(p, { alpha: 0, duration: 0.25, onComplete: () => dropPill(p) });
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
    pills.length = nPill;
    this.placePills(pills, rt);
    /* 퇴장 애니메이션 */
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const tv = this.dying[i];
      tv.leaveT += rt;
      const e = tv.e;
      const base = tv.box / Math.max(1, tv.spr.texture.width);
      const flip = e.road && e.rax === 'h' && e.rdir > 0 ? -1 : 1;
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
        tv.add.visible = tv.flash > 0.001;
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
            if (tv.gauge) tv.gauge.c.alpha = 0;
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
          tv.gauge.fill.alpha = r > 0 ? 1 : 0;
          tv.gauge.ghostR += (0 - tv.gauge.ghostR) * Math.min(1, rt * 8);
          const ghostW = Math.max(16, Math.round((tv.gauge.w / tv.gauge.c.scale.x) * tv.gauge.ghostR));
          if (tv.gauge.ghost.width !== ghostW) tv.gauge.ghost.width = ghostW;
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
    clearG(this.boltG);
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
    clearG(this.boomG);
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
    const live = this.liveFx;
    live.clear();
    for (const f of lunch.fx) live.add(f.id);
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
          /* 앞뒤 순서는 어긋날 때만 맞춤(zIndex 를 매 프레임 쓰면 그 층 그리기 목록을 매번 새로 짬) */
          setZ(r, p.y);
        });
        sortByZ(v.c);
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
    let anyIn = false;
    for (const e of lunch.ents)
      if (e.inR) {
        anyIn = true;
        break;
      }
    const pulse = anyIn ? 1 + (Math.sin(this.rt * FX.radius.pulseHz * Math.PI * 2) * 0.5 + 0.5) * (FX.radius.pulseScale - 1) : 1;
    this.radiusC.position.set(lunch.net.x, lunch.net.y);
    this.radiusC.alpha = this.rAppear;
    this.rDisk.width = this.rDisk.height = R * 2 * pulse;
    this.rDisk.rotation += rt * ((FX.radius.dashRotDegPerSec * Math.PI) / 180);
    setTint(this.rDisk, this.rGold > 0 ? 0xffd36b : anyIn ? 0xffe28a : 0xffffff);
    this.rShadow.width = this.rShadow.height = R * 2 * pulse;
    this.rShadow.rotation = this.rDisk.rotation;
    this.rShadow.position.set(0, 3 * pk);
    this.rGlow.width = this.rGlow.height = R * 2.3 * pulse;
    this.rGlow.alpha = (anyIn ? 0.1 + Math.sin(this.rt * 6) * 0.03 : 0) + (this.rGold > 0 ? 0.25 : 0);
    /* 알파 0 이어도 Pixi 는 그림(add 합성 · 반경 크기만큼 채움) — 안 보일 때는 빼 둠 */
    this.rGlow.visible = this.rGlow.alpha > 0.002;
    clearG(this.touchG);
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
    this.updateAvoid();
    this.nums.update(rt);
    this.updateStamps(rt);
    this.updateBubbles(rt);
    this.camera.update(rt);
    sortByZ(this.L.actors);
    /* fxTop 은 그릴 것이 있을 때만 루프가 그림(여기서 매 프레임 markFx 하지 않음, 설계서 7장 4) */
  }

  /**
   * 새 거래처 알약 자리: 대상 위. HUD 띠(지도 영역 위)에 걸리면 대상 아래로(화살표는 숨김).
   * 가로는 화면(지도 폭) 안으로 밀어 넣는다(가장자리 부지·지도 밖에서 들어오는 도로형 대상도 글자가 잘리지 않게).
   */
  /** 결과는 늘 같은 객체(this.ppOut) — 부른 쪽이 바로 읽고 버림 */
  private ppOut = { x: 0, y: 0, low: false };
  private pillPos(tv: TV, x: number, y: number): { x: number; y: number; low: boolean } {
    const pk = this.portK;
    const up = y - tv.box * 0.8 - 80 * pk;
    const low = up - 78 * pk < this.map.area.y;
    const o = this.ppOut;
    o.x = this.clampPillX(tv, x, pk * 0.9);
    o.y = low ? y + 44 * pk : up;
    o.low = low;
    return o;
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
   * 화면 위 배너(대형 계약·새 거래처!)가 뜬 자리도 비킨다 — 배너 바로 위·아래도 후보로(배너 부제와 알약 글자가 포개지지 않게).
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
    const bans = bannerRects(true).map((r) => {
      const p0 = this.L.labels.toLocal({ x: r.x0, y: r.y0 });
      const p1 = this.L.labels.toLocal({ x: r.x1, y: r.y1 });
      return { x0: Math.min(p0.x, p1.x), x1: Math.max(p0.x, p1.x), y0: Math.min(p0.y, p1.y) - 6 * s, y1: Math.max(p0.y, p1.y) + 6 * s };
    });
    for (const p of list) {
      const hw = p.tv.pillHW * s * 1.1;
      const over = (x: number, y: number) => {
        let n = 0;
        for (const q of placed) if (Math.abs(q.x - x) < q.hw + hw + 8 * s && Math.abs(q.y - y) < hh) n++;
        for (const b of bans) if (x + hw > b.x0 && x - hw < b.x1 && y + bot > b.y0 && y - top < b.y1) n += 2;
        return n;
      };
      let bx = p.x;
      let by = p.y;
      let bn = over(bx, by);
      if (bn > 0) {
        const cand: { x: number; y: number }[] = [];
        for (const dxk of [0, 1, -1]) {
          for (const k of [1, -1, 2, -2, 3, -3]) {
            cand.push({ x: p.x + dxk * (hw * 2 + 12 * s), y: p.y + (dxk === 0 ? k * hh : (k > 0 ? k - 1 : k) * hh) });
          }
        }
        /* 배너 바로 위·아래(가까운 쪽 먼저) */
        for (const b of bans) {
          const ys = [b.y0 - bot - 4 * s, b.y1 + top + 4 * s].sort((u, v) => Math.abs(u - p.y) - Math.abs(v - p.y));
          for (const yy of ys) cand.splice(0, 0, { x: p.x, y: yy });
        }
        let bd = Infinity;
        for (const c0 of cand) {
          const xx = this.clampPillX(p.tv, c0.x, s * 1.1);
          const yy = c0.y;
          if (yy < minY || yy > maxY) continue;
          const o = over(xx, yy);
          const d = Math.abs(yy - p.y) + Math.abs(xx - p.x);
          if (o < bn || (o === bn && o === 0 && d < bd)) {
            bn = o;
            bd = d;
            bx = xx;
            by = yy;
          }
        }
      }
      placed.push({ x: bx, y: by, hw });
      const pill = p.tv.pill;
      if (!pill || pill.destroyed) continue;
      /* 처음 뜰 때(아직 커지는 중)는 제자리, 그 뒤 자리를 옮길 때는 부드럽게. 지금 자리가 배너 밑이면 바로(배너 부제와 포개진 채 미끄러지지 않게) */
      const underBan = bans.some((b) => pill.x + hw > b.x0 && pill.x - hw < b.x1 && pill.y + bot > b.y0 && pill.y - top < b.y1);
      const k = pill.scale.x < s * 0.5 || underBan ? 1 : Math.min(1, rt * 12);
      const tx = this.clampPillX(p.tv, bx, Math.max(s, pill.scale.x));
      pill.position.set(pill.x + (tx - pill.x) * k, pill.y + (by - pill.y) * k);
    }
  }

  private destroyTV(tv: TV): void {
    killDeep(tv.body);
    killDeep(tv.pill);
    tv.body.destroy({ children: true });
    /* 그림자·게이지·배지는 부수지 않고 알파·크기 0 으로 풀에 돌려줌(다음 대상이 다시 씀) */
    park(tv.shadow);
    this.shadowFree.push(tv.shadow);
    if (tv.gauge) {
      park(tv.gauge.c);
      this.gaugeFree.push(tv.gauge);
      tv.gauge = null;
    }
    if (tv.clock) {
      park(tv.clock);
      this.clockFree.push(tv.clock);
      tv.clock = null;
    }
    if (tv.wmark) {
      park(tv.wmark);
      this.wmarkFree.push(tv.wmark);
      tv.wmark = null;
    }
    if (tv.pill) dropPill(tv.pill);
    tv.arrow?.destroy();
  }

  destroy(): void {
    this.offHudResize();
    gsap.killTweensOf(this.camera);
    killDeep(this.root);
    for (const tv of this.tvs.values()) this.destroyTV(tv);
    for (const tv of this.dying) this.destroyTV(tv);
    this.tvs.clear();
    this.dying = [];
    this.camera.destroy();
    /* 캐시 글자(도장·말풍선)는 떼어 두고 부숨 — 다음 영업일에 다시 씀 */
    detachCached(this.root);
    this.root.destroy({ children: true });
  }
}

export function tierOf(id: string): number {
  return TIER_OF[id] ?? 0;
}
export type { TargetDef };
void ROAD_KEYS;

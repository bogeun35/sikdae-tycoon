/**
 * 성장 트리(Pixi) — 사무실 패널 안을 남색으로 꽉 채움. 안개: 중앙 + 보유 칸 + 보유 칸의 이웃만 보임.
 * 드래그·휠(폰은 두 손가락)로 이동·줌. 처음엔 중앙(이동 위치는 메모리에만).
 * 칸 66(핵심 77) · 간격 88 · 연결선 6(양쪽 보유 금색). 한 번 탭 = 설명 바, 두 번 탭 = 구매.
 * 가격표·레벨 배지 글자는 Pixi Text(캔버스 글자)를 화면 배율 그대로의 해상도로 그린다. BitmapText(32px 글자 그림을 5배 줄여 그림)는
 * 1배 화면에서 쉼표 꼬리가 1px 아래로 뭉개져 "1,500" 이 "1.500" 으로 읽혔다. 줌이 끝나면(0.15초 뒤) 해상도를 다시 맞춘다.
 * 효과 종류(설계서 6장): 칸 틀 바깥 4px 효과 색 테두리(+ 바깥 흰 2px) · 가격표 왼쪽 칩 "[반경] 1,500"(최대 레벨이면 칩만).
 *   칩 그림은 (글자·종류·해상도)마다 한 장 구워 여러 칸이 같이 씀. 살 수 있음 = 금 링(맥동 없음, 가만히 있을 때 다시 그리지 않게).
 */
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import gsap from 'gsap';
import { EFFECT_KINDS, TREE, TREE_BY, TREE_CENTER, FX, kindOfKey, type KindId, type TreeNode } from '../data';
import { fmtShort } from '../format';
import { canBuyNode, nodeCost, nodeCurrency, nodeReqOk, nodeVisible, owns, tlv } from '../rules';
import { S } from '../state';
import { FONT_STACK } from '../../fonts';
import { app, view } from '../core/stage';
import { requestRender } from '../core/loop';
import { T, gradientTex } from '../core/tex';
import { Texture as PixiTexture } from 'pixi.js';
import { Particles } from '../fx/particles';

const GAP = 88;
/** 가격표·레벨 배지 글자 크기(트리 좌표) */
const LABEL_PX = 15;
interface NV {
  n: TreeNode; c: Container; frame: Sprite; add: Sprite; icon: Sprite; lv: Container; lvT: Text; lvBg: Graphics; pr: Container; prT: Text; prBg: Graphics;
  plus: Sprite; sel: Sprite; ring: Sprite; state: string; ph: number;
  /** 가격표 재화 아이콘(매출 = 동전, 기술력 = 톱니) */
  prIc: Sprite;
  /** 효과 종류 테두리 · 칩 */
  kr: Sprite; kc: Sprite; kind: KindId; chip: string; size: number;
}

/* ── 효과 종류 칩 그림(글자·종류·해상도마다 한 장) ── */
const CHIP_PX = 12;
const chipCache = new Map<string, PixiTexture>();
function chipTex(kind: KindId, text: string, res: number): PixiTexture {
  const key = kind + '|' + text + '|' + res;
  const hit = chipCache.get(key);
  if (hit) return hit;
  const d = EFFECT_KINDS.kinds[kind];
  const cv = document.createElement('canvas');
  const g0 = cv.getContext('2d')!;
  const font = `${CHIP_PX * res}px ${FONT_STACK.map((f) => (f.includes(' ') ? `'${f}'` : f)).join(',')}`;
  g0.font = font;
  const tw = g0.measureText(text).width / res;
  const w = Math.ceil(tw + 10);
  const h = 16;
  cv.width = Math.ceil(w * res);
  cv.height = Math.ceil(h * res);
  const g = cv.getContext('2d')!;
  g.scale(res, res);
  g.beginPath();
  g.roundRect(0.5, 0.5, w - 1, h - 1, (h - 1) / 2);
  const c1 = d.chip || d.color;
  const c2 = d.chip2 || d.color2;
  if (c2) {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, c1);
    gr.addColorStop(0.5, c1);
    gr.addColorStop(0.5, c2);
    gr.addColorStop(1, c2);
    g.fillStyle = gr;
  } else g.fillStyle = c1;
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(255,255,255,.85)';
  g.stroke();
  g.font = `${CHIP_PX}px ${FONT_STACK.map((f) => (f.includes(' ') ? `'${f}'` : f)).join(',')}`;
  g.fillStyle = d.fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 0.8);
  const t = PixiTexture.from({ resource: cv, resolution: res });
  chipCache.set(key, t);
  return t;
}
/** 칸 틀 몸통(그림자 포함) 사각형 — art/draw/nodes.ts frame() 과 같은 계산(가운데 0,0 기준) */
function bodyRect(S: number): { x: number; y: number; w: number; h: number; r: number } {
  const k = S / 66;
  const m = 5 * k;
  const rr = ((S === 77 ? 14 : 12) * (S - 2 * m)) / (S === 77 ? 58 : 50) * 0.92;
  return { x: m - S / 2, y: m - k - S / 2, w: S - 2 * m, h: S - 2 * m - 3 * k + 4 * k, r: rr };
}
/** 효과 색 테두리: 몸통 바깥 1~5px 색(4px) + 5~7px 흰 선(남색 바탕에 파랑·보라가 묻히지 않게). 설득·반경은 위 절반 빨강 · 아래 절반 청록 */
/**
 * 효과 색 테두리 그림(종류 · 칸 크기 · 해상도마다 한 장, 설계서 7장 6). Pixi Graphics 로 칸마다 그리면 둥근 테두리 선이 배치에 못 들어가
 * 칸마다 그리기 호출이 따로 나서 트리 112칸 = 렌더당 232번(끌 때 매 프레임). 같은 모양을 캔버스에 한 번 그려 스프라이트로 → 20번
 */
const ringCache = new Map<string, PixiTexture>();
const RING_PAD = 8;
function ringTex(kind: KindId, S: number, res: number): PixiTexture {
  const key = kind + '|' + S + '|' + res;
  const hit = ringCache.get(key);
  if (hit) return hit;
  const b = bodyRect(S);
  const d = EFFECT_KINDS.kinds[kind];
  const o = 3;
  /* 그림 원점 = 칸 가운데(0,0). 바깥 흰 선(반폭 1)까지 덮는 사각형 */
  const x0 = b.x - o - 3 - RING_PAD / 2;
  const y0 = b.y - o - 3 - RING_PAD / 2;
  const w = b.w + 2 * (o + 3) + RING_PAD;
  const h = b.h + 2 * (o + 3) + RING_PAD;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * res);
  cv.height = Math.ceil(h * res);
  const g = cv.getContext('2d')!;
  g.scale(res, res);
  g.translate(-x0, -y0);
  g.lineJoin = 'round';
  g.beginPath();
  g.roundRect(b.x - o - 3, b.y - o - 3, b.w + 2 * (o + 3), b.h + 2 * (o + 3), b.r + o + 3);
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.stroke();
  const L = b.x - o;
  const Tt = b.y - o;
  const W = b.w + 2 * o;
  const H = b.h + 2 * o;
  const r = b.r + o;
  g.beginPath();
  g.roundRect(L, Tt, W, H, r);
  g.lineWidth = 4;
  g.strokeStyle = d.color2 || d.color;
  g.stroke();
  if (d.color2) {
    const my = Tt + H / 2;
    g.beginPath();
    g.moveTo(L, my);
    g.lineTo(L, Tt + r);
    g.arcTo(L, Tt, L + r, Tt, r);
    g.lineTo(L + W - r, Tt);
    g.arcTo(L + W, Tt, L + W, Tt + r, r);
    g.lineTo(L + W, my);
    g.strokeStyle = d.color;
    g.stroke();
  }
  const t = PixiTexture.from({ resource: cv, resolution: res });
  (t as unknown as { _ringOff: number[] })._ringOff = [x0, y0];
  ringCache.set(key, t);
  return t;
}
function setRing(sp: Sprite, kind: KindId, S: number, res: number): void {
  const t = ringTex(kind, S, res);
  sp.texture = t;
  const off = (t as unknown as { _ringOff: number[] })._ringOff;
  sp.anchor.set(0, 0);
  sp.position.set(off[0], off[1]);
}
/** 이동·줌 위치(메모리에만). user = 사용자가 직접 옮겼는지(아니면 패널 크기가 바뀔 때 다시 가운데로) */
const memo = { x: 0, y: 0, z: 1, set: false, user: false };

let bgTex: Texture | null = null;
function bgTexture(): Texture {
  if (bgTex) return bgTex;
  bgTex = gradientTex(512, 512, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.72);
    gr.addColorStop(0, '#3b57a8');
    gr.addColorStop(0.7, '#1c2a5a');
    gr.addColorStop(1, '#16224f');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    const l = g.createLinearGradient(0, 0, w, 0);
    l.addColorStop(0, 'rgba(255,123,94,.10)');
    l.addColorStop(0.48, 'rgba(255,123,94,.02)');
    l.addColorStop(0.52, 'rgba(74,163,223,.02)');
    l.addColorStop(1, 'rgba(74,163,223,.10)');
    g.fillStyle = l;
    g.fillRect(0, 0, w, h);
    /* 패널 아래쪽에 보라→분홍 노을(원작 사무실처럼 밤하늘 아래로 노을이 비치게) */
    const s = g.createLinearGradient(0, 0, 0, h);
    s.addColorStop(0, 'rgba(155,123,216,0)');
    s.addColorStop(0.5, 'rgba(155,123,216,0)');
    s.addColorStop(0.8, 'rgba(155,123,216,.26)');
    s.addColorStop(1, 'rgba(249,168,201,.44)');
    g.fillStyle = s;
    g.fillRect(0, 0, w, h);
  });
  return bgTex;
}

export interface TreeHooks {
  tap(n: TreeNode, nodeEl: { x: number; y: number }): void;
}

export class TreeView {
  readonly root = new Container();
  private bg: Sprite;
  private stars: Sprite[] = [];
  private mask = new Graphics();
  readonly ct = new Container();
  private links = new Graphics();
  private sweep = new Graphics();
  /** 살 수 있는 칸의 금 링(add)은 칸 밑 한 층에 모음 — 칸마다 섞이면 블렌드가 바뀔 때마다 그리기가 끊김(설계서 7장 6) */
  private ringsC = new Container();
  private nodesC = new Container();
  /** 별 반짝임(고화질만). false 면 멈춘 별 */
  animated = true;
  private sweepDrawn = false;
  private fxC = new Container();
  private parts = new Particles(200);
  private nv = new Map<string, NV>();
  rect = { x: 0, y: 0, w: 100, h: 100 };
  private baseZ = 1;
  private sel: string | null = null;
  private t = 0;
  private sweeps: { a: TreeNode; b: TreeNode; t: number }[] = [];
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; px: number; py: number; moved: boolean; id: number } | null = null;
  private pinch: { d: number; z: number; cx: number; cy: number } | null = null;
  active = false;
  private offs: (() => void)[] = [];

  constructor(readonly hooks: TreeHooks) {
    this.bg = new Sprite(bgTexture());
    this.root.addChild(this.bg);
    for (let i = 0; i < 40; i++) {
      const s = new Sprite(T(i % 4 ? 'fx.dot' : 'fx.spark'));
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.alpha = 0.4;
      (s as unknown as { _p: number[] })._p = [Math.random(), Math.random(), Math.random() * 6, 0.08 + Math.random() * 0.12];
      this.stars.push(s);
      this.root.addChild(s);
    }
    this.root.addChild(this.ct, this.mask);
    this.root.mask = this.mask;
    this.ct.addChild(this.links, this.sweep, this.ringsC, this.nodesC, this.fxC);
    this.fxC.addChild(this.parts.view);
    if (memo.set) this.ct.position.set(memo.x, memo.y);
    this.bindInput();
    this.rebuild();
  }

  /** 패널 안쪽 사각형(화면 px) */
  setRect(r: { x: number; y: number; w: number; h: number }): void {
    const prev = this.rect;
    this.rect = r;
    this.bg.position.set(r.x, r.y);
    this.bg.width = r.w;
    this.bg.height = r.h;
    this.mask.clear().roundRect(r.x, r.y, r.w, r.h, 16 * view.kd).fill(0xffffff);
    this.baseZ = view.kd * (view.w / view.h < 1 ? 0.95 : 0.78);
    this.placeStars(0);
    requestRender(2);
    if (!memo.set || !memo.user) this.center();
    else {
      /* 사용자가 옮긴 위치는 패널 가운데 기준으로 유지 */
      this.applyZoom();
      this.ct.x += r.x + r.w / 2 - (prev.x + prev.w / 2);
      this.ct.y += r.y + r.h / 2 - (prev.y + prev.h / 2);
      this.clampPan();
    }
  }
  private applyZoom(): void {
    this.ct.scale.set(this.baseZ * memo.z);
    this.queueRes();
    requestRender();
  }
  /** 글자 해상도 = 트리 배율 × 기기 배율(0.25 단위). 화면 1px 에 글자 그림 1px 이 오게 */
  private labelRes(): number {
    return Math.max(1, Math.min(6, Math.round(this.ct.scale.x * view.dpr * 4) / 4));
  }
  private curRes = 0;
  private resTimer: ReturnType<typeof setTimeout> | null = null;
  /** 줌·패널 크기가 바뀌면 조금 뒤(연속 휠·핀치 중에는 한 번만) 글자를 새 해상도로 다시 그림 */
  private queueRes(): void {
    if (this.resTimer) clearTimeout(this.resTimer);
    this.resTimer = setTimeout(() => {
      this.resTimer = null;
      if (this.root.destroyed) return;
      const r = this.labelRes();
      if (r === this.curRes) return;
      this.curRes = r;
      for (const v of this.nv.values()) {
        v.lvT.resolution = r;
        v.prT.resolution = r;
        v.kc.texture = chipTex(v.kind, v.chip, r);
        setRing(v.kr, v.kind, v.size, r);
      }
      /* 옛 해상도 칩 그림 정리 */
      for (const [k, t] of chipCache) if (!k.endsWith('|' + r)) {
        t.destroy(true);
        chipCache.delete(k);
      }
      for (const [k, t] of ringCache) if (!k.endsWith('|' + r)) {
        t.destroy(true);
        ringCache.delete(k);
      }
      this.rebuild();
    }, 150);
  }
  private label(): Text {
    if (!this.curRes) this.curRes = this.labelRes();
    const t = new Text({ text: '', style: { fontFamily: FONT_STACK, fontSize: LABEL_PX, fill: 0xffffff }, resolution: this.curRes });
    t.anchor.set(0.5);
    t.roundPixels = true;
    return t;
  }
  center(): void {
    const c = TREE_BY[TREE_CENTER];
    memo.z = 1;
    memo.user = false;
    this.applyZoom();
    const s = this.ct.scale.x;
    this.ct.position.set(this.rect.x + this.rect.w / 2 - c.x * GAP * s, this.rect.y + this.rect.h * 0.46 - c.y * GAP * s);
    memo.x = this.ct.x;
    memo.y = this.ct.y;
    memo.set = true;
  }

  /** 칸 상태: ok 살 수 있음 · own 보유 · avail 연결됨 · lock 연결됐지만 선행 칸(req) 없음 · base 안개 */
  private stateOf(n: TreeNode): string {
    if (canBuyNode(n)) return 'ok';
    const linked = n.id === TREE_CENTER || n.link.some(owns);
    if (linked && !nodeReqOk(n)) return 'lock';
    if (owns(n.id)) return 'own';
    return linked ? 'avail' : 'base';
  }
  private frameKey(n: TreeNode, st: string): string {
    return (n.key ? 'n.key.' : 'n.') + st;
  }

  /** 상태가 바뀌면 다시 그림 */
  rebuild(popNew = false): void {
    const vis = TREE.filter(nodeVisible);
    const visIds = new Set(vis.map((n) => n.id));
    for (const [id, v] of this.nv)
      if (!visIds.has(id)) {
        v.ring.destroy();
        v.c.destroy({ children: true });
        this.nv.delete(id);
      }
    requestRender(2);
    let stagger = 0;
    for (const n of vis) {
      let v = this.nv.get(n.id);
      const isNew = !v;
      if (!v) v = this.makeNode(n);
      this.updNode(v);
      if (isNew && popNew) {
        v.c.scale.set(0);
        gsap.to(v.c.scale, { x: 1, y: 1, duration: 0.4, delay: 0.25 + stagger * FX.nodeBuy.revealStagger, ease: 'back.out(3)' });
        stagger++;
      }
    }
    this.drawLinks();
  }
  private makeNode(n: TreeNode): NV {
    const c = new Container();
    c.position.set(n.x * GAP, n.y * GAP);
    const size = n.key ? 77 : 66;
    const ring = new Sprite(T('fx.ring'));
    ring.anchor.set(0.5);
    ring.tint = 0xffd36b;
    ring.blendMode = 'add';
    ring.width = ring.height = size * 1.55;
    ring.visible = false;
    ring.alpha = 0.75;
    ring.position.set(n.x * GAP, n.y * GAP);
    this.ringsC.addChild(ring);
    const [kind, chip] = kindOfKey(n.ef);
    const kr = new Sprite();
    setRing(kr, kind, size, this.curRes || this.labelRes());
    const kc = new Sprite(chipTex(kind, chip, this.curRes || this.labelRes()));
    kc.anchor.set(0.5);
    const frame = new Sprite(T(this.frameKey(n, 'base')));
    frame.anchor.set(0.5);
    const add = new Sprite(frame.texture);
    add.anchor.set(0.5);
    add.blendMode = 'add';
    add.alpha = 0;
    /* 번쩍일 때만 보임(alpha 0 이어도 add 스프라이트는 그리기를 끊음) */
    add.visible = false;
    const icon = new Sprite(T(n.icon));
    icon.anchor.set(0.5);
    const isz = n.key ? 52 : 42;
    icon.scale.set(isz / Math.max(icon.texture.width, icon.texture.height, 1));
    icon.y = -2;
    const sel = new Sprite(T(n.key ? 'n.key.sel' : 'n.sel'));
    sel.anchor.set(0.5);
    sel.visible = false;
    const plus = new Sprite(T('n.plus'));
    plus.anchor.set(0.5);
    plus.position.set(size / 2 - 4, -size / 2 + 2);
    const lv = new Container();
    const lvBg = new Graphics();
    const lvT = this.label();
    lv.addChild(lvBg, lvT);
    /* 레벨 배지·가격표는 이웃 칸(간격 88)과 겹치지 않게: 배지 위끝 -46, 가격표 19..39 */
    lv.position.set(-size / 2 + 4, -Math.min(size / 2 + 3, 36));
    const pr = new Container();
    const prBg = new Graphics();
    const prT = this.label();
    prT.tint = 0xffe9a8;
    const prIc = new Sprite(T(nodeCurrency(n) === 'tech' ? 'ic.tech' : 'ic.revenue'));
    prIc.anchor.set(0.5);
    prIc.scale.set(17 / Math.max(1, prIc.texture.width));
    pr.addChild(prBg, prT, prIc, kc);
    pr.position.set(0, Math.min(size / 2 - 3, 29));
    c.addChild(kr, frame, add, icon, sel, plus, lv, pr);
    this.nodesC.addChild(c);
    const v: NV = { n, c, frame, add, icon, lv, lvT, lvBg, pr, prT, prBg, plus, sel, ring, state: '', ph: Math.random() * 6, prIc, kr, kc, kind, chip, size };
    this.nv.set(n.id, v);
    return v;
  }
  private updNode(v: NV): void {
    const n = v.n;
    const st = this.stateOf(n);
    const l = tlv(n.id);
    const mx = l >= n.max;
    /* 잠긴 칸 = 안개 틀 + 회색 + 자물쇠 배지(더하기 자리). 살 수 있음은 틀 대신 금 링·초록 +·밝은 가격으로(틀 바깥 자리는 효과 색 테두리) */
    const fk = this.frameKey(n, st === 'lock' ? (owns(n.id) ? 'own' : 'base') : st === 'ok' ? (owns(n.id) ? 'own' : 'avail') : st);
    v.frame.texture = T(fk);
    v.frame.tint = st === 'lock' ? 0x9aa0ac : 0xffffff;
    v.add.texture = v.frame.texture;
    v.state = st;
    v.icon.alpha = st === 'base' || st === 'lock' ? 0.55 : 1;
    v.plus.texture = T(st === 'lock' ? 'n.lock' : 'n.plus');
    v.plus.visible = st === 'lock' || (!owns(n.id) && (st === 'avail' || st === 'ok'));
    v.ring.visible = st === 'ok';
    v.sel.visible = this.sel === n.id;
    /* 효과 색 테두리: 안개·잠김은 흐리게 */
    v.kr.alpha = st === 'base' || st === 'lock' ? 0.5 : 1;
    /* 레벨 배지 */
    v.lv.visible = n.max > 1 && (owns(n.id) || st !== 'base');
    if (v.lv.visible) {
      v.lvT.text = `${l}/${n.max}`;
      const w = v.lvT.width + 12;
      v.lvBg.clear().roundRect(-w / 2, -10, w, 20, 9).fill(mx ? 0x5cb85c : 0x2a4a9a).stroke({ width: 2.5, color: 0xffffff });
      v.lvT.position.set(0, 0);
      v.lv.x = -(n.key ? 77 : 66) / 2 + w / 2 - 6;
    }
    /* 가격표: [효과 칩] + 재화 아이콘 + 값(어느 재화로 사는지). 잠긴 칸은 [칩] "잠김", 최대 레벨·안개는 칩만 */
    v.pr.visible = true;
    const onlyChip = mx || st === 'base';
    const cw = v.kc.width;
    v.kc.alpha = st === 'base' ? 0.5 : 1;
    v.prT.visible = !onlyChip;
    v.prBg.visible = !onlyChip;
    if (onlyChip) {
      v.prIc.visible = false;
      v.kc.x = 0;
    } else {
      const lk = st === 'lock';
      v.prT.text = lk ? '잠김' : fmtShort(nodeCost(n));
      v.prT.tint = st === 'ok' ? (nodeCurrency(n) === 'tech' ? 0xbfe9ff : 0xffe9a8) : lk ? 0xb8bcc6 : 0xc9d6ff;
      v.prIc.visible = !lk;
      const icw = lk ? 0 : 18;
      const w = 3 + cw + 4 + icw + v.prT.width + 8;
      const x0 = -w / 2;
      v.kc.x = x0 + 3 + cw / 2;
      v.prIc.x = x0 + 3 + cw + 4 + 8.5;
      v.prT.x = x0 + 3 + cw + 4 + icw + v.prT.width / 2;
      v.prBg.clear().roundRect(x0, -10, w, 20, 10).fill({ color: 0x000000, alpha: 0.72 });
    }
  }
  private drawLinks(): void {
    const g = this.links;
    g.clear();
    const vis = new Set(Array.from(this.nv.keys()));
    for (const id of vis) {
      const n = TREE_BY[id];
      for (const lid of n.link) {
        if (lid < id || !vis.has(lid)) continue;
        const m = TREE_BY[lid];
        const on = owns(n.id) && owns(m.id);
        if (on && this.sweeps.some((s) => (s.a === n && s.b === m) || (s.a === m && s.b === n))) continue;
        g.moveTo(n.x * GAP, n.y * GAP).lineTo(m.x * GAP, m.y * GAP).stroke({ width: 6, color: on ? 0xffd36b : 0x8cbeff, alpha: on ? 1 : 0.5, cap: 'round' });
      }
    }
  }

  select(id: string | null): void {
    this.sel = id;
    for (const v of this.nv.values()) v.sel.visible = v.n.id === id;
    requestRender();
  }

  /** 구매 연출: 흰 번쩍 + 링 + 반짝 → 연결선 금색 차오름 → 새 이웃이 안개에서 튀어나옴 */
  bought(n: TreeNode): void {
    const v = this.nv.get(n.id);
    const x = n.x * GAP;
    const y = n.y * GAP;
    if (v) {
      v.add.alpha = 1;
      v.add.visible = true;
      const add = v.add;
      gsap.to(add, { alpha: 0, duration: FX.nodeBuy.flash, onComplete: () => { if (!add.destroyed) add.visible = false; } });
      gsap.fromTo(v.c.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' });
    }
    const ring = new Sprite(T('fx.ring'));
    ring.anchor.set(0.5);
    ring.position.set(x, y);
    ring.tint = 0xffd36b;
    ring.blendMode = 'add';
    ring.scale.set(0.1);
    this.fxC.addChild(ring);
    const rs = (GAP * FX.nodeBuy.ring * 2) / 256;
    gsap.to(ring.scale, { x: rs, y: rs, duration: 0.5, ease: 'expo.out' });
    gsap.to(ring, { alpha: 0, duration: 0.5, onComplete: () => ring.destroy() });
    const glow = new Sprite(T('fx.glow'));
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.position.set(x, y);
    glow.width = glow.height = n.key ? 300 : 200;
    glow.tint = 0xffe9a8;
    this.fxC.addChild(glow);
    gsap.to(glow, { alpha: 0, duration: 0.6, onComplete: () => glow.destroy() });
    const k = n.key ? FX.nodeBuy.keySparks : FX.nodeBuy.sparks;
    this.parts.burst(T('fx.spark'), x, y, k, { spMin: 120, spMax: 380, life: 0.6, s0: 0.9, s1: 0.1, up: 0, blend: 'add', drag: 2 });
    if (n.key) this.parts.burst(T('fx.star'), x, y, 10, { spMin: 150, spMax: 420, g: 500, life: 0.9, s0: 0.6, s1: 0.2, up: 200 });
    for (const lid of n.link) {
      const m = TREE_BY[lid];
      if (m && owns(m.id) && m.id !== n.id) this.sweeps.push({ a: n, b: m, t: 0 });
    }
    this.rebuild(true);
  }

  private bindInput(): void {
    const cv = app.canvas;
    const inRect = (x: number, y: number) => x >= this.rect.x && x <= this.rect.x + this.rect.w && y >= this.rect.y && y <= this.rect.y + this.rect.h;
    const blocked = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      return !!el && el !== cv && !(el as HTMLElement).closest?.('.panel.tree .body');
    };
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opt?: AddEventListenerOptions) => {
      cv.addEventListener(type, fn as EventListener, opt);
      this.offs.push(() => cv.removeEventListener(type, fn as EventListener, opt));
    };
    on('pointerdown', (e) => {
      if (!this.active || !inRect(e.clientX, e.clientY)) return;
      if (blocked(e)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
        /* 무시 */
      }
      if (this.pointers.size === 2) {
        const [a, b] = Array.from(this.pointers.values());
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: memo.z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        this.drag = null;
        return;
      }
      this.drag = { x: e.clientX, y: e.clientY, px: this.ct.x, py: this.ct.y, moved: false, id: e.pointerId };
    });
    on('pointermove', (e) => {
      if (!this.active) return;
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = Array.from(this.pointers.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomAt(this.pinch.cx, this.pinch.cy, Math.max(0.45, Math.min(2.2, this.pinch.z * (d / Math.max(10, this.pinch.d)))));
        return;
      }
      const dr = this.drag;
      if (!dr || dr.id !== e.pointerId) return;
      const dx = e.clientX - dr.x;
      const dy = e.clientY - dr.y;
      if (!dr.moved && Math.hypot(dx, dy) > 7) {
        dr.moved = true;
        memo.user = true;
      }
      if (dr.moved) {
        this.ct.position.set(dr.px + dx, dr.py + dy);
        this.clampPan();
      }
    });
    const up = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pinch) {
        if (this.pointers.size < 2) this.pinch = null;
        this.drag = null;
        return;
      }
      const dr = this.drag;
      this.drag = null;
      if (!dr || dr.moved || e.type === 'pointercancel') return;
      const p = this.ct.toLocal({ x: e.clientX, y: e.clientY });
      let best: NV | null = null;
      let bd = 1e9;
      for (const v of this.nv.values()) {
        const d = Math.hypot(v.c.x - p.x, v.c.y - p.y);
        const r = (v.n.key ? 77 : 66) * 0.62;
        if (d < r && d < bd) {
          bd = d;
          best = v;
        }
      }
      if (best) {
        const g = best.c.getGlobalPosition();
        this.hooks.tap(best.n, { x: g.x, y: g.y });
      }
    };
    on('pointerup', up);
    on('pointercancel', up);
    on(
      'wheel',
      (e) => {
        if (!this.active || !inRect(e.clientX, e.clientY)) return;
        e.preventDefault();
        const z = Math.max(0.45, Math.min(2.2, memo.z * Math.pow(1.0015, -e.deltaY)));
        this.zoomAt(e.clientX, e.clientY, z);
      },
      { passive: false },
    );
  }
  private zoomAt(sx: number, sy: number, z: number): void {
    const before = this.ct.toLocal({ x: sx, y: sy });
    memo.z = z;
    memo.user = true;
    this.applyZoom();
    const after = this.ct.toGlobal(before);
    this.ct.x += sx - after.x;
    this.ct.y += sy - after.y;
    this.clampPan();
  }
  private clampPan(): void {
    const s = this.ct.scale.x;
    const r = this.rect;
    const minX = r.x + r.w * 0.5 - 10 * GAP * s;
    const maxX = r.x + r.w * 0.5 + 10 * GAP * s;
    const minY = r.y + r.h * 0.5 - 7 * GAP * s;
    const maxY = r.y + r.h * 0.5 + 7 * GAP * s;
    this.ct.x = Math.max(minX, Math.min(maxX, this.ct.x));
    this.ct.y = Math.max(minY, Math.min(maxY, this.ct.y));
    memo.x = this.ct.x;
    memo.y = this.ct.y;
    requestRender();
  }
  /** 노드 화면 위치(설명 바 옆 연출용) */
  nodeScreen(id: string): { x: number; y: number } | null {
    const v = this.nv.get(id);
    if (!v) return null;
    const g = v.c.getGlobalPosition();
    return { x: g.x, y: g.y };
  }

  /** 배경 별 배치. 고화질이면 매 프레임 반짝, 아니면 멈춘 한 장면(설계서 7장 2) */
  private placeStars(dt: number): void {
    for (const s of this.stars) {
      const p = (s as unknown as { _p: number[] })._p;
      s.position.set(this.rect.x + p[0] * this.rect.w + (this.ct.x - memo.x) * 0.1, this.rect.y + p[1] * this.rect.h);
      s.alpha = 0.15 + Math.max(0, Math.sin(this.t * 1.3 + p[2])) * 0.45;
      s.scale.set(p[3] * view.kd * 1.4);
    }
    void dt;
  }
  setAnimated(on: boolean): void {
    this.animated = on;
    this.placeStars(0);
    requestRender(2);
  }

  update(dt: number): void {
    /* 살 수 있는 칸의 금 링은 멈춰 있음(맥동 없음 — 효과 색 테두리와 겹치지 않고, 가만히 있을 때 다시 그릴 것이 없게) */
    if (this.animated) {
      this.t += dt;
      this.placeStars(dt);
      requestRender();
    }
    /* 연결선 금색 차오름(차오르는 동안만 다시 그림) */
    if (this.sweepDrawn || this.sweeps.length) {
      this.sweep.clear();
      this.sweepDrawn = this.sweeps.length > 0;
      requestRender();
    }
    if (this.sweeps.length) {
      let doneAny = false;
      for (const s of this.sweeps) {
        s.t += dt / FX.nodeBuy.lineSweep;
        const k = Math.min(1, s.t);
        const ax = s.a.x * GAP;
        const ay = s.a.y * GAP;
        const bx = s.b.x * GAP;
        const by = s.b.y * GAP;
        this.sweep.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 6, color: 0x8cbeff, alpha: 0.5, cap: 'round' });
        this.sweep.moveTo(ax, ay).lineTo(ax + (bx - ax) * k, ay + (by - ay) * k).stroke({ width: 8, color: 0xffd36b, alpha: 1, cap: 'round' });
        if (k >= 1) doneAny = true;
      }
      if (doneAny) {
        this.sweeps = this.sweeps.filter((s) => s.t < 1);
        this.drawLinks();
      }
    }
    if (this.parts.count) {
      this.parts.update(dt);
      requestRender();
    }
  }

  destroy(): void {
    this.active = false;
    if (this.resTimer) clearTimeout(this.resTimer);
    this.resTimer = null;
    for (const off of this.offs) off();
    this.offs = [];
    gsap.killTweensOf(this.ct);
    this.root.destroy({ children: true });
  }
}

export const TREE_GAP = GAP;
void S;

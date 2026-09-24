/**
 * 성장 트리(Pixi) — 사무실 패널 안을 남색으로 꽉 채움. 안개: 중앙 + 보유 칸 + 보유 칸의 이웃만 보임.
 * 드래그·휠(폰은 두 손가락)로 이동·줌. 처음엔 중앙(이동 위치는 메모리에만).
 * 칸 66(핵심 77) · 간격 88 · 연결선 6(양쪽 보유 금색). 한 번 탭 = 설명 바, 두 번 탭 = 구매.
 */
import { BitmapText, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import gsap from 'gsap';
import { TREE, TREE_BY, TREE_CENTER, FX, type TreeNode } from '../data';
import { fmt } from '../format';
import { canBuyNode, nodeCost, nodeVisible, owns, tlv } from '../rules';
import { S } from '../state';
import { UI_BASE, UI_FONT } from '../core/fonts';
import { app, view } from '../core/stage';
import { T, gradientTex } from '../core/tex';
import { Particles } from '../fx/particles';

const GAP = 88;
interface NV {
  n: TreeNode; c: Container; frame: Sprite; add: Sprite; icon: Sprite; lv: Container; lvT: BitmapText; lvBg: Graphics; pr: Container; prT: BitmapText; prBg: Graphics;
  plus: Sprite; sel: Sprite; ring: Sprite; state: string; ph: number;
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
  private nodesC = new Container();
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
    this.ct.addChild(this.links, this.sweep, this.nodesC, this.fxC);
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

  private stateOf(n: TreeNode): string {
    if (canBuyNode(n)) return 'ok';
    if (owns(n.id)) return 'own';
    const linked = n.id === TREE_CENTER || n.link.some(owns);
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
        v.c.destroy({ children: true });
        this.nv.delete(id);
      }
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
    const frame = new Sprite(T(this.frameKey(n, 'base')));
    frame.anchor.set(0.5);
    const add = new Sprite(frame.texture);
    add.anchor.set(0.5);
    add.blendMode = 'add';
    add.alpha = 0;
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
    const lvT = new BitmapText({ text: '', style: { fontFamily: UI_FONT, fontSize: UI_BASE } });
    lvT.anchor.set(0.5);
    lvT.scale.set(15 / UI_BASE);
    lv.addChild(lvBg, lvT);
    /* 레벨 배지·가격표는 이웃 칸(간격 88)과 겹치지 않게: 배지 위끝 -46, 가격표 19..39 */
    lv.position.set(-size / 2 + 4, -Math.min(size / 2 + 3, 36));
    const pr = new Container();
    const prBg = new Graphics();
    const prT = new BitmapText({ text: '', style: { fontFamily: UI_FONT, fontSize: UI_BASE } });
    prT.anchor.set(0.5);
    prT.scale.set(15 / UI_BASE);
    prT.tint = 0xffe9a8;
    pr.addChild(prBg, prT);
    pr.position.set(0, Math.min(size / 2 - 3, 29));
    c.addChild(ring, frame, add, icon, sel, plus, lv, pr);
    this.nodesC.addChild(c);
    const v: NV = { n, c, frame, add, icon, lv, lvT, lvBg, pr, prT, prBg, plus, sel, ring, state: '', ph: Math.random() * 6 };
    this.nv.set(n.id, v);
    return v;
  }
  private updNode(v: NV): void {
    const n = v.n;
    const st = this.stateOf(n);
    const l = tlv(n.id);
    const mx = l >= n.max;
    const fk = this.frameKey(n, st === 'ok' ? 'ok' : st);
    v.frame.texture = T(fk);
    v.add.texture = v.frame.texture;
    v.state = st;
    v.icon.alpha = st === 'base' ? 0.55 : 1;
    v.plus.visible = !owns(n.id) && (st === 'avail' || st === 'ok');
    v.ring.visible = st === 'ok';
    v.sel.visible = this.sel === n.id;
    /* 레벨 배지 */
    v.lv.visible = n.max > 1 && (owns(n.id) || st !== 'base');
    if (v.lv.visible) {
      v.lvT.text = `${l}/${n.max}`;
      const w = v.lvT.width + 12;
      v.lvBg.clear().roundRect(-w / 2, -10, w, 20, 9).fill(mx ? 0x5cb85c : 0x2a4a9a).stroke({ width: 2.5, color: 0xffffff });
      v.lvT.position.set(0, 0);
      v.lv.x = -(n.key ? 77 : 66) / 2 + w / 2 - 6;
    }
    /* 가격 */
    v.pr.visible = !mx && st !== 'base';
    if (v.pr.visible) {
      v.prT.text = fmt(nodeCost(n));
      v.prT.tint = st === 'ok' ? 0xffe9a8 : 0xc9d6ff;
      const w = v.prT.width + 16;
      v.prBg.clear().roundRect(-w / 2, -10, w, 20, 10).fill({ color: 0x000000, alpha: 0.72 });
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
  }

  /** 구매 연출: 흰 번쩍 + 링 + 반짝 → 연결선 금색 차오름 → 새 이웃이 안개에서 튀어나옴 */
  bought(n: TreeNode): void {
    const v = this.nv.get(n.id);
    const x = n.x * GAP;
    const y = n.y * GAP;
    if (v) {
      v.add.alpha = 1;
      gsap.to(v.add, { alpha: 0, duration: FX.nodeBuy.flash });
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
  }
  /** 노드 화면 위치(설명 바 옆 연출용) */
  nodeScreen(id: string): { x: number; y: number } | null {
    const v = this.nv.get(id);
    if (!v) return null;
    const g = v.c.getGlobalPosition();
    return { x: g.x, y: g.y };
  }

  update(dt: number): void {
    this.t += dt;
    for (const v of this.nv.values()) {
      if (v.state === 'ok') {
        const k = Math.sin(this.t * ((Math.PI * 2) / 1.8) + v.ph) * 0.5 + 0.5;
        v.ring.alpha = 0.35 + k * 0.5;
        v.frame.scale.set(1 + k * 0.05);
      } else v.frame.scale.set(1);
    }
    for (const s of this.stars) {
      const p = (s as unknown as { _p: number[] })._p;
      s.position.set(this.rect.x + p[0] * this.rect.w + (this.ct.x - memo.x) * 0.1, this.rect.y + p[1] * this.rect.h);
      s.alpha = 0.15 + Math.max(0, Math.sin(this.t * 1.3 + p[2])) * 0.45;
      s.scale.set(p[3] * view.kd * 1.4);
    }
    /* 연결선 금색 차오름 */
    this.sweep.clear();
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
    this.parts.update(dt);
  }

  destroy(): void {
    this.active = false;
    for (const off of this.offs) off();
    this.offs = [];
    gsap.killTweensOf(this.ct);
    this.root.destroy({ children: true });
  }
}

export const TREE_GAP = GAP;
void S;

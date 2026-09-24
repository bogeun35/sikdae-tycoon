/**
 * 거래액 숫자 — 액수가 클수록 크고 뜨겁게(설계서 6-1).
 *   mag = log10(max(1, 거래액 ÷ (VALUE_SCALE × 판 배율))) × magK, 크기 = (20 + min(44, 6.5 × mag)) × 1.5 × (대박 1.25) × (보스 1.35)
 *   색 6단계, mag 4 이상 글로우. 등장 튀기 0.79 → 1.11 → 1.05, 0.7초부터 흐려짐, 1.25초 동안 52px 떠오름.
 *   아래 30px 매출 줄(0.45배, 0.08초 늦게) · 52px 경험치 줄(0.12초 늦게). 반경 120·0.25초 안 숫자는 합침.
 * 이벤트 글자(입소문!·핫플!·P +N …)도 같은 풀을 쓴다.
 */
import { BitmapText, Container, Sprite } from 'pixi.js';
import { FX } from '../data';
import { VALUE_SCALE as VALUE_SCALE_CONST } from '../rules';
import { fmt } from '../format';
import { EV_BASE, EV_FONT, NUM_BASE, NUM_FONT } from '../core/fonts';
import { T } from '../core/tex';

const N = FX.number;
/** 대상 가치 사다리가 옛 경제보다 가팔라져(1인 사무실 32원 → 트윈타워 16억) 크기·색 눈금을 줄이는 배수 */
const MAG_K: number = typeof N.magK === 'number' ? N.magK : 1;
const COLORS: [number, number][] = (N.colors as [number, string][]).map(([m, c]) => [m, parseInt(c.slice(1), 16)]);
export function magColor(mag: number): number {
  for (const [m, c] of COLORS) if (mag < m) return c;
  return COLORS[COLORS.length - 1][1];
}

/** 글자 폭 어림(글자 크기 배수): 한글·단위 글자는 넓고 숫자·기호는 좁다 */
function tw(s: string): number {
  if (!s) return 0;
  let w = 0.4;
  for (const ch of s) w += ch.charCodeAt(0) > 0x3000 ? 0.98 : ch === ' ' || ch === ',' ? 0.32 : 0.6;
  return w;
}

interface NumE {
  c: Container; main: BitmapText; rev: BitmapText; xp: BitmapText; tag: BitmapText; glow: Sprite;
  t: number; x: number; y: number; vx: number; size: number; val: number; revV: number; xpV: number; mag: number; kind: 'num' | 'ev'; alive: boolean;
  /** 같은 key 의 글자는 한 개만(매칭 ×N! 처럼 연달아 오르는 것은 떠 있는 글자를 바꿔 씀) */
  key: string;
  bound: { x0: number; x1: number; y0: number };
}

export class Numbers {
  readonly view = new Container();
  private pool: NumE[] = [];
  private live: NumE[] = [];
  /** 판 배율(영업 시작 때 고정) */
  mult = 1;
  scale = 1;
  merge = true;
  bounds = { x0: 0, x1: 1920, y0: 0 };
  /** 절정(보스 계약) 뒤 잠깐 작은 숫자·이벤트 글자를 띄우지 않는 시간(값은 HUD 로 그대로 감) */
  private quietLeft = 0;
  constructor(public max = 40) {}
  /** 떠 있는 숫자를 모두 빠르게 흐리고, sec 동안 보스 숫자 말고는 새로 띄우지 않음 */
  hush(sec: number): void {
    for (const e of this.live) e.t = Math.max(e.t, N.life - 0.25);
    this.quietLeft = Math.max(this.quietLeft, sec);
  }

  private get(): NumE {
    let e = this.pool.pop();
    if (!e) {
      const c = new Container();
      const glow = new Sprite(T('fx.glow'));
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      const main = new BitmapText({ text: '', style: { fontFamily: NUM_FONT, fontSize: NUM_BASE } });
      main.anchor.set(0.5);
      const rev = new BitmapText({ text: '', style: { fontFamily: NUM_FONT, fontSize: NUM_BASE } });
      rev.anchor.set(0.5);
      rev.tint = 0xffe9a8;
      const xp = new BitmapText({ text: '', style: { fontFamily: NUM_FONT, fontSize: NUM_BASE } });
      xp.anchor.set(0.5);
      xp.tint = 0x9fe0a8;
      const tag = new BitmapText({ text: '', style: { fontFamily: EV_FONT, fontSize: EV_BASE } });
      tag.anchor.set(0.5);
      tag.tint = 0xffe066;
      c.addChild(glow, rev, xp, main, tag);
      e = { c, main, rev, xp, tag, glow, t: 0, x: 0, y: 0, vx: 0, size: 30, val: 0, revV: 0, xpV: 0, mag: 0, kind: 'num', alive: false, bound: { x0: 0, x1: 0, y0: 0 }, key: '' };
    }
    if (!e.c.parent) this.view.addChild(e.c);
    e.c.visible = true;
    e.alive = true;
    e.key = '';
    if (this.live.length >= this.max) {
      /* 넘치면 작은 숫자부터(큰 계약 숫자는 끝까지 보이게) */
      let v = this.live[0];
      for (const o of this.live) if (o.t > 0.15 && (o.kind === 'ev' ? -1 : o.mag) < (v.kind === 'ev' ? -1 : v.mag)) v = o;
      this.kill(v);
    }
    this.live.push(e);
    return e;
  }
  private kill(e: NumE): void {
    e.alive = false;
    e.c.visible = false;
    const i = this.live.indexOf(e);
    if (i >= 0) this.live.splice(i, 1);
    this.pool.push(e);
  }

  /** 숫자 크기 눈금: log10(거래액 ÷ (VALUE_SCALE × 판 배율)) × magK. 1인 사무실 ≈ 1, 대장그룹 트윈타워 ≈ 6.3 (옛 경제와 같은 눈금) */
  private magOf(gmv: number): number {
    return Math.log10(Math.max(1, gmv / (VALUE_SCALE_CONST * this.mult))) * MAG_K;
  }

  /** 거래액 숫자 */
  gmv(x: number, y: number, gmv: number, rev: number, xp: number, o: { crit?: boolean; boss?: boolean; pending?: boolean } = {}): void {
    if (this.quietLeft > 0 && !o.boss) return;
    const nums = this.live.filter((e) => e.kind === 'num');
    const crowded = nums.length >= 12;
    if (this.merge) {
      /* 붐빌수록 넓게·오래 합친다 (설계 기본 반경 120·0.25초) */
      const r = N.merge.r * this.scale * (crowded ? 2.2 : 1);
      const sec = crowded ? 0.5 : N.merge.sec;
      for (const e of nums) {
        if (e.t < sec && Math.hypot(e.x - x, e.y - y) < r) {
          this.fill(e, e.val + gmv, e.revV + rev, e.xpV + xp, o);
          e.t = Math.min(e.t, 0.12);
          return;
        }
      }
    }
    if (crowded && !o.crit && !o.boss) {
      /* 화면이 숫자로 덮이지 않게: 붐빌 때는 지금 떠 있는 큰 숫자보다 한참 작은 건 띄우지 않음(값은 HUD 로 그대로 감) */
      const mag = this.magOf(gmv);
      let top = 0;
      for (const e of nums) top = Math.max(top, e.mag);
      if (mag < top - 0.6 || (nums.length >= 16 && mag < top)) return;
    }
    /* 떠 있는 숫자와 겹치지 않는 자리를 먼저 찾고, 없으면 겹치는 가장 큰 숫자에 합침(후반에 금액끼리 뭉개져 못 읽는 것 방지) */
    const size = this.sizeOf(gmv, o);
    const w = tw('+' + fmt(gmv)) * size;
    const spot = this.findSpot(x, y, w, size * 1.25, size);
    if (!spot.free && this.merge && !o.boss) {
      let tgt: NumE | null = null;
      for (const e of spot.hits) if (e.kind === 'num' && (!tgt || e.val > tgt.val)) tgt = e;
      if (tgt) {
        this.fill(tgt, tgt.val + gmv, tgt.revV + rev, tgt.xpV + xp, { ...o, crit: o.crit || tgt.tag.text === '대박!' });
        if (tgt.t < 0.5) tgt.t = Math.min(tgt.t, 0.12);
        return;
      }
    }
    const e = this.get();
    e.kind = 'num';
    e.x = spot.x;
    e.y = spot.y;
    e.vx = (Math.random() * 2 - 1) * N.drift;
    e.t = 0;
    this.fill(e, gmv, rev, xp, o);
    this.limitGlows();
  }
  private sizeOf(gmv: number, o: { crit?: boolean; boss?: boolean }): number {
    const mag = this.magOf(gmv);
    return (N.base + Math.min(N.maxAdd, N.perMag * mag)) * N.logicalK * (o.crit ? N.crit : 1) * (o.boss ? N.boss : 1) * this.scale;
  }
  /** 그 자리 → 위 → 아래 → 두 칸 위 … 순서로 빈 자리를 찾음. 없으면 첫 자리와 겹치는 숫자들 */
  private findSpot(x: number, y: number, w: number, h: number, size: number): { x: number; y: number; free: boolean; hits: NumE[] } {
    const half = w * 0.55 + 6;
    const cx = Math.max(this.bounds.x0 + half, Math.min(this.bounds.x1 - half, x));
    const ceil = this.bounds.y0 + size * 0.6;
    const hitsAt = (yy: number) => {
      const hits: NumE[] = [];
      for (const o of this.live) {
        if (!o.alive || o.t > N.life - 0.25) continue;
        const ow = Math.max(tw(o.main.text), tw(o.tag.text)) * o.size;
        const oh = o.size * 1.25;
        if (Math.abs(o.x - cx) < (w + ow) * 0.5 && Math.abs(o.y - yy) < (h + oh) * 0.5) hits.push(o);
      }
      return hits;
    };
    const y0 = Math.max(ceil, y);
    let first: NumE[] | null = null;
    for (const k of [0, -1, 1, -2, 2, -3]) {
      const yy = y0 + k * h;
      if (yy < ceil) continue;
      const hits = hitsAt(yy);
      if (!first) first = hits;
      if (!hits.length) return { x: cx, y: yy, free: true, hits };
    }
    return { x: cx, y: y0, free: false, hits: first || [] };
  }
  /** 글로우(add)는 큰 숫자 몇 개만 — 많이 겹치면 화면이 하얗게 뜸 */
  private limitGlows(): void {
    const g = this.live.filter((e) => e.kind === 'num' && e.glow.visible);
    if (g.length <= 4) return;
    g.sort((a, b) => a.mag - b.mag);
    for (let i = 0; i < g.length - 4; i++) g[i].glow.visible = false;
  }
  private fill(e: NumE, gmv: number, rev: number, xp: number, o: { crit?: boolean; boss?: boolean; pending?: boolean }): void {
    e.val = gmv;
    e.revV = rev;
    e.xpV = xp;
    const mag = this.magOf(gmv);
    e.mag = mag;
    const size = (N.base + Math.min(N.maxAdd, N.perMag * mag)) * N.logicalK * (o.crit ? N.crit : 1) * (o.boss ? N.boss : 1) * this.scale;
    e.size = size;
    e.main.text = '+' + fmt(gmv);
    e.main.tint = magColor(mag);
    e.main.scale.set(size / NUM_BASE);
    const busy = this.live.length >= 10;
    e.rev.text = rev > 0 && !busy ? '+' + fmt(rev) : '';
    e.rev.scale.set((size * N.revLine.scale) / NUM_BASE);
    e.rev.y = N.revLine.dy * this.scale + size * 0.1;
    e.xp.text = xp > 0 && !busy ? '+' + fmt(xp) : '';
    e.xp.scale.set((size * N.revLine.scale * 0.85) / NUM_BASE);
    e.xp.y = N.xpLine.dy * this.scale + size * 0.12;
    e.tag.text = o.crit ? '대박!' : o.pending ? '결제 대기' : '';
    e.tag.tint = o.crit ? 0xffe066 : 0xd9d0bd;
    e.tag.scale.set((size * 0.55) / EV_BASE);
    e.tag.y = -size * 0.72;
    e.glow.visible = mag >= N.glowFrom;
    e.glow.tint = magColor(mag);
    e.glow.width = e.glow.height = size * 3.2;
    e.glow.alpha = 0.4;
  }

  /** 이벤트 글자: 입소문! 핫플! P +N … */
  text(x: number, y: number, s: string, color: number, size: number, key = ''): void {
    if (this.quietLeft > 0) return;
    const sz = size * this.scale * 1.5;
    if (key) {
      const cur = this.live.find((o) => o.alive && o.kind === 'ev' && o.key === key);
      if (cur) {
        cur.size = sz;
        cur.tag.text = s;
        cur.tag.tint = color;
        cur.tag.scale.set(sz / EV_BASE);
        cur.t = Math.min(cur.t, 0.05);
        return;
      }
    }
    const w = tw(s) * sz;
    const spot = this.findSpot(x, y, w, sz * 1.25, sz);
    /* 붐빌 때 작은 이벤트 글자(P +2 · 입소문! …)는 자리가 없으면 건너뜀 */
    if (!spot.free && this.live.length >= 14 && size < 26) return;
    const e = this.get();
    e.kind = 'ev';
    e.x = spot.x;
    e.y = spot.y;
    e.vx = 0;
    e.t = 0;
    e.size = size * this.scale * 1.5;
    e.main.text = '';
    e.rev.text = '';
    e.xp.text = '';
    e.glow.visible = false;
    e.tag.text = s;
    e.tag.tint = color;
    e.tag.scale.set(e.size / EV_BASE);
    e.tag.y = 0;
    e.key = key;
  }

  /** 떠 있는 숫자끼리 겹치면 매 프레임 조금씩 위아래로 벌린다(오래된 것이 위로) */
  private separate(dt: number): void {
    const L = this.live;
    const n = L.length;
    if (n < 2) return;
    const k = Math.min(1, dt * 12);
    for (let i = 0; i < n; i++) {
      const a = L[i];
      const aw = Math.max(tw(a.main.text), tw(a.tag.text)) * a.size;
      const ah = a.size * 1.2;
      for (let j = i + 1; j < n; j++) {
        const b = L[j];
        const bw = Math.max(tw(b.main.text), tw(b.tag.text)) * b.size;
        const bh = b.size * 1.2;
        if (Math.abs(a.x - b.x) >= (aw + bw) * 0.5) continue;
        const dy = b.y - a.y;
        const need = (ah + bh) * 0.5;
        if (Math.abs(dy) >= need) continue;
        const push = (need - Math.abs(dy)) * k;
        const older = a.t >= b.t ? a : b;
        const younger = older === a ? b : a;
        const dir = older.y <= younger.y ? 1 : -1;
        older.y -= push * 0.6 * dir;
        younger.y += push * 0.4 * dir;
        /* 화면 위 끝에 막힌 쪽은 더 못 올라가니, 모자란 만큼 다른 쪽을 아래로(위 끝에서 숫자끼리 뭉개지지 않게) */
        for (const [u, v] of [[older, younger], [younger, older]] as [NumE, NumE][]) {
          const ceil = this.ceil(u);
          if (u.y < ceil) {
            v.y += ceil - u.y;
            u.y = ceil;
          }
        }
      }
    }
  }

  private ceil(e: NumE): number {
    return this.bounds.y0 + e.size * 0.6 * Math.max(1, e.c.scale.y);
  }
  update(dt: number): void {
    if (this.quietLeft > 0) this.quietLeft -= dt;
    /* 움직임·화면 안 밀어 넣기를 먼저 하고(실제 위치 기준으로) 겹침을 벌린다 */
    for (const e of this.live) {
      const half = Math.max(e.main.width, e.tag.width) * 0.5 + 6;
      e.x = Math.max(this.bounds.x0 + half, Math.min(this.bounds.x1 - half, e.x));
      e.y = Math.max(this.ceil(e), e.y);
    }
    this.separate(dt);
    const L = this.live.slice();
    for (const e of L) {
      e.t += dt;
      const life = N.life;
      if (e.t >= life) {
        this.kill(e);
        continue;
      }
      e.y -= (N.rise - e.t * 22) * dt * this.scale;
      e.x += e.vx * dt;
      const k = Math.min(1, e.t * 7);
      const pop = 0.55 + k * 0.5 + Math.max(0, 0.2 - e.t) * 1.2;
      e.c.scale.set(pop);
      e.c.alpha = Math.min(1, (life - e.t) * 1.8);
      /* 글자 폭 절반 + 6 만큼 화면 안으로 */
      const half = Math.max(e.main.width, e.tag.width) * 0.5 * pop + 6;
      const px = Math.max(this.bounds.x0 + half, Math.min(this.bounds.x1 - half, e.x));
      const py = Math.max(this.bounds.y0 + e.size * 0.6, e.y);
      e.c.position.set(px, py);
      /* 매출·경험치 줄은 늦게 */
      e.rev.alpha = e.t < N.revLine.delay ? 0 : 1;
      e.xp.alpha = e.t < N.xpLine.delay ? 0 : 1;
      if (e.glow.visible) e.glow.alpha = 0.36 * (1 - e.t / life) + 0.1 * Math.sin(e.t * 20);
    }
  }
  clear(): void {
    for (const e of this.live.slice()) this.kill(e);
  }
  get count(): number {
    return this.live.length;
  }
}

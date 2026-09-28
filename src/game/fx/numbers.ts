/**
 * 계약 숫자 — 큰 줄 = 매출(주인공), 액수가 클수록 크고 뜨겁게(v2 설계서 1장).
 *   mag = log10(max(1, 매출 ÷ (VALUE_SCALE × revK × 판 배율))) × magK, 크기 = (20 + min(44, 6.5 × mag)) × 1.5 × (대박 1.25) × (보스 1.35)
 *   색 6단계, mag 4 이상 글로우. 등장 튀기 0.79 → 1.11 → 1.05, 0.7초부터 흐려짐, 1.25초 동안 52px 떠오름.
 *   아래 둘째 줄 = 톱니 + 기술력(0.5배, 하늘, 0.08초 늦게) · 셋째 줄 = "거래액 N원"(0.36배, 0.12초 늦게). 경험치 줄은 없음.
 *   결제 대기 식당(매출 0원)은 큰 줄 자리에 "결제 대기", 거래액 줄에 대기 금액. 반경 120·0.25초 안 숫자는 합침.
 * 이벤트 글자(입소문!·핫플!·기술력 +N …)도 같은 풀을 쓴다.
 * 겹침: 큰 숫자가 늘 위에 그려지고(zIndex), 매 프레임 금액끼리 크게 겹치면 작은 쪽이 자리를 내준다(바로 흐려짐).
 *   비슷한 크기에 막 뜬 숫자는 먼저 뜬 숫자에 합친다. 값은 그대로 HUD 로 간다.
 * 화면 최소 크기: 금액 MIN_MAIN_PX · 기술력/거래액 줄 MIN_LINE_PX(CSS px). 폰 세로처럼 지도가 작게 보여도 읽히게.
 */
import { BitmapText, Container, Sprite } from 'pixi.js';
import { FX } from '../data';
import { COMMISSION_RATE, VALUE_SCALE as VALUE_SCALE_CONST } from '../rules';
import { fmt } from '../format';
import { EV_BASE, EV_FONT, NUM_BASE, NUM_FONT } from '../core/fonts';
import { T } from '../core/tex';

const N = FX.number;
/** 빈 자리 찾는 순서(한 칸 = 숫자 덩어리 높이): 제자리 → 위 → 아래 …, 도장 위에 둘 때는 위로만, 도장 아래에 둘 때는 아래로만 */
const DIRS_ALL = [0, -1, 1, -2, 2, -3];
const DIRS_UP = [0, -1, -2, -3];
const DIRS_DOWN = [0, 1, 2];
/** 등장 튀기 최대 배율(0.143초 1.12) */
const POP_MAX = 1.12;
/** 화면에서 금액·부속 줄(기술력·거래액)이 이보다 작아지지 않게(CSS px) */
/* 폰 세로처럼 지도가 작게 보여도 매출 숫자가 기술력·거래액 줄(최소 8~9px)보다 확실히 크게 */
const MIN_MAIN_PX = 13;
const MIN_LINE_PX = typeof N.gmvLine?.minPx === 'number' ? N.gmvLine.minPx : 8;
/** 매출 눈금: 매출 ÷ (VALUE_SCALE × revK) 가 거래액 눈금과 같은 폭이 되게(수수료율 10%) */
const REV_K: number = typeof N.revK === 'number' ? N.revK : 0.1;
const TECH_S: number = N.techLine?.scale ?? 0.5;
const GMV_S: number = N.gmvLine?.scale ?? 0.36;
const TECH_TINT = parseInt(String(N.techLine?.color || '#1c9fe0').slice(1), 16);
const GMV_TINT = parseInt(String(N.gmvLine?.color || '#e8dcc6').slice(1), 16);
const PEND_TINT = 0xd9d0bd;
/** 글자끼리 겹친 넓이가 작은 쪽 넓이의 이 비율을 넘으면 한쪽이 자리를 내줌 */
const OVERLAP_YIELD = 0.1;
/** 이 배 넘게 큰 금액과 겹치면 합치지 않고 작은 쪽이 자리를 내줌(큰 계약 금액이 작은 숫자와 섞이지 않게) */
const DOMINATE = 3;
/** 대상 가치 사다리가 옛 경제보다 가팔라져(1인 사무실 20원 → 트윈타워 16억) 크기·색 눈금을 줄이는 배수 */
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

/** 숫자가 들어가면 안 되는 자리(숫자 좌표). up = 도장처럼 위로만 비킴, 아니면(큰 계약 배너) 가까운 쪽으로 */
export interface KeepOut { x0: number; y0: number; x1: number; y1: number; up?: boolean; boss?: boolean; banner?: boolean }

interface NumE {
  /** main = 매출 "+12원"(결제 대기 식당은 "결제 대기") · tl + tIc = 톱니 + 기술력 · gl = "거래액 N원" · tag = 대박!·결제 대기 꼬리표 */
  c: Container; main: BitmapText; tl: BitmapText; tIc: Sprite; gl: BitmapText; tag: BitmapText; glow: Sprite;
  /** val = 크기·겹침 기준 값(매출, 결제 대기 식당은 거래액 × 수수료율) · revV·techV·gmvV = 합친 값 */
  t: number; x: number; y: number; vx: number; size: number; val: number; revV: number; techV: number; gmvV: number; pend: boolean; mag: number; kind: 'num' | 'ev'; alive: boolean;
  /** 보스 숫자: 배너·보스 도장만 비킴(다른 도장은 무시 — 절정 숫자가 작은 도장들에 밀려 멀리 가지 않게) */
  boss: boolean;
  /** 같은 key 의 글자는 한 개만(매칭 ×N! 처럼 연달아 오르는 것은 떠 있는 글자를 바꿔 씀) */
  key: string;
  bound: { x0: number; x1: number; y0: number };
  /** 다른 숫자에 자리를 내주고 흐려지는 중 */
  yielded: boolean;
  /** 큰 계약 금액(대형·전국): 처음 자리를 잡을 때 배너를 비키지 않고 제 도장 곁에 — 배너가 이 자리를 피해 옮긴다. 그 뒤 밀려 움직일 때는 배너도 비킴 */
  hero: boolean;
  /** 기술력·거래액 줄이 다른 금액 밑에 깔려 숨김(한 번 숨기면 다시 채울 때까지 — 깜박이지 않게) */
  linesHidden: boolean;
}
/** 금액 아래 부속 줄 크기·자리(숫자 좌표, 금액 가운데 기준) */
interface Lines { techS: number; techY: number; gmvS: number; gmvY: number }
/** 계약 숫자에 넘기는 값 */
export interface DealNum { rev: number; tech: number; gmv: number }

export class Numbers {
  readonly view = new Container();
  private pool: NumE[] = [];
  private live: NumE[] = [];
  /** 판 배율(영업 시작 때 고정) */
  mult = 1;
  scale = 1;
  merge = true;
  /** 숫자를 둘 범위(숫자 좌표). y1 = 화면 아래 끝(지도 맨 아랫줄 보스 숫자가 화면 밖으로 나가지 않게) */
  bounds = { x0: 0, x1: 1920, y0: 0, y1: Infinity };
  /** 이번 프레임의 비킬 자리(도장·배너). LunchView 가 매 프레임 채운다 */
  avoid: KeepOut[] = [];
  /** 화면 CSS 1px 이 숫자 좌표로 얼마인지(LunchView 가 매 프레임 채움, 0 = 모름). 최소 글자 크기 계산용 */
  pxK = 0;
  /** 마지막 deal() 이 띄우거나 합친 숫자 덩어리 자리(숫자 좌표, 튀기 포함). 띄우지 않았으면 null — 배너가 이 자리를 피함 */
  lastBox: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private setLast(e: NumE): void {
    const ex = this.extent(e);
    const k = POP_MAX / Math.max(1, e.c.scale.y);
    this.lastBox = { x0: e.x - ex.half * k, x1: e.x + ex.half * k, y0: e.y - ex.up * k, y1: e.y + ex.down * k };
  }
  /** 절정(보스 계약) 뒤 잠깐 작은 숫자·이벤트 글자를 띄우지 않는 시간(값은 HUD 로 그대로 감) */
  private quietLeft = 0;
  constructor(public max = 40) {
    /* 큰 숫자가 작은 숫자 밑에 깔리지 않게 그림 순서를 값 크기로(zIndex 는 fill 에서) */
    this.view.sortableChildren = true;
  }
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
      const tl = new BitmapText({ text: '', style: { fontFamily: NUM_FONT, fontSize: NUM_BASE } });
      tl.anchor.set(0.5);
      tl.tint = TECH_TINT;
      const tIc = new Sprite(T('ic.tech'));
      tIc.anchor.set(0.5);
      tIc.visible = false;
      const gl = new BitmapText({ text: '', style: { fontFamily: EV_FONT, fontSize: EV_BASE } });
      gl.anchor.set(0.5);
      gl.tint = GMV_TINT;
      const tag = new BitmapText({ text: '', style: { fontFamily: EV_FONT, fontSize: EV_BASE } });
      tag.anchor.set(0.5);
      tag.tint = 0xffe066;
      c.addChild(glow, gl, tIc, tl, main, tag);
      e = { c, main, tl, tIc, gl, tag, glow, t: 0, x: 0, y: 0, vx: 0, size: 30, val: 0, revV: 0, techV: 0, gmvV: 0, pend: false, mag: 0, kind: 'num', alive: false, boss: false, bound: { x0: 0, x1: 0, y0: 0 }, key: '', yielded: false, hero: false, linesHidden: false };
    }
    if (!e.c.parent) this.view.addChild(e.c);
    e.c.visible = true;
    e.alive = true;
    e.key = '';
    e.boss = false;
    e.yielded = false;
    e.hero = false;
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

  /** 숫자 크기 눈금: log10(매출 ÷ (VALUE_SCALE × revK × 판 배율)) × magK. 1인 사무실 계약 ≈ 0.9, 대장그룹 트윈타워 ≈ 6.4 (거래액 눈금과 같은 폭) */
  private magOf(v: number): number {
    return Math.log10(Math.max(1, v / (VALUE_SCALE_CONST * REV_K * this.mult))) * MAG_K;
  }
  /** 크기·겹침 기준 값: 매출. 결제 대기 식당(매출 0원)은 풀릴 수수료(거래액 × 수수료율) */
  private sizeVal(d: DealNum): number {
    return d.rev > 0 ? d.rev : d.gmv * COMMISSION_RATE;
  }

  /** 계약 숫자: 큰 줄 매출 · 둘째 줄 기술력 · 셋째 줄 거래액 */
  deal(x: number, y: number, d: DealNum, o: { crit?: boolean; boss?: boolean; pending?: boolean; stamp?: { top: number; bottom: number }; hero?: boolean } = {}): void {
    this.lastBox = null;
    if (this.quietLeft > 0 && !o.boss) return;
    const val = this.sizeVal(d);
    const nums = this.live.filter((e) => e.kind === 'num' && !e.yielded);
    const crowded = nums.length >= 12;
    if (this.merge) {
      /* 붐빌수록 넓게·오래 합친다 (설계 기본 반경 120·0.25초) */
      const r = N.merge.r * this.scale * (crowded ? 2.2 : 1);
      const sec = crowded ? 0.5 : N.merge.sec;
      for (const e of nums) {
        /* 훨씬 큰 금액(대기업 계약 등)은 옆 작은 숫자에 합치지 않고 제 자리(도장 위)에 따로 — 작은 숫자는 resolve() 가 비킴 */
        if (e.t < sec && Math.hypot(e.x - x, e.y - y) < r && !(e.boss && !o.boss) && val < e.val * DOMINATE) {
          this.fill(e, this.sum(e, d), { ...o, pending: !!o.pending && e.pend });
          e.t = Math.min(e.t, 0.12);
          this.setLast(e);
          return;
        }
      }
    }
    if (crowded && !o.crit && !o.boss) {
      /* 화면이 숫자로 덮이지 않게: 붐빌 때는 지금 떠 있는 큰 숫자보다 한참 작은 건 띄우지 않음(값은 HUD 로 그대로 감) */
      const mag = this.magOf(val);
      let top = 0;
      for (const e of nums) top = Math.max(top, e.mag);
      if (mag < top - 0.6 || (nums.length >= 16 && mag < top)) return;
    }
    /* 떠 있는 숫자와 겹치지 않는 자리를 먼저 찾고, 없으면 겹치는 가장 큰 숫자에 합침(후반에 금액끼리 뭉개져 못 읽는 것 방지) */
    const size = this.sizeOf(val, o);
    const w = Math.max(tw('+' + fmt(d.rev) + '원'), tw('거래액 ' + fmt(d.gmv) + '원') * GMV_S) * size;
    const lines = this.live.length < 10;
    const pendMain = !!o.pending && d.rev <= 0;
    const up = this.upOf(size, !!(o.crit || (o.pending && !pendMain)));
    const down = this.downOf(size, lines && d.tech >= 1, lines && d.gmv >= 1);
    /* 도장 글자('영업 성공!')가 숫자·기술력·거래액 줄에 덮이지 않게: 숫자 덩어리 아래 끝을 도장 위로.
       지도 맨 윗줄이라 위에 자리가 없으면 도장 아래로 */
    let dirs = DIRS_ALL;
    if (o.stamp) {
      const upP = up * POP_MAX;
      const downP = down * POP_MAX;
      const above = o.stamp.top - downP - 4;
      const below = o.stamp.bottom + upP + 6;
      /* 보스는 도장 아래(위쪽은 전국 계약 배너 자리), 화면 아래 끝에 걸리면 위 */
      if (o.boss && below + downP <= this.bounds.y1) {
        y = below;
        dirs = DIRS_DOWN;
      } else if (above - upP >= this.bounds.y0) {
        y = Math.min(y, above);
        dirs = DIRS_UP;
      } else {
        y = Math.max(y, below);
        dirs = DIRS_DOWN;
      }
    }
    const spot = this.findSpot(x, y, w, up, down, dirs, val, !!(o.hero || o.boss));
    if (!spot.free && this.merge && !o.boss) {
      let tgt: NumE | null = null;
      for (const e of spot.hits) if (e.kind === 'num' && !e.boss && (!tgt || e.val > tgt.val)) tgt = e;
      /* 훨씬 큰 금액(대기업 계약 등)은 작은 숫자에 합치지 않고 따로 띄움 — 겹치는 작은 숫자는 resolve() 가 비킴 */
      if (tgt && val < tgt.val * DOMINATE) {
        this.fill(tgt, this.sum(tgt, d), { ...o, crit: o.crit || tgt.tag.text === '대박!', pending: !!o.pending && tgt.pend });
        if (tgt.t < 0.5) tgt.t = Math.min(tgt.t, 0.12);
        this.setLast(tgt);
        return;
      }
    }
    const e = this.get();
    e.kind = 'num';
    e.boss = !!o.boss;
    e.hero = !!(o.hero || o.boss);
    e.x = spot.x;
    e.y = spot.y;
    e.vx = (Math.random() * 2 - 1) * N.drift;
    e.t = 0;
    this.fill(e, d, o);
    e.y = Math.max(this.ceil(e), Math.min(this.bounds.y1 - this.extent(e).down, e.y));
    /* 큰 계약 금액은 떠 있는 배너 밑이어도 제 자리(배너가 이 자리를 보고 비킴). 다른 비킬 자리(도장·HUD)만 피함 */
    e.y = this.freeY(e, e.hero);
    this.setLast(e);
    this.limitGlows();
  }
  /** 합친 값 */
  private sum(e: NumE, d: DealNum): DealNum {
    return { rev: e.revV + d.rev, tech: e.techV + d.tech, gmv: e.gmvV + d.gmv };
  }
  /** 금액 글자 크기(숫자 좌표). 화면에서 MIN_MAIN_PX 아래로 줄이지 않음 */
  private sizeOf(v: number, o: { crit?: boolean; boss?: boolean }): number {
    const mag = this.magOf(v);
    const s = (N.base + Math.min(N.maxAdd, N.perMag * mag)) * N.logicalK * (o.crit ? N.crit : 1) * (o.boss ? N.boss : 1) * this.scale;
    return this.pxK > 0 ? Math.max(s, MIN_MAIN_PX * this.pxK) : s;
  }
  /** 기술력·거래액 줄: 금액 × 0.5 · × 0.36, 화면 MIN_LINE_PX 아래로 줄이지 않고 줄끼리 닿지 않게. tech = 기술력 줄이 있는지(없으면 거래액 줄이 올라옴) */
  private lines(size: number, tech = true): Lines {
    const minL = this.pxK > 0 ? MIN_LINE_PX * this.pxK : 0;
    const gap = this.pxK > 0 ? 1.5 * this.pxK : 2;
    /* 기술력 줄은 거래액 줄보다 한 치수 크게(바닥값도) */
    const techS = Math.max(size * TECH_S, minL > 0 ? minL + this.pxK : 0);
    const gmvS = Math.max(size * GMV_S, minL);
    const techY = size * 0.6 + techS * 0.62 + gap;
    const gmvY = (tech ? techY + techS * 0.62 : size * 0.6) + gmvS * 0.62 + gap;
    return { techS, techY, gmvS, gmvY };
  }
  /**
   * 그 자리 → 위 → 아래 → 두 칸 위 … 순서로 빈 자리를 찾음(한 칸 = 이 숫자 덩어리 높이). 없으면 첫 자리와 겹치는 숫자들.
   * up·down = 가운데에서 위(대박!·결제 대기 꼬리표)·아래(기술력·거래액 줄) 끝까지 — 아래 줄이 다른 금액에 덮이지 않게 덩어리 전체로 잰다.
   * val(금액)을 주면 그보다 DOMINATE 배 넘게 작은 숫자·이벤트 글자는 없는 셈 친다(그쪽이 resolve() 에서 비킴 — 큰 계약 금액이 제 도장 곁에 남게).
   */
  private findSpot(x: number, y: number, w: number, up: number, down: number, dirs: number[] = DIRS_ALL, val = 0, hero = false): { x: number; y: number; free: boolean; hits: NumE[] } {
    const half = w * 0.55 + 6;
    const cx = Math.max(this.bounds.x0 + half, Math.min(this.bounds.x1 - half, x));
    const ceil = this.bounds.y0 + up;
    const step = up + down + 4;
    const hitsAt = (yy: number) => {
      const hits: NumE[] = [];
      for (const o of this.live) {
        if (!o.alive || o.yielded || o.t > N.life - 0.25) continue;
        if (val > 0 && !o.boss && (o.kind === 'ev' || o.val * DOMINATE <= val)) continue;
        const ex = this.extent(o);
        if (Math.abs(o.x - cx) < w * 0.5 + ex.half && yy - up < o.y + ex.down && yy + down > o.y - ex.up) hits.push(o);
      }
      return hits;
    };
    const blocked = (yy: number) => {
      for (const a of this.avoid) if (!(hero && a.banner) && cx + w * 0.5 > a.x0 && cx - w * 0.5 < a.x1 && yy + down > a.y0 && yy - up < a.y1) return true;
      return false;
    };
    const y0 = Math.max(ceil, y);
    let first: NumE[] | null = null;
    for (const k of dirs) {
      const yy = y0 + k * step;
      if (yy < ceil) continue;
      const hits = hitsAt(yy);
      if (!first) first = hits;
      if (!hits.length && !blocked(yy)) return { x: cx, y: yy, free: true, hits };
    }
    return { x: cx, y: y0, free: false, hits: first || [] };
  }
  /** 숫자 덩어리의 위·아래 길이(가운데 기준, 등장 튀기 전). 위 = 대박!·결제 대기 꼬리표, 아래 = 기술력·거래액 줄 */
  private upOf(size: number, tag: boolean): number {
    return tag ? size * 0.72 + size * 0.55 * 0.62 : size * 0.62;
  }
  private downOf(size: number, tech: boolean, gmv: boolean): number {
    const l = this.lines(size, tech);
    if (gmv) return l.gmvY + l.gmvS * 0.62;
    if (tech) return l.techY + l.techS * 0.62;
    return size * 0.62;
  }
  private extent(e: NumE): { up: number; down: number; half: number } {
    const pop = Math.max(1, e.c.scale.y);
    if (e.kind === 'ev') return { up: e.size * 0.62 * pop, down: e.size * 0.62 * pop, half: (e.tag.width * 0.5 + 4) * pop };
    return {
      up: this.upOf(e.size, !!e.tag.text) * pop,
      down: this.downOf(e.size, !!e.tl.text, !!e.gl.text) * pop,
      half: (Math.max(e.main.width, e.tag.width, e.tl.text ? e.tl.width * 1.3 + e.size * 0.6 : 0, e.gl.text ? e.gl.width : 0) * 0.5 + 4) * pop,
    };
  }
  /**
   * 비킬 자리(도장·말풍선·배너)에 걸친 숫자를 가장 가까운 빈 높이로 옮긴다(위 끝 아래, 어느 비킬 자리와도 안 겹치는 곳).
   * 아래에서 떠오르던 숫자는 도장 밑에서 기다리고, 도장 위에 뜬 숫자는 위로 — 도장 글자를 가로질러 지나가지 않게.
   * 위아래로 붙은 도장 사이에 끼면 둘 중 가까운 바깥쪽으로.
   */
  private keepOut(dt: number): void {
    if (!this.avoid.length) return;
    const k = Math.min(1, dt * 22);
    for (const e of this.live) {
      if (e.t > N.life - 0.25) continue;
      const y = this.freeY(e);
      if (y !== e.y) e.y += (y - e.y) * k;
    }
  }
  /** 비킬 자리와 안 겹치는 가장 가까운 높이(지금 자리가 비었으면 그대로, 빈 곳이 없으면 그대로). noBanner = 배너 자리는 무시 */
  private freeY(e: NumE, noBanner = false): number {
    const ex = this.extent(e);
    const x0 = e.x - ex.half;
    const x1 = e.x + ex.half;
    const col = this.avoid.filter((a) => x1 > a.x0 && x0 < a.x1 && (!e.boss || !a.up || a.boss) && !(noBanner && a.banner));
    if (!col.length) return e.y;
    const hitAt = (y: number) => col.some((a) => y + ex.down > a.y0 && y - ex.up < a.y1);
    if (!hitAt(e.y)) return e.y;
    const top = this.bounds.y0 + ex.up;
    const bot = this.bounds.y1 - ex.down;
    let best = e.y;
    let bd = Infinity;
    for (const a of col) {
      for (const y of [a.y0 - ex.down - 2, a.y1 + ex.up + 2]) {
        if (y < top || y > bot || hitAt(y)) continue;
        const d = Math.abs(y - e.y);
        if (d < bd) {
          bd = d;
          best = y;
        }
      }
    }
    return best;
  }
  /** 글로우(add)는 큰 숫자 몇 개만 — 많이 겹치면 화면이 하얗게 뜸 */
  private limitGlows(): void {
    const g = this.live.filter((e) => e.kind === 'num' && e.glow.visible);
    if (g.length <= 4) return;
    g.sort((a, b) => a.mag - b.mag);
    for (let i = 0; i < g.length - 4; i++) g[i].glow.visible = false;
  }
  private fill(e: NumE, d: DealNum, o: { crit?: boolean; boss?: boolean; pending?: boolean }): void {
    e.linesHidden = false;
    const val = this.sizeVal(d);
    e.val = val;
    e.revV = d.rev;
    e.techV = d.tech;
    e.gmvV = d.gmv;
    /* 결제 대기 식당(매출 0원): 큰 줄 자리에 "결제 대기"(0원 줄 대신), 풀릴 거래액은 거래액 줄에 */
    e.pend = !!o.pending && d.rev <= 0;
    const mag = this.magOf(val);
    e.mag = mag;
    /* 결제 대기 글자는 숫자보다 넓어서 한 치수 작게(덩어리 전체 — 거래액 줄 비율은 그대로) */
    const size = this.sizeOf(val, o) * (e.pend ? 0.8 : 1);
    e.size = size;
    if (e.pend) {
      e.main.text = '결제 대기';
      e.main.tint = PEND_TINT;
      e.main.scale.set(size / NUM_BASE);
    } else {
      e.main.text = '+' + fmt(d.rev) + '원';
      e.main.tint = magColor(mag);
      e.main.scale.set(size / NUM_BASE);
    }
    const busy = this.live.length >= 10;
    const hasT = d.tech >= 1 && !busy;
    const l = this.lines(size, hasT);
    e.tl.text = hasT ? '+' + fmt(d.tech) : '';
    e.tl.scale.set(l.techS / NUM_BASE);
    e.tl.y = l.techY;
    e.tIc.visible = hasT;
    if (hasT) {
      /* 톱니 + 숫자 한 덩어리를 가운데로 */
      const icw = l.techS * 1.05;
      const w = icw + l.techS * 0.12 + e.tl.width;
      e.tIc.width = e.tIc.height = icw;
      e.tIc.position.set(-w / 2 + icw / 2, l.techY - l.techS * 0.04);
      e.tl.x = -w / 2 + icw + l.techS * 0.12 + e.tl.width / 2;
    }
    e.gl.text = d.gmv >= 1 && !busy ? '거래액 ' + fmt(d.gmv) + '원' : '';
    e.gl.scale.set(l.gmvS / EV_BASE);
    e.gl.y = l.gmvY;
    e.gl.x = 0;
    e.tag.text = o.crit ? '대박!' : o.pending && !e.pend ? '결제 대기' : '';
    e.tag.tint = o.crit ? 0xffe066 : PEND_TINT;
    e.tag.scale.set((size * 0.55) / EV_BASE);
    e.tag.y = -size * 0.72;
    e.glow.visible = mag >= N.glowFrom;
    e.glow.tint = magColor(mag);
    e.glow.width = e.glow.height = size * 3.2;
    e.glow.alpha = 0.4;
    /* 그림 순서: 보스 > 큰 금액 > 작은 금액 > 이벤트 글자 (금액 = 매출 기준) */
    e.c.zIndex = e.boss ? 100000 : 1000 + Math.round(Math.log10(1 + val) * 10);
  }

  /** 이벤트 글자: 입소문! 핫플! 기술력 +N … */
  text(x: number, y: number, s: string, color: number, size: number, key = ''): void {
    if (this.quietLeft > 0) return;
    const sz = size * this.scale * 1.5;
    if (key) {
      const cur = this.live.find((o) => o.alive && o.kind === 'ev' && o.key === key && !o.yielded);
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
    const spot = this.findSpot(x, y, w, sz * 0.62, sz * 0.62);
    /* 붐빌 때 작은 이벤트 글자(기술력 +2 · 입소문! …)는 자리가 없으면 건너뜀 */
    if (!spot.free && this.live.length >= 14 && size < 26) return;
    const e = this.get();
    e.kind = 'ev';
    e.x = spot.x;
    e.y = spot.y;
    e.vx = 0;
    e.t = 0;
    e.size = size * this.scale * 1.5;
    e.main.text = '';
    e.tl.text = '';
    e.gl.text = '';
    e.tIc.visible = false;
    e.pend = false;
    e.glow.visible = false;
    e.tag.text = s;
    e.tag.tint = color;
    e.tag.scale.set(e.size / EV_BASE);
    e.tag.y = 0;
    e.key = key;
    e.c.zIndex = 500;
    e.y = this.freeY(e);
  }

  /** 떠 있는 숫자끼리 겹치면 매 프레임 조금씩 위아래로 벌린다(오래된 것이 더 많이 비킴). 덩어리 전체(꼬리표·기술력·거래액 줄 포함)로 잰다 */
  private separate(dt: number): void {
    const L = this.live.filter((e) => !e.yielded);
    const n = L.length;
    if (n < 2) return;
    const k = Math.min(1, dt * 12);
    const ex = L.map((e) => this.extent(e));
    for (let i = 0; i < n; i++) {
      const a = L[i];
      for (let j = i + 1; j < n; j++) {
        const b = L[j];
        if (Math.abs(a.x - b.x) >= ex[i].half + ex[j].half) continue;
        const aUp = a.y < b.y || (a.y === b.y && a.t >= b.t);
        const u = aUp ? a : b;
        const l = aUp ? b : a;
        const eu = aUp ? ex[i] : ex[j];
        const el = aUp ? ex[j] : ex[i];
        const ov = u.y + eu.down - (l.y - el.up);
        if (ov <= 0) continue;
        const push = ov * k;
        const uOld = u.t >= l.t;
        u.y -= push * (uOld ? 0.6 : 0.4);
        l.y += push * (uOld ? 0.4 : 0.6);
        /* 화면 위 끝에 막힌 쪽은 더 못 올라가니, 모자란 만큼 아래 것을 더 아래로(위 끝에서 숫자끼리 뭉개지지 않게) */
        const ceil = this.ceil(u);
        if (u.y < ceil) {
          l.y += ceil - u.y;
          u.y = ceil;
        }
      }
    }
  }

  /** 글자가 실제로 그려진 사각형(숫자 좌표, 이번 프레임 위치·튀기 반영). 금액 + 꼬리표 */
  private box(e: NumE): { x0: number; y0: number; x1: number; y1: number } {
    const p = e.c.position;
    const s = e.c.scale.x;
    if (e.kind === 'ev') {
      const hw = e.tag.width * 0.5 * s;
      const hh = e.tag.height * 0.5 * s;
      return { x0: p.x - hw, x1: p.x + hw, y0: p.y - hh, y1: p.y + hh };
    }
    const hw = Math.max(e.main.width, e.tag.text ? e.tag.width : 0) * 0.5 * s;
    const hh = e.main.height * 0.5 * s;
    const top = e.tag.text ? (e.tag.y - e.tag.height * 0.5) * s : -hh;
    return { x0: p.x - hw, x1: p.x + hw, y0: p.y + Math.min(top, -hh), y1: p.y + hh };
  }
  private yieldE(e: NumE): void {
    e.yielded = true;
    e.t = Math.max(e.t, N.life - 0.24);
    e.c.alpha = Math.min(e.c.alpha, (N.life - e.t) * 1.8);
    e.glow.visible = false;
  }
  /**
   * 벌려도 남는 겹침은 그 프레임 안에 정리한다(후반·보스 판에 금액끼리 뭉개진 무더기가 생기지 않게).
   *  보스 > 금액 > 이벤트 글자 순으로 앞선 쪽이 남고, 금액끼리는 DOMINATE 배 넘게 크면 작은 쪽이 비킴.
   *  비슷한 크기면 막 뜬(0.3초 안) 쪽을 먼저 뜬 쪽에 합치고, 아니면 작은 쪽이 비킴.
   */
  private resolve(): void {
    const L = this.live.filter((e) => !e.yielded && e.t < N.life - 0.25);
    const n = L.length;
    if (n < 2) return;
    const B = L.map((e) => this.box(e));
    const rank = (e: NumE) => (e.boss ? 3 : e.kind === 'num' ? 2 : 1);
    for (let i = 0; i < n; i++) {
      const a = L[i];
      for (let j = i + 1; j < n; j++) {
        if (!a.alive || a.yielded) break;
        const b = L[j];
        if (!b.alive || b.yielded) continue;
        const A = B[i];
        const C = B[j];
        const iw = Math.min(A.x1, C.x1) - Math.max(A.x0, C.x0);
        const ih = Math.min(A.y1, C.y1) - Math.max(A.y0, C.y0);
        if (iw <= 0 || ih <= 0) continue;
        const area = Math.min((A.x1 - A.x0) * (A.y1 - A.y0), (C.x1 - C.x0) * (C.y1 - C.y0));
        if (area <= 0 || (iw * ih) / area < OVERLAP_YIELD) continue;
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) {
          this.yieldE(ra < rb ? a : b);
          continue;
        }
        if (a.kind === 'ev') {
          /* 이벤트 글자끼리는 새 글자가 남음 */
          this.yieldE(a.t >= b.t ? a : b);
          continue;
        }
        const big = a.val >= b.val ? a : b;
        const small = big === a ? b : a;
        const older = a.t >= b.t ? a : b;
        const younger = older === a ? b : a;
        if (this.merge && big.val < small.val * DOMINATE && younger.t < 0.3 && !older.boss) {
          const crit = older.tag.text === '대박!' || younger.tag.text === '대박!';
          const isPend = (q: NumE) => q.pend || q.tag.text === '결제 대기';
          const pending = isPend(older) && isPend(younger);
          this.fill(older, { rev: older.revV + younger.revV, tech: older.techV + younger.techV, gmv: older.gmvV + younger.gmvV }, { crit, pending, boss: older.boss });
          if (older.t < 0.5) older.t = Math.min(older.t, 0.12);
          this.kill(younger);
          B[older === a ? i : j] = this.box(older);
          continue;
        }
        this.yieldE(small);
      }
    }
    /* 기술력·거래액 줄이 다른 금액 밑에 깔리면 그 줄은 숨김(줄은 곁들임 정보 — 값은 HUD 로 감). 벌리기가 따라잡기 전 몇 프레임 동안 글자가 포개지지 않게 */
    for (let i = 0; i < n; i++) {
      const a = L[i];
      if (!a.alive || a.yielded || a.kind !== 'num' || a.linesHidden || (!a.tl.text && !a.gl.text)) continue;
      const s = a.c.scale.x;
      const p = a.c.position;
      for (const part of [a.tl, a.gl]) {
        if (!part.text || a.linesHidden) continue;
        const hw = part.width * 0.5 * s;
        const hh = part.height * 0.5 * s;
        const P = { x0: p.x + part.x * s - hw, x1: p.x + part.x * s + hw, y0: p.y + part.y * s - hh, y1: p.y + part.y * s + hh };
        const pa = (P.x1 - P.x0) * (P.y1 - P.y0);
        if (pa <= 0) continue;
        for (let j = 0; j < n; j++) {
          const b = L[j];
          if (j === i || !b.alive || b.yielded || b.kind !== 'num') continue;
          const C = this.box(b);
          const iw = Math.min(P.x1, C.x1) - Math.max(P.x0, C.x0);
          const ih = Math.min(P.y1, C.y1) - Math.max(P.y0, C.y0);
          if (iw > 0 && ih > 0 && (iw * ih) / pa > 0.15) {
            a.linesHidden = true;
            a.tl.alpha = 0;
            a.tIc.alpha = 0;
            a.gl.alpha = 0;
            break;
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
      e.y = Math.max(this.ceil(e), Math.min(this.bounds.y1 - this.extent(e).down, e.y));
    }
    this.separate(dt);
    this.keepOut(dt);
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
      /* 기술력·거래액 줄은 늦게 */
      e.tl.alpha = e.tIc.alpha = e.t < (N.techLine?.delay ?? 0.08) || e.linesHidden ? 0 : 1;
      e.gl.alpha = e.t < (N.gmvLine?.delay ?? 0.12) || e.linesHidden ? 0 : 1;
      if (e.glow.visible) e.glow.alpha = 0.36 * (1 - e.t / life) + 0.1 * Math.sin(e.t * 20);
    }
    this.resolve();
  }
  clear(): void {
    for (const e of this.live.slice()) this.kill(e);
  }
  get count(): number {
    return this.live.length;
  }
}

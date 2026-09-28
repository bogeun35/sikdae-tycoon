/**
 * 자주 바뀌는 영업 HUD 숫자(매출·기술력·거래액·이번 판 +N·스킬 재사용 초)를 작은 캔버스에 그린다(설계서 7장 3: 레이아웃 ≤ 3회/초).
 * DOM 글자는 바뀔 때마다 레이아웃을 부르지만(0.1초마다 → 초당 6~10번), 캔버스는 칸 크기가 그대로면 레이아웃이 없다.
 *  - 글자 모양은 DOM 과 같게: 그 칸(<b>·<span>)의 계산된 글꼴 크기·색·자간·그림자를 읽어 같은 글꼴로 그림(글자는 비례폭 그대로)
 *  - 칸 폭은 "숫자 자리마다 가장 넓은 숫자 폭"으로 잡아 둠 → 자릿수가 바뀔 때만 폭이 바뀜(그때만 레이아웃)
 *  - 크기·색은 화면 배치(부르는 쪽이 주는 ver)가 바뀔 때만 다시 잼(getComputedStyle 은 그때만)
 *  - 그리기는 기기 픽셀 좌표(변환 없음). 글꼴·색·그림자는 캔버스 크기를 바꿀 때만 다시 넣음(매번 글꼴 문자열을 해석하지 않게)
 * 빈 글자('')면 캔버스를 숨김(:empty 로 숨던 +N 알약은 data-e 속성으로 같은 규칙)
 */
import { FONT_STACK } from '../fonts';
import { view } from '../game/core/stage';

const FAMILY = FONT_STACK.map((f) => (f.includes(' ') ? `'${f}'` : f)).join(',');
const DIGITS = '0123456789';

export class CanvasNum {
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D | null;
  private ver = '';

  private lh = 18;
  private ls = 0;
  private color = '#5c3a1a';
  /** 글자 그림자(text-shadow 첫 번째: 색 x y 흐림) */
  private sh: { c: string; x: number; y: number; b: number } | null = null;
  private dpr = 1;
  /** 폭·높이는 CSS px */
  private digitW = 0;
  private asc = 0;
  private desc = 0;
  private text = '\u0000';
  private cssW = -1;
  private shown = true;
  /** 기기 픽셀 글꼴 · 캔버스 상태가 맞는지 · 캔버스 letterSpacing 을 쓰는지 */
  private font = '16px sans-serif';
  private stateOk = false;
  private lsNative = false;
  /** 글자 폭 캐시(CSS px, 배치가 바뀌면 비움) */
  private cw = new Map<string, number>();
  private wOf(ch: string): number {
    let w = this.cw.get(ch);
    if (w === undefined) {
      w = this.g!.measureText(ch).width / this.dpr;
      this.cw.set(ch, w);
    }
    return w;
  }

  constructor(readonly host: HTMLElement) {
    host.textContent = '';
    this.cv = document.createElement('canvas');
    this.cv.className = 'cnum';
    this.cv.width = 1;
    this.cv.height = 1;
    this.cv.style.width = '0px';
    host.appendChild(this.cv);
    this.g = this.cv.getContext('2d');
  }

  /** 크기·색 다시 재기(배치가 바뀐 뒤 처음 그릴 때만) */
  private measure(): boolean {
    const cs = getComputedStyle(this.host);
    const px = parseFloat(cs.fontSize) || 16;
    if (!(px > 0)) return false;

    const lh = parseFloat(cs.lineHeight);
    this.lh = Number.isFinite(lh) && lh > 0 ? lh : px * 1.15;
    const ls = parseFloat(cs.letterSpacing);
    this.ls = Number.isFinite(ls) ? ls : 0;
    this.color = cs.color || '#5c3a1a';
    this.sh = null;
    const ts = cs.textShadow;
    if (ts && ts !== 'none') {
      const m = /^(rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+([\d.]+)px)?/i.exec(ts.trim());
      if (m) this.sh = { c: m[1], x: +m[2], y: +m[3], b: +(m[4] || 0) };
    }
    /* #ui 는 transform: scale(kd) 로 줄고 늘어나므로 캔버스 해상도에 kd 도 곱함(늘어난 화면에서 흐려지지 않게) */
    this.dpr = Math.min(4, (window.devicePixelRatio || 1) * Math.max(0.5, view.kd || 1));
    const g = this.g;
    if (!g) return false;
    this.font = `${px * this.dpr}px ${FAMILY}`;
    g.font = this.font;
    this.cw.clear();
    let w = 0;
    for (const d of DIGITS) w = Math.max(w, g.measureText(d).width);
    this.digitW = w / this.dpr;
    const m = g.measureText('0');
    this.asc = m.fontBoundingBoxAscent ? m.fontBoundingBoxAscent / this.dpr : px * 0.9;
    this.desc = m.fontBoundingBoxDescent ? m.fontBoundingBoxDescent / this.dpr : px * 0.25;
    return true;
  }

  /** 캔버스 상태(크기를 바꾸면 초기화됨): 글꼴·색·그림자·자간 */
  private applyState(): void {
    const g = this.g!;
    const k = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.font = this.font;
    g.fillStyle = this.color;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    /* 그림자는 흐림 없이 한 번 더 찍음(캔버스 shadowBlur 는 그릴 때마다 흐림 계산이라 0.1초마다 바뀌는 스킬 초 4칸에서 가장 비쌌음) */
    g.shadowColor = 'transparent';
    /* 자간은 캔버스 letterSpacing 이 있으면 한 번에(없는 브라우저는 글자마다 그림) */
    const gl = g as unknown as { letterSpacing?: string };
    this.lsNative = this.ls !== 0 && typeof gl.letterSpacing === 'string';
    if (this.lsNative) gl.letterSpacing = `${this.ls * k}px`;
    this.stateOk = true;
  }

  /** 글자를 그림. 반환 = 칸 크기·보이기가 바뀌었는지(바뀐 때만 HUD 배치를 다시 잴 일이 생김) */
  set(text: string, ver: string): boolean {
    const g = this.g;
    if (!g) {
      if (this.host.textContent === text) return false;
      this.host.textContent = text;
      return true;
    }
    const verChanged = ver !== this.ver;
    if (!verChanged && text === this.text) return false;
    if (verChanged) {
      if (!this.measure()) return false;
      this.ver = ver;
      this.cssW = -1;
      this.stateOk = false;
    }
    this.text = text;
    const empty = text === '';
    let changed = false;
    if (empty !== !this.shown) {
      this.shown = !empty;
      this.host.toggleAttribute('data-e', empty);
      changed = true;
    }
    if (empty) return changed;
    /* 폭 재기용 글꼴(캔버스 상태가 초기화됐으면 다시) */
    if (!this.stateOk) g.font = this.font;
    /* 칸 폭(CSS px): 숫자는 가장 넓은 숫자 폭, 그 밖(쉼표·+·만·억·원)은 제 폭 + 자간 */
    let w = 0;
    for (const ch of text) w += (DIGITS.includes(ch) ? this.digitW : this.wOf(ch)) + this.ls;
    /* 그림자가 있으면 사방에 그만큼 여백(가운데 정렬 칸에서 글자 자리는 그대로) */
    const pad = this.sh ? Math.ceil(Math.max(Math.abs(this.sh.x), Math.abs(this.sh.y)) + this.sh.b) : 0;
    w = Math.ceil(Math.max(1, w - this.ls + 1)) + pad * 2;
    const h = Math.ceil(this.lh) + pad * 2;
    /* 폭은 늘 때 반 숫자 칸 여유를 두고, 줄 때는 한 숫자 칸 넘게 남을 때만 줄임(자릿수가 오르내릴 때마다 레이아웃이 나지 않게) */
    if (this.cssW > 0 && w <= this.cssW && this.cssW - w <= this.digitW + pad) w = this.cssW;
    else if (w > this.cssW && this.cssW > 0) w = Math.ceil(w + this.digitW * 0.5);
    const k = this.dpr;
    if (w !== this.cssW) {
      this.cssW = w;
      this.cv.style.width = `${w}px`;
      this.cv.style.height = `${h}px`;
      this.cv.width = Math.max(1, Math.round(w * k));
      this.cv.height = Math.max(1, Math.round(h * k));
      this.stateOk = false;
      changed = true;
    } else g.clearRect(0, 0, this.cv.width, this.cv.height);
    if (!this.stateOk) this.applyState();
    /* CSS 줄 상자와 같은 기준선: (줄 높이 − 글꼴 높이)/2 + 위 높이 */
    const y = ((h - (this.asc + this.desc)) / 2 + this.asc) * k;
    const x0 = pad * k;
    if (this.sh) {
      g.fillStyle = this.sh.c;
      g.globalAlpha = 0.75;
      g.fillText(text, x0 + this.sh.x * k, y + Math.max(1, this.sh.y) * k);
      g.globalAlpha = 1;
      g.fillStyle = this.color;
    }
    if (this.ls === 0 || this.lsNative) g.fillText(text, x0, y);
    else {
      let x = x0;
      for (const ch of text) {
        g.fillText(ch, x, y);
        x += (this.wOf(ch) + this.ls) * k;
      }
    }
    return changed;
  }
}

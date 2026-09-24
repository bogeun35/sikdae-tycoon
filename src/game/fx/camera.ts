/**
 * 영업 지도 카메라 연출: 흔들림(더하지 않고 큰 값으로 덮음, 초당 40px 감쇠) · 화면 번쩍(#fff0b4, 초당 2 감쇠) ·
 * 줌(대상 쪽으로 살짝) · 비네트(남은 5초 빨강·보스 어둡게) · 테두리 빛(러시·피버) · 쇼크웨이브 필터(동시 데스크톱 3 · 폰 1).
 */
import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import { ShockwaveFilter } from 'pixi-filters';
import gsap from 'gsap';
import { L, view } from '../core/stage';
import { T, gradientTex } from '../core/tex';
import { FX } from '../data';

export class Camera {
  readonly cam = new Container();
  shake = 0;
  flash = 0;
  zoom = 1;
  reduce = false;
  private zoomTo = { x: 0, y: 0 };
  private flashG = new Graphics();
  readonly vignette: Sprite;
  readonly border: Sprite;
  private waves: { f: ShockwaveFilter; t: number; life: number }[] = [];
  maxWaves = 3;
  vigAlpha = 0;
  vigTint = 0xff3b3b;
  borderAlpha = 0;
  borderTint = 0xffd36b;

  constructor() {
    this.vignette = new Sprite(T('fx.vignette'));
    this.vignette.alpha = 0;
    /* 테두리 빛(러시·피버): 가운데 투명 → 가장자리 흰 빛. add 합성이라 흰 텍스처여야 tint 색이 난다 */
    this.border = new Sprite(
      gradientTex(256, 256, (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.72);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(0.55, 'rgba(255,255,255,0.18)');
        gr.addColorStop(1, 'rgba(255,255,255,1)');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }),
    );
    this.border.alpha = 0;
    this.border.blendMode = 'add';
    L.screen.addChild(this.vignette, this.border, this.flashG);
  }

  addShake(a: number): void {
    const v = this.reduce ? a * 0.3 : a;
    this.shake = Math.max(this.shake, v);
  }
  /** 번쩍 피로도: 연달아 번쩍일수록 약해진다(후반 계약이 몰려도 화면이 계속 하얗게 뜨지 않게) */
  private flashHeat = 0;
  private flashCool = 0;
  addFlash(a: number): void {
    if (this.reduce || a <= 0) return;
    const eff = a / (1 + this.flashHeat * 1.5);
    this.flashHeat += 1;
    /* 0.35초 안에 다시 오면 더 센 번쩍만 받음 */
    if (this.flashCool > 0 && eff <= this.flash + 0.08) return;
    this.flash = Math.max(this.flash, eff);
    this.flashCool = 0.35;
  }
  /** 지금 줌에서 화면에 보이는 지도 가로 범위(흔들림 제외). 줌이 1이면 0 ~ W */
  visibleX(W: number): { x0: number; x1: number } {
    const z = Math.max(1, this.zoom);
    const zx = this.zoomTo.x;
    return { x0: zx * (1 - 1 / z), x1: zx + (W - zx) / z };
  }
  /** x,y = 지도 좌표 */
  punchZoom(z: number, x: number, y: number, hold = 0.15): void {
    if (this.reduce || z <= 1) return;
    this.zoomTo.x = x;
    this.zoomTo.y = y;
    gsap.killTweensOf(this);
    gsap.to(this, { zoom: z, duration: 0.15, ease: 'power2.out' });
    gsap.to(this, { zoom: 1, duration: 0.55, delay: 0.15 + hold, ease: 'power2.inOut' });
  }
  shockwave(sx: number, sy: number, strength = 1): boolean {
    if (this.waves.length >= this.maxWaves) return false;
    const f = new ShockwaveFilter({
      center: { x: sx, y: sy },
      amplitude: 22 * strength,
      wavelength: 140 * Math.max(0.6, strength) * view.k * 1.6,
      speed: 900 * view.k * 1.6,
      brightness: 1.08,
      radius: 520 * strength * view.k * 1.6,
      time: 0,
    });
    f.resolution = 1;
    this.waves.push({ f, t: 0, life: 0.65 });
    this.applyFilters();
    return true;
  }
  private applyFilters(): void {
    const list = this.waves.map((w) => w.f);
    L.fxWrap.filters = list.length ? list : null;
    L.fxWrap.filterArea = list.length ? new Rectangle(0, 0, view.w, view.h) : undefined;
  }

  update(rt: number): void {
    this.shake = Math.max(0, this.shake - rt * FX.shakeDecay);
    this.flash = Math.max(0, this.flash - rt * FX.flashDecay);
    this.flashHeat = Math.max(0, this.flashHeat - rt * 1.2);
    this.flashCool -= rt;
    const sx = this.shake > 0.3 ? (Math.random() * 2 - 1) * this.shake : 0;
    const sy = this.shake > 0.3 ? (Math.random() * 2 - 1) * this.shake : 0;
    const z = this.zoom;
    this.cam.pivot.set(this.zoomTo.x, this.zoomTo.y);
    this.cam.position.set(this.zoomTo.x + sx, this.zoomTo.y + sy);
    this.cam.scale.set(z);
    this.flashG.clear();
    if (this.flash > 0.01) this.flashG.rect(0, 0, view.w, view.h).fill({ color: 0xfff0b4, alpha: Math.min(0.28, this.flash * 0.5) });
    this.vignette.width = view.w;
    this.vignette.height = view.h;
    this.vignette.tint = this.vigTint;
    this.vignette.alpha = this.vigAlpha;
    this.border.width = view.w;
    this.border.height = view.h;
    this.border.tint = this.borderTint;
    this.border.alpha = this.borderAlpha;
    if (this.waves.length) {
      let changed = false;
      for (const w of this.waves) {
        w.t += rt;
        w.f.time = w.t;
      }
      const before = this.waves.length;
      this.waves = this.waves.filter((w) => w.t < w.life);
      if (this.waves.length !== before) changed = true;
      if (changed) this.applyFilters();
    }
  }
  destroy(): void {
    this.waves = [];
    L.fxWrap.filters = null;
    L.fxWrap.filterArea = undefined;
    this.flashG.destroy();
    this.vignette.destroy();
    this.border.destroy();
    gsap.killTweensOf(this);
  }
}

/**
 * 타이틀·로딩: 한낮 하늘 배경(bg.title) + 흐르는 구름 + 로고(ui.logo + "식권대장 타이쿤") 튀기 + 햇살 회전.
 * 로딩 막대(그림 준비 중 n / N) → [시작하기] 또는 [이어하기]·[새로 시작].
 */
import { Container, Sprite, Text, type Texture } from 'pixi.js';
import gsap from 'gsap';
import { FONT_STACK } from '../../fonts';
import { VERSION } from '../data';
import { sfx } from '../deps';
import { L, onLayout, view } from '../core/stage';
import { T, rasterKey } from '../core/tex';
import { $, el, img } from '../../ui/dom';

export class TitleScene {
  readonly dom: HTMLElement;
  private bgS: Sprite | null = null;
  private bgTex: Partial<Record<'land' | 'port', Texture>> = {};
  private world = new Container();
  private logo: Container = new Container();
  private rays: Sprite | null = null;
  private clouds: { sp: Sprite; v: number }[] = [];
  private offLayout: (() => void) | null = null;
  private t = 0;
  private shown = false;
  onStart: (mode: 'start' | 'continue' | 'new') => void = () => {};

  constructor(parent: HTMLElement) {
    this.dom = el(
      'div',
      'scr title on',
      `<div class="load"><div class="bar"><i></i></div><p data-v="lt">준비 중…</p></div>
       <div class="tbtns"></div>
       <div class="menu"><button class="mb fs tw" data-a="fs" aria-label="전체화면">${''}</button></div>
       <div class="ver">v${VERSION}</div>`,
    );
    parent.appendChild(this.dom);
    L.bg.addChild(this.world);
  }

  /** 배경·로고를 먼저 굽는다(로딩 막대보다 먼저 보이게) */
  async prepare(): Promise<void> {
    const o = view.orient;
    try {
      this.bgTex[o] = await rasterKey(`bg.title@${o}`, Math.min(2, Math.max(1, view.k * view.dpr)));
    } catch {
      /* 배경 없이 */
    }
    this.bgS = new Sprite(this.bgTex[o] || T('bg.office.sky'));
    this.world.addChild(this.bgS);
    this.offLayout = onLayout(() => void this.layout());
    this.layout();
  }

  async layout(): Promise<void> {
    const o = view.orient;
    if (!this.bgTex[o]) {
      try {
        this.bgTex[o] = await rasterKey(`bg.title@${o}`, Math.min(2, Math.max(1, view.k * view.dpr)));
      } catch {
        /* 무시 */
      }
    }
    if (this.bgS && this.bgTex[o]) this.bgS.texture = this.bgTex[o]!;
    if (this.bgS) {
      const tw = Math.max(1, this.bgS.texture.width);
      const th = Math.max(1, this.bgS.texture.height);
      const s = Math.max(view.w / tw, view.h / th);
      this.bgS.scale.set(s);
      this.bgS.position.set((view.w - tw * s) / 2, (view.h - th * s) / 2);
    }
    this.placeLogo();
  }
  private placeLogo(): void {
    const land = view.orient === 'land';
    const lx = land ? 960 : 540;
    const ly = land ? 360 : 640;
    this.logo.position.set(view.ox + lx * view.k, view.oy + ly * view.k);
    this.logo.scale.set(view.k * (land ? 1 : 0.9 * 1.25));
  }

  /** 그림이 준비된 뒤: 로고 등장 */
  showLogo(): void {
    if (this.shown) return;
    this.shown = true;
    for (let i = 0; i < 3; i++) {
      const sp = new Sprite(T(`bg.cloud${i}`));
      sp.anchor.set(0.5);
      sp.alpha = 0.9;
      sp.position.set(Math.random() * view.w, view.h * (0.08 + i * 0.12));
      sp.scale.set(view.h / 1080);
      this.clouds.push({ sp, v: 10 + i * 6 });
      this.world.addChild(sp);
    }
    this.rays = new Sprite(T('fx.rays'));
    this.rays.anchor.set(0.5);
    this.rays.width = this.rays.height = 1300;
    this.rays.alpha = 0.55;
    const logo = new Sprite(T('ui.logo'));
    logo.anchor.set(0.5);
    logo.scale.set(640 / Math.max(1, logo.texture.width));
    const title = new Text({
      text: '식권대장 타이쿤',
      style: { fontFamily: FONT_STACK, fontSize: 120, fill: '#ffffff', stroke: { color: '#8a5a2a', width: 14, join: 'round' }, dropShadow: { color: '#5c3a1a', distance: 9, blur: 0, alpha: 0.75, angle: Math.PI / 2 }, letterSpacing: 2 },
    });
    title.anchor.set(0.5);
    title.y = 175;
    this.logo.addChild(this.rays, logo, title);
    this.world.addChild(this.logo);
    this.placeLogo();
    const s0 = this.logo.scale.x;
    this.logo.scale.set(s0 * 0.5);
    this.logo.alpha = 0;
    gsap.to(this.logo, { alpha: 1, duration: 0.15 });
    gsap.to(this.logo.scale, { x: s0 * 1.15, y: s0 * 1.15, duration: 0.32, ease: 'power2.out' });
    gsap.to(this.logo.scale, { x: s0, y: s0, duration: 0.3, delay: 0.32, ease: 'back.out(3)', onComplete: () => this.placeLogo() });
    sfx('title_logo');
  }

  progress(done: number, total: number): void {
    const i = $(this.dom, '.bar i');
    if (i) i.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
    const p = $(this.dom, '[data-v="lt"]');
    if (p) p.textContent = `그림 준비 중 ${done} / ${total}`;
  }

  ready(hasSave: boolean): void {
    const load = $(this.dom, '.load');
    if (load) load.style.display = 'none';
    const b = $(this.dom, '.tbtns')!;
    b.innerHTML = hasSave
      ? `<button class="go tw" data-a="continue">${img('ic.play')}이어하기</button><button class="btn light tw" data-a="new">${img('ic.reset')}새로 시작</button>`
      : `<button class="go tw" data-a="start">${img('ic.play')}시작하기</button>`;
    b.classList.add('show');
    for (const x of Array.from(b.querySelectorAll<HTMLElement>('[data-a]'))) {
      x.addEventListener('click', () => this.onStart(x.dataset.a as 'start' | 'continue' | 'new'));
    }
  }
  setFsIcon(on: boolean): void {
    const b = $(this.dom, '[data-a="fs"]');
    if (b) b.innerHTML = img(on ? 'ic.fullscreenExit' : 'ic.fullscreen');
  }

  update(dt: number): void {
    this.t += dt;
    if (this.rays) this.rays.rotation += dt * 0.25;
    for (const c of this.clouds) {
      c.sp.x += c.v * dt * view.k * 2;
      if (c.sp.x - c.sp.width / 2 > view.w) c.sp.x = -c.sp.width / 2;
    }
    if (this.shown && !gsap.isTweening(this.logo.scale)) {
      const land = view.orient === 'land';
      const ly = land ? 360 : 640;
      this.logo.y = view.oy + ly * view.k + Math.sin(this.t * 1.6) * 8 * view.k;
    }
  }

  destroy(): void {
    this.offLayout?.();
    this.dom.remove();
    this.world.destroy({ children: true });
  }
}

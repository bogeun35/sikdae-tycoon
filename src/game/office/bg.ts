/**
 * 사무실 배경(화면 좌표): 원작 항구처럼 보라→분홍 노을 하늘(타원 중심이 화면 아래 바깥) + 반짝이는 별(패럴랙스 3층)
 * + 먼 스카이라인(0.3) + 가까운 스카이라인 + 흐르는 구름.
 */
import { Container, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { view } from '../core/stage';
import { T, gradientTex } from '../core/tex';

let skyTex: Texture | null = null;
function sky(): Texture {
  if (skyTex) return skyTex;
  skyTex = gradientTex(512, 512, (g, w, h) => {
    const gr = g.createRadialGradient(w * 0.5, h * 1.1, 0, w * 0.5, h * 1.1, h * 1.25);
    /* 분홍·보라 띠를 위로 올림: 아래쪽은 스카이라인·패널에 가려서, 보이는 자리(패널 옆·위)에 노을이 걸리게 */
    gr.addColorStop(0, '#ffd1a3');
    gr.addColorStop(0.3, '#ffc2b4');
    gr.addColorStop(0.44, '#f9a8c9');
    gr.addColorStop(0.62, '#9b7bd8');
    gr.addColorStop(0.84, '#2b3f8a');
    gr.addColorStop(1, '#16224f');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  return skyTex;
}

interface Star { sp: Sprite; x: number; y: number; layer: number; ph: number; sp0: number }

export class OfficeBg {
  readonly root = new Container();
  private skyS: Sprite;
  private stars: Star[] = [];
  private far: TilingSprite;
  private near: TilingSprite;
  private clouds: { sp: Sprite; v: number; y: number; layer: number }[] = [];
  private t = 0;
  private px = 0;
  private py = 0;
  private tx = 0;
  private ty = 0;
  private onMove = (e: PointerEvent) => {
    this.tx = e.clientX / Math.max(1, view.w) - 0.5;
    this.ty = e.clientY / Math.max(1, view.h) - 0.5;
  };

  constructor() {
    this.skyS = new Sprite(sky());
    this.root.addChild(this.skyS);
    for (let i = 0; i < 70; i++) {
      const layer = i % 3;
      const sp = new Sprite(T(layer === 2 ? 'fx.spark' : 'fx.dot'));
      sp.anchor.set(0.5);
      sp.blendMode = 'add';
      const s = layer === 2 ? 0.28 + Math.random() * 0.25 : 0.1 + Math.random() * 0.12 + layer * 0.05;
      this.stars.push({ sp, x: Math.random(), y: Math.pow(Math.random(), 1.4) * 0.62, layer, ph: Math.random() * 6.28, sp0: s });
      this.root.addChild(sp);
    }
    for (let i = 0; i < 5; i++) {
      const sp = new Sprite(T(`bg.cloud${i % 3}`));
      sp.anchor.set(0.5);
      sp.alpha = 0.55 + (i % 2) * 0.25;
      this.clouds.push({ sp, v: 6 + Math.random() * 10, y: 0.12 + Math.random() * 0.45, layer: i % 2 });
      sp.x = Math.random() * 2000;
      this.root.addChild(sp);
    }
    this.far = new TilingSprite({ texture: T('bg.office.skylineFar'), width: 100, height: 100 });
    this.far.anchor.set(0, 1);
    this.far.alpha = 0.85;
    this.near = new TilingSprite({ texture: T('bg.office.skyline'), width: 100, height: 100 });
    this.near.anchor.set(0, 1);
    this.root.addChild(this.far, this.near);
    window.addEventListener('pointermove', this.onMove);
    this.layout();
  }

  layout(): void {
    const w = view.w;
    const h = view.h;
    this.skyS.width = w;
    this.skyS.height = h;
    const port = w / h < 1;
    const nh = h * (port ? 0.2 : 0.3);
    const fh = h * (port ? 0.18 : 0.26);
    const nt = this.near.texture;
    const ft = this.far.texture;
    const ns = nh / Math.max(1, nt.height);
    const fs = fh / Math.max(1, ft.height);
    this.near.tileScale.set(ns);
    this.far.tileScale.set(fs);
    this.near.width = w + 80;
    this.near.height = nh;
    this.far.width = w + 80;
    this.far.height = fh;
    this.near.position.set(-40, h + 2);
    this.far.position.set(-40, h - nh * 0.35);
    for (const c of this.clouds) c.sp.scale.set((h / 1080) * (c.layer ? 1.1 : 0.75) * (port ? 1.4 : 1));
  }

  update(dt: number): void {
    this.t += dt;
    const w = view.w;
    const h = view.h;
    this.px += (this.tx - this.px) * Math.min(1, dt * 3);
    this.py += (this.ty - this.py) * Math.min(1, dt * 3);
    for (const s of this.stars) {
      const par = (s.layer + 1) * 10;
      const drift = (this.t * (s.layer + 1) * 0.004) % 1;
      const x = ((s.x + drift) % 1) * w - this.px * par;
      const y = s.y * h - this.py * par * 0.6;
      s.sp.position.set(x, y);
      const tw = 0.45 + 0.55 * Math.pow(Math.max(0, Math.sin(this.t * (1.2 + s.layer * 0.7) + s.ph)), 2);
      s.sp.alpha = tw * (s.layer === 2 ? 0.9 : 0.8);
      s.sp.scale.set(s.sp0 * (0.8 + tw * 0.4) * (h / 900));
      s.sp.rotation = s.layer === 2 ? this.t * 0.4 + s.ph : 0;
    }
    for (const c of this.clouds) {
      c.sp.x += c.v * dt * (c.layer ? 1.4 : 0.8);
      if (c.sp.x - c.sp.width / 2 > w + 40) c.sp.x = -c.sp.width / 2 - 40;
      c.sp.y = c.y * h - this.py * (c.layer ? 14 : 8);
      c.sp.x += 0;
    }
    this.far.tilePosition.x = -this.px * 18 * 0.3 - this.t * 3;
    this.near.tilePosition.x = -this.px * 18 - this.t * 7;
  }

  destroy(): void {
    window.removeEventListener('pointermove', this.onMove);
    this.root.destroy({ children: true });
  }
}

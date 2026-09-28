/**
 * 파티클 — 스프라이트 풀(매 프레임 new 없음). 예산을 넘으면 가장 오래된 것부터 지운다.
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import { setTint } from '../core/tex';

export interface POpts {
  x: number; y: number; vx?: number; vy?: number; g?: number; drag?: number; life?: number; rot?: number; vr?: number;
  s0?: number; s1?: number; a0?: number; a1?: number; tint?: number; blend?: 'add' | 'normal'; delay?: number; flip?: boolean;
  /** 떨어지며 흔들리는 색종이 */
  wobble?: number; spin3d?: boolean;
}
interface P {
  sp: Sprite; x: number; y: number; vx: number; vy: number; g: number; drag: number; t: number; life: number; rot: number; vr: number;
  s0: number; s1: number; a0: number; a1: number; delay: number; wobble: number; ph: number; spin3d: boolean; baseSx: number;
}

export class Particles {
  readonly view = new Container();
  /** 블렌드별 층(보통 → add). 한 층 안에서는 블렌드가 같아 한 번에 그려짐 — 섞여 있으면 바뀔 때마다 그리기가 끊김(설계서 7장 6) */
  private nC = new Container();
  private aC = new Container();
  private live: P[] = [];
  private free: Sprite[] = [];
  constructor(public budget = 600) {
    this.view.addChild(this.nC, this.aC);
  }

  emit(tex: Texture, o: POpts): void {
    while (this.live.length >= this.budget && this.live.length) {
      const old = this.live.shift()!;
      old.sp.visible = false;
      this.free.push(old.sp);
    }
    if (this.budget <= 0) return;
    const sp = this.free.pop() || new Sprite();
    const add = o.blend === 'add';
    const layer = add ? this.aC : this.nC;
    if (sp.parent !== layer) layer.addChild(sp);
    sp.texture = tex;
    sp.anchor.set(0.5);
    sp.visible = (o.delay || 0) <= 0;
    setTint(sp, o.tint ?? 0xffffff);
    sp.blendMode = add ? 'add' : 'normal';
    sp.rotation = o.rot || 0;
    const s0 = o.s0 ?? 1;
    sp.scale.set(s0);
    sp.alpha = o.a0 ?? 1;
    sp.position.set(o.x, o.y);
    this.live.push({
      sp, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, g: o.g || 0, drag: o.drag || 0, t: 0, life: o.life || 0.8, rot: o.rot || 0, vr: o.vr || 0,
      s0, s1: o.s1 ?? s0, a0: o.a0 ?? 1, a1: o.a1 ?? 0, delay: o.delay || 0, wobble: o.wobble || 0, ph: Math.random() * 6.28, spin3d: !!o.spin3d, baseSx: 1,
    });
  }

  /** 한 점에서 퍼지는 폭발 */
  burst(tex: Texture, x: number, y: number, n: number, o: Partial<POpts> & { spMin?: number; spMax?: number; up?: number } = {}): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (o.spMin ?? 90) + Math.random() * ((o.spMax ?? 320) - (o.spMin ?? 90));
      this.emit(tex, {
        ...o, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up ?? 80), life: (o.life ?? 0.7) * (0.75 + Math.random() * 0.5),
        rot: Math.random() * 6.28, vr: o.vr ?? (Math.random() - 0.5) * 10,
      });
    }
  }

  update(dt: number): void {
    const L = this.live;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      if (p.delay > 0) {
        p.delay -= dt;
        if (p.delay > 0) {
          L[w++] = p;
          continue;
        }
        p.sp.visible = true;
      }
      p.t += dt;
      if (p.t >= p.life) {
        p.sp.visible = false;
        this.free.push(p.sp);
        continue;
      }
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt + (p.wobble ? Math.sin(p.t * 5 + p.ph) * p.wobble * dt : 0);
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const k = p.t / p.life;
      const s = p.s0 + (p.s1 - p.s0) * k;
      p.sp.position.set(p.x, p.y);
      p.sp.rotation = p.rot;
      if (p.spin3d) p.sp.scale.set(s * Math.cos(p.t * 9 + p.ph), s);
      else p.sp.scale.set(s);
      p.sp.alpha = k < 0.6 ? p.a0 : p.a0 + (p.a1 - p.a0) * ((k - 0.6) / 0.4);
      L[w++] = p;
    }
    L.length = w;
  }

  clear(): void {
    for (const p of this.live) {
      p.sp.visible = false;
      this.free.push(p.sp);
    }
    this.live.length = 0;
  }
  get count(): number {
    return this.live.length;
  }
}

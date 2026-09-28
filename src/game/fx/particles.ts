/**
 * 파티클 — 스프라이트 풀(매 프레임 new 없음). 예산을 넘으면 가장 오래된 것부터 지운다.
 * 다 쓴 스프라이트는 층에 붙인 채 알파·크기 0 으로 둔다(visible 을 끄고 켜면 그때마다 Pixi 가 그 묶음의 그리기 목록을 새로 짬 —
 * 영업 후반 측정에서 파티클 묶음이 537프레임 중 535번 다시 짜였음). 풀은 층(보통·add)마다 따로라 층을 옮기지도 않음
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
  /** add 층 스프라이트인지(풀 돌려줄 곳) */
  add: boolean;
}

export class Particles {
  readonly view = new Container();
  /** 블렌드별 층(보통 → add). 한 층 안에서는 블렌드가 같아 한 번에 그려짐 — 섞여 있으면 바뀔 때마다 그리기가 끊김(설계서 7장 6) */
  private nC = new Container();
  private aC = new Container();
  private live: P[] = [];
  /** 층별 빈 스프라이트(보통 · add) */
  private freeN: Sprite[] = [];
  private freeA: Sprite[] = [];
  /**
   * group = 파티클 층을 따로 묶음(Pixi render group). 쉬는 스프라이트까지 층에 남아 있으므로, 같은 묶음의 다른 것(계약 링·글로우·배너 등)이
   * 생기고 사라질 때마다 쉬는 스프라이트까지 다시 짜지 않게 — 파티클 묶음은 풀이 늘 때만 다시 짬
   */
  constructor(public budget = 600, group = false) {
    this.view.addChild(this.nC, this.aC);
    if (group) this.view.isRenderGroup = true;
  }

  /** 안 보이게(층에서 떼지 않음): 알파 0 · 크기 0 */
  private park(sp: Sprite): void {
    sp.alpha = 0;
    sp.scale.set(0);
  }
  private release(p: P): void {
    this.park(p.sp);
    (p.add ? this.freeA : this.freeN).push(p.sp);
  }

  emit(tex: Texture, o: POpts): void {
    while (this.live.length >= this.budget && this.live.length) this.release(this.live.shift()!);
    if (this.budget <= 0) return;
    const add = o.blend === 'add';
    let sp = (add ? this.freeA : this.freeN).pop();
    if (!sp) {
      sp = new Sprite();
      sp.anchor.set(0.5);
      sp.blendMode = add ? 'add' : 'normal';
      (add ? this.aC : this.nC).addChild(sp);
    }
    sp.texture = tex;
    /* 늦게 나오는 것은 나올 때까지 알파·크기 0(update 가 나오는 프레임에 채움) */
    const wait = (o.delay || 0) > 0;
    setTint(sp, o.tint ?? 0xffffff);
    sp.rotation = o.rot || 0;
    const s0 = o.s0 ?? 1;
    sp.scale.set(wait ? 0 : s0);
    sp.alpha = wait ? 0 : o.a0 ?? 1;
    sp.position.set(o.x, o.y);
    this.live.push({
      sp, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, g: o.g || 0, drag: o.drag || 0, t: 0, life: o.life || 0.8, rot: o.rot || 0, vr: o.vr || 0,
      s0, s1: o.s1 ?? s0, a0: o.a0 ?? 1, a1: o.a1 ?? 0, delay: o.delay || 0, wobble: o.wobble || 0, ph: Math.random() * 6.28, spin3d: !!o.spin3d, baseSx: 1, add,
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
      }
      p.t += dt;
      if (p.t >= p.life) {
        this.release(p);
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
    for (const p of this.live) this.release(p);
    this.live.length = 0;
  }
  get count(): number {
    return this.live.length;
  }
}

/**
 * 효과음 한 번 재생 — 실시간(index.ts)과 측정(render.ts)이 같이 쓴다.
 */
import { clamp, makeX, type Graph } from './core';
import type { Gate } from './gate';
import type { SfxName } from './names';
import { SFX, type SfxOpts, type SfxState } from './sfx';

/** 효과음을 예약하고 끝나는 시각을 돌려줌. 문지기에 걸리면 null */
export function playSfx(g: Graph, gate: Gate, st: SfxState, name: SfxName, opts: SfxOpts, now: number): number | null {
  const fn = SFX[name];
  if (!fn) return null;
  const t = now + 0.005 + Math.max(0, Number(opts.delay) || 0);
  if (gate.check(name, t, now) !== 'ok') return null;
  const c = g.ctx;
  let out: AudioNode = g.sfxBus;
  const pan = Number(opts.pan) || 0;
  if (pan && typeof c.createStereoPanner === 'function') {
    const p = c.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    p.connect(g.sfxBus);
    out = p;
  }
  // pitch = 주파수 배율 (1 = 그대로). 없거나 0 이하면 1
  const pr = Number(opts.pitch);
  const p = pr > 0 ? clamp(pr, 0.25, 4) : 1;
  const v = opts.vol == null ? 1 : clamp(Number(opts.vol) || 0, 0, 2);
  const end = fn(makeX(g, g.sfx, p, v, out), t, opts, st);
  gate.add(name, t, end);
  return end;
}

/**
 * 효과음 문지기 — 간격 제한(같은 이름 연타 버림) + 동시 발음 한도(14, important 는 무시) + 이름별 동시 한도.
 * 시각을 인자로 받으므로 실시간·측정(OfflineAudioContext) 모두 같은 규칙으로 돈다.
 */
import { IMPORTANT, MAX_PER_NAME, MAX_VOICES, THROTTLE, type SfxName } from './names';

export type GateResult = 'ok' | 'throttle' | 'voices' | 'per-name';

export class Gate {
  private last = new Map<SfxName, number>();
  private voices: { name: SfxName; end: number }[] = [];
  /** 버린 횟수 (개발 페이지 표시용) */
  readonly dropped: Record<Exclude<GateResult, 'ok'>, number> = { throttle: 0, voices: 0, 'per-name': 0 };

  check(name: SfxName, t: number, now: number): GateResult {
    const thr = THROTTLE[name];
    const l = this.last.get(name);
    if (thr && l != null && Math.abs(t - l) < thr) return this.drop('throttle');
    if (this.voices.length) this.voices = this.voices.filter((v) => v.end > now);
    if (IMPORTANT.has(name)) return 'ok';
    if (this.voices.length >= MAX_VOICES) return this.drop('voices');
    const cap = MAX_PER_NAME[name];
    if (cap) {
      let n = 0;
      for (const v of this.voices) if (v.name === name) n++;
      if (n >= cap) return this.drop('per-name');
    }
    return 'ok';
  }

  add(name: SfxName, t: number, end: number): void {
    this.last.set(name, t);
    this.voices.push({ name, end: end + 0.04 });
  }

  active(now: number): number {
    return this.voices.filter((v) => v.end > now).length;
  }

  private drop(r: Exclude<GateResult, 'ok'>): GateResult {
    this.dropped[r]++;
    return r;
  }
}

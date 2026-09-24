/**
 * 시간: 로직 배속([ ] 키 1·2·4·8·16배, 저장 안 됨) · 히트스톱(로직만 멈춤) · 슬로모(로직만 느리게).
 * 렌더·파티클·UI 는 실제 시간(rt)으로 움직인다.
 */
import { F } from '../data';

export const clock = {
  speed: 1,
  /** 남은 히트스톱(실제 초) */
  stop: 0,
  stopCool: 0,
  /** 최근 1초 동안 쓴 히트스톱(초) */
  stopWindow: [] as { at: number; d: number }[],
  slowRate: 1,
  slowLeft: 0,
  now: 0,
};

export const SPEEDS: number[] = F.SPEEDS;

export function setSpeed(n: number): number {
  clock.speed = Math.max(0.25, Math.min(30, Number(n) || 1));
  speedListeners.forEach((f) => f(clock.speed));
  return clock.speed;
}
export function stepSpeed(dir: 1 | -1): number {
  let i = SPEEDS.indexOf(clock.speed);
  if (i < 0) i = 0;
  return setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + dir))]);
}
const speedListeners: ((s: number) => void)[] = [];
export function onSpeed(f: (s: number) => void): void {
  speedListeners.push(f);
}

/** 히트스톱 요청(ms). 쿨 0.4초 · 1초에 최대 0.12초 */
export function hitstop(ms: number): void {
  if (ms <= 0) return;
  const H = { cooldown: 0.4, maxPerSec: 0.12 };
  if (clock.stopCool > 0) return;
  const now = clock.now;
  clock.stopWindow = clock.stopWindow.filter((w) => now - w.at < 1);
  const used = clock.stopWindow.reduce((a, w) => a + w.d, 0);
  const d = Math.min(ms / 1000, H.maxPerSec - used);
  if (d <= 0.005) return;
  clock.stop = Math.max(clock.stop, d);
  clock.stopCool = H.cooldown;
  clock.stopWindow.push({ at: now, d });
}
export function slowmo(rate: number, sec: number): void {
  clock.slowRate = Math.min(clock.slowRate, rate);
  clock.slowLeft = Math.max(clock.slowLeft, sec);
}
/** 실제 dt → 로직 dt 배율 (한 프레임마다 부름) */
export function tickClock(rt: number): number {
  clock.now += rt;
  clock.stopCool = Math.max(0, clock.stopCool - rt);
  if (clock.slowLeft > 0) {
    clock.slowLeft -= rt;
    if (clock.slowLeft <= 0) clock.slowRate = 1;
  }
  if (clock.stop > 0) {
    clock.stop -= rt;
    return 0;
  }
  return clock.speed * clock.slowRate;
}
export function resetClockFx(): void {
  clock.stop = 0;
  clock.slowLeft = 0;
  clock.slowRate = 1;
}

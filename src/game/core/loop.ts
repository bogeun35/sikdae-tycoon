/**
 * 프레임 루프(설계서 7장): Pixi ticker 의 자체 rAF·자동 렌더를 끄고 이 루프 하나가 돈다.
 *  - 프레임 상한(폰 30 · 데스크톱 60, 120Hz 화면에서도 상한 넘지 않게). 상한이 화면 주사율보다 낮으면 다음 프레임 차례가
 *    가까워질 때까지 rAF 를 요청하지 않는다(타이머로 기다림) — 요청한 rAF 마다 브라우저가 스타일·레이아웃·합성 한 바퀴를 도므로
 *    건너뛸 프레임은 아예 요청하지 않는 것이 메인 스레드를 가장 아낀다
 *  - 한 프레임 = GSAP 1틱 → 장면 갱신(app.ticker 리스너) → stage 렌더(연속 또는 dirty 일 때만) → fxTop 렌더(그릴 것 있을 때만)
 *  - 사무실은 바뀔 때만 그림(requestRender). 할 일(dirty·트윈·fxTop·깨어 있을 이유)이 0.6초 동안 없으면 잠듦:
 *    rAF 를 멈추고 0.25초마다 장면 갱신만(그리지 않음). requestRender · 입력(포인터·휠·키)이면 바로 깸
 *  - 숨김 탭: rAF·타이머를 멈춤. 돌아오면 첫 프레임 dt 는 main 의 상한(0.1초)
 * 검수 훅: window.__sikdae.perf = { updates, renders, fxRenders, workMs, lastRenderAt, fpsCap, sleeps, … } (숫자만)
 */
import gsap from 'gsap';
import { Ticker } from 'pixi.js';
import { app, fxApp } from './stage';

export const perf = {
  /** 루프가 갱신한 프레임 수 */
  updates: 0,
  /** stage 렌더 수 */
  renders: 0,
  /** fxTop 렌더 수 */
  fxRenders: 0,
  /** 갱신 + 렌더 누적 ms(performance.now) */
  workMs: 0,
  /** 마지막 stage 렌더 시각(performance.now) */
  lastRenderAt: 0,
  /** 최근 프레임 작업 ms */
  lastWorkMs: 0,
  fpsCap: 60,
  res: 1,
  tier: '',
  quality: '',
  /** 숨김 탭 동안 렌더(0 이어야 함) */
  hiddenRenders: 0,
  /** 잠든 횟수 · 잠든 동안 갱신(0.25초 틱) 수 */
  sleeps: 0,
  idleTicks: 0,
  /** 1 = 지금 잠듦 */
  asleep: 0,
  /** GPU 텍스처 수(메모리 검사, main 이 채움) */
  textures: 0,
  /** 그 가운데 렌더(stage + fxTop) 누적 ms · 장면 갱신 누적 ms */
  renderMs: 0,
  updateMs: 0,
};

let continuous = true;
let dirty = 3;
let cap = 60;
let running = false;
let raf = 0;
let waitT = 0;
let idleT = 0;
let lastUpd = -1;
/** 실제로 마지막 갱신한 시각(dt 계산용 — lastUpd 는 차례 기준 시각) */
let lastReal = -1;
let heartbeat = 0;
let quietMs = 0;
let asleep = false;
let fxNeeds: () => boolean = () => false;
let awakeFn: () => boolean = () => false;
const frameHooks: ((dtMs: number, workMs: number) => void)[] = [];

/** 할 일이 없을 때 잠들기까지(ms) · 잠든 동안 갱신 간격(ms) · 안전망 렌더 간격(ms) */
const SLEEP_AFTER = 600;
const IDLE_TICK = 250;
const HEARTBEAT = 2000;

/** stage 를 n 프레임 더 그림(사무실처럼 바뀔 때만 그리는 장면) */
export function requestRender(frames = 1): void {
  if (frames > dirty) dirty = frames;
  if (asleep) wake();
}
/** true = 매 프레임 그림(타이틀·영업), false = requestRender 때만(사무실) */
export function setContinuous(on: boolean): void {
  continuous = on;
  dirty = Math.max(dirty, 2);
  if (asleep) wake();
}
export function setFpsCap(n: number): void {
  cap = Math.max(10, Math.min(240, n || 60));
  perf.fpsCap = cap;
}
export function fpsCap(): number {
  return cap;
}
/** fxTop 에 그릴 것이 있는지 알려 주는 함수 */
export function setFxNeeds(fn: () => boolean): void {
  fxNeeds = fn;
}
/** 장면이 매 프레임 갱신이 필요한지(숫자 따라 올라가는 중 등). false 가 이어지면 잠듦 */
export function setAwake(fn: () => boolean): void {
  awakeFn = fn;
}
/** 프레임마다 (실제 간격 ms, 작업 ms) — 화질 자동 조절이 씀 */
export function onFrame(fn: (dtMs: number, workMs: number) => void): void {
  frameHooks.push(fn);
}

/** GSAP 트윈·지연 호출이 하나라도 남아 있는지(전역 타임라인 자식. 끝난 것은 자동으로 빠짐) */
export function gsapBusy(): boolean {
  return !!(gsap.globalTimeline as unknown as { _first?: unknown })._first;
}

/**
 * GSAP 는 이 루프에서만 갱신(gsap.updateRoot). GSAP ticker 에서 updateRoot 를 떼어 둠 — 안 떼면 잠든 ticker 를 새 트윈이 깨울 때마다
 * (영업 중 프레임마다) 그 자리에서 전체 트윈을 한 번 더 갱신해 프레임당 두 번 돌았음. ticker 는 새 트윈이 깨워도 다음 프레임에 재움(자기 rAF 없음).
 * 시간은 실제 흐른 시간(0.5초 넘게 멈췄으면 33ms 만 흐른 것으로 — 옛 lagSmoothing(500, 33) 과 같게)
 */
let gsapTime = -1;
let gsapLast = -1;
function gsapTick(): void {
  const now = performance.now();
  if (gsapTime < 0) gsapTime = gsap.ticker.time;
  else {
    let d = now - gsapLast;
    if (d > 500 || d < 0) d = 33;
    gsapTime += d / 1000;
  }
  gsapLast = now;
  gsap.updateRoot(gsapTime);
  gsap.ticker.sleep();
}

function clearWaits(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (waitT) clearTimeout(waitT);
  waitT = 0;
  if (idleT) clearTimeout(idleT);
  idleT = 0;
}

/**
 * 화면 주사율 한 칸(ms) 어림: rAF 안에서 바로 다시 요청한 rAF 사이 간격의 이동평균(60Hz 16.7 · 120Hz 8.3).
 * 프레임 차례는 "차례 − 반 칸" 부터 받는다 — 30fps·60Hz 에서 두 칸마다 정확히 한 번(예전: 차례 −4ms 부터 받아
 * 한 칸 어긋나면 세 칸(50ms)을 기다리던 것, 폰 렌더 간격 평균 47~50ms 의 원인)
 */
let vsync = 1000 / 60;
let lastRafAt = -1;
let rafDirect = false;
function acceptAt(): number {
  return lastUpd + 1000 / cap - vsync * 0.5;
}
function reqRaf(direct: boolean): void {
  if (raf) return;
  rafDirect = direct;
  raf = requestAnimationFrame(frame);
}

/** 다음 프레임 예약: 받을 차례가 주사율 1.5칸보다 멀면 타이머로 한 칸 앞까지 기다렸다가 rAF(그 사이 브라우저는 프레임을 만들지 않음) */
function schedule(now: number): void {
  if (document.hidden || asleep) return;
  const left = lastUpd < 0 ? 0 : acceptAt() - now;
  if (left > vsync * 1.5) {
    if (!waitT)
      waitT = window.setTimeout(() => {
        waitT = 0;
        if (!asleep && !document.hidden) reqRaf(false);
      }, left - vsync);
    return;
  }
  /*
   * 바로 rAF 를 요청하면 다음 화면 갱신(vsync)에 불린다. 그 vsync 가 차례보다 이르면(30fps · 60Hz 에서 한 칸 건너뛸 때) 그 rAF 는
   * 할 일 없이 돌아가며 브라우저 프레임 한 바퀴(입력 처리·스타일·합성)만 더 돌리므로(폰 4배 느림에서 프레임당 수 ms), 그 vsync 가 지난 뒤에 요청
   */
  if (left > 0 && lastRafAt >= 0) {
    const nextV = lastRafAt + vsync * Math.max(1, Math.ceil((now - lastRafAt) / vsync));
    if (nextV < acceptAt() - 1) {
      if (!waitT)
        waitT = window.setTimeout(() => {
          waitT = 0;
          if (!asleep && !document.hidden) reqRaf(false);
        }, Math.max(0, nextV - now + 2));
      return;
    }
  }
  reqRaf(true);
}

function wake(): void {
  if (!running) return;
  quietMs = 0;
  if (!asleep) return;
  asleep = false;
  perf.asleep = 0;
  if (idleT) clearTimeout(idleT);
  idleT = 0;
  lastUpd = -1;
  lastReal = -1;
  if (!document.hidden) reqRaf(false);
}

function sleep(): void {
  if (asleep) return;
  asleep = true;
  perf.asleep = 1;
  perf.sleeps++;
  clearWaits();
  idleT = window.setTimeout(idleTick, IDLE_TICK);
}

/** 잠든 동안: 장면 갱신만(HUD 글자·알림 등). 그릴 일이 생기면(requestRender) 깸 */
function idleTick(): void {
  idleT = 0;
  if (!asleep || document.hidden) return;
  const now = performance.now();
  const dtMs = Math.min(IDLE_TICK * 2, lastReal < 0 ? IDLE_TICK : now - lastReal);
  lastReal = now;
  const t0 = performance.now();
  perf.idleTicks++;
  gsapTick();
  app.ticker.update(now);
  heartbeat += dtMs;
  if (heartbeat >= HEARTBEAT) {
    heartbeat = 0;
    app.render();
    perf.renders++;
    perf.lastRenderAt = now;
  }
  perf.workMs += performance.now() - t0;
  /* 갱신 중 깨울 일이 생겼으면(requestRender · 트윈 · fxTop · 숫자 따라가기) 바로 rAF 로 */
  if (dirty > 0 || continuous || gsapBusy() || fxNeeds() || awakeFn()) wake();
  else if (asleep) idleT = window.setTimeout(idleTick, IDLE_TICK);
}

function frame(now: number): void {
  raf = 0;
  /* 주사율 어림: 바로 다시 요청한 rAF 사이 간격만(타이머를 거친 것은 기다린 시간이 섞임) */
  if (rafDirect && lastRafAt >= 0) {
    const d = now - lastRafAt;
    /* 한 칸짜리 간격만(차례를 기다려 두 칸 뒤에 불린 것은 빼고) */
    if (d > 3 && d < Math.min(40, vsync * 1.5)) vsync += (d - vsync) * 0.2;
  }
  lastRafAt = now;
  if (document.hidden) return;
  const gap = 1000 / cap;
  if (lastUpd >= 0 && now < acceptAt()) {
    /* 너무 이른 rAF(30fps 상한 · 120Hz 화면 등): 차례까지 다시 기다림 */
    schedule(now);
    return;
  }
  const dtMs = lastReal < 0 ? gap : Math.min(250, now - lastReal);
  lastReal = now;
  /* 누적 오차 없이 차례를 앞으로: 밀렸으면 지금 기준으로 */
  lastUpd = lastUpd < 0 || now - lastUpd > gap * 2 ? now : lastUpd + gap;
  const t0 = performance.now();
  perf.updates++;
  gsapTick();
  app.ticker.update(now);
  const t1 = performance.now();
  perf.updateMs += t1 - t0;
  heartbeat += dtMs;
  let draw = continuous || dirty > 0;
  if (!draw && heartbeat >= HEARTBEAT) draw = true;
  if (draw) {
    heartbeat = 0;
    if (dirty > 0) dirty--;
    app.render();
    perf.renders++;
    perf.lastRenderAt = now;
    if (document.hidden) perf.hiddenRenders++;
  }
  const fxOn = fxNeeds();
  if (fxOn) {
    fxApp.render();
    perf.fxRenders++;
    if (document.hidden) perf.hiddenRenders++;
  }
  const t2 = performance.now();
  perf.renderMs += t2 - t1;
  const w = t2 - t0;
  perf.workMs += w;
  perf.lastWorkMs = w;
  for (const f of frameHooks) f(dtMs, w);
  /* 할 일이 없으면 잠들 준비 */
  const busy = continuous || dirty > 0 || fxOn || gsapBusy() || awakeFn();
  if (busy) quietMs = 0;
  else quietMs += dtMs;
  if (quietMs >= SLEEP_AFTER) sleep();
  else schedule(performance.now());
}

/** Pixi 자동 렌더·자체 rAF 를 끄고 이 루프를 시작 */
export function startLoop(): void {
  if (running) return;
  running = true;
  app.ticker.remove(app.render, app);
  app.stop();
  /* 이벤트 시스템(Ticker.system)은 쓰지 않음(트리·영업 입력은 DOM 리스너) — 매 프레임 도는 rAF 를 멈춤 */
  try {
    Ticker.system.autoStart = false;
    Ticker.system.stop();
    Ticker.shared.autoStart = false;
    Ticker.shared.stop();
  } catch {
    /* 무시 */
  }
  gsap.ticker.lagSmoothing(500, 33);
  gsap.ticker.remove(gsap.updateRoot);
  gsap.ticker.sleep();
  reqRaf(false);
  /* 입력이 오면 깸(트리 끌기·휠 줌·버튼 누름 뒤 연출) */
  const poke = () => {
    if (asleep) wake();
    else quietMs = 0;
  };
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'])
    window.addEventListener(ev, poke, { capture: true, passive: true });
  /* 숨김 탭: rAF 가 멈추지만 혹시 도는 브라우저(일부 WebView)를 위해 명시적으로 멈춤 */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearWaits();
    } else {
      lastUpd = -1;
      lastReal = -1;
      dirty = Math.max(dirty, 2);
      quietMs = 0;
      if (asleep) {
        asleep = false;
        perf.asleep = 0;
      }
      reqRaf(false);
    }
  });
}

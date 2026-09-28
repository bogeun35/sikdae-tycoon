/**
 * 식권대장 타이쿤 — 본체 진입점.
 * 타이틀(로딩) → 사무실(허브) ⇄ 영업(탑뷰 상권 지도, 한 판 = 1영업일) → 정산 모달.
 * 렌더 = Pixi ticker, 영업 로직 = 누적 dt 고정 스텝(lunch/scene.ts). 저장 = 5초마다 + 영업 끝 + 탭 숨김·창 닫기.
 */
import './style.css';
import type { WebGLRenderer } from 'pixi.js';
import { loadFonts } from './fonts';
import { isFullscreen, isFullscreenSupported, onFullscreenChange, toggleFullscreen } from './fullscreen';
import { getPlatform } from './platform';
import { storage } from './storage';
import { injectStyle } from './ui/style';
import { clearToasts, img, installButtonFeel, mountToasts, toast } from './ui/dom';
import { LunchHud, anchorOf, bumpAnchor, displayBusy, snapDisplay, tickDisplay } from './ui/hud';
import { districtModal, endingModal, hideModal, modalKey, modalOpen, mountModal, settleModal, confirmBox, warmSettleIcons, warmSettleLayout } from './ui/modals';
import { NoWebGLError, app, fxApp, applyResolution, initStage, layout, markFx, onLayout, setResolutionFn, takeFx, uiRoot, view } from './game/core/stage';
import { fpsCap, onFrame, perf, requestRender, setAwake, setContinuous, setFpsCap, setFxNeeds, startLoop } from './game/core/loop';
import { budget, currentTier, fpsTarget, lowerTier, onTierChange, renderRes, sampleFrame, setMaxTexture, wantAntialias, watchFrames } from './game/core/quality';
import { installFonts } from './game/core/fonts';
import { clock, onSpeed, setSpeed, stepSpeed } from './game/core/clock';
import { art, artMissing, audioDebug, music, prefetchMusic, setAudioBakeGate, sfx, startAudio } from './game/deps';
import { F, DISTRICT_BY, TREE, TREE_BY } from './game/data';
import { refreshEff, canBuyNode, addXp, baseCost, nodeCost, nodeCurrency, unlockedTargets } from './game/rules';
import { buyBase, canBuyBase } from './game/shop';
import { S, hasSave, loadGame, resetGame, saveGame, takeMigrateToast } from './game/state';
import { OfficeScene } from './game/office/scene';
import { LunchScene } from './game/lunch/scene';
import { todayMap } from './game/map/today';
import { TitleScene } from './game/title/scene';
import { bannerRects, bannerStat, clearTop, confetti, cutBusy, fireworks, idleWarmTop, initTop, setFlyBudget, setHudResolver, skipCut, topActive, updateTop, wipe, wiping } from './game/fx/top';
import type { RunStats } from './game/lunch/logic';

const state: NonNullable<Window['__sikdae']> = {
  ready: false,
  platform: getPlatform(),
  renderer: '',
  gpu: '',
  fps: 0,
  launches: 0,
  fullscreen: false,
  errors: [],
};
window.__sikdae = state;
window.addEventListener('error', (e) => state.errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => state.errors.push('unhandledrejection: ' + String(e.reason)));

function describeRenderer(): { renderer: string; gpu: string } {
  const r = app.renderer as WebGLRenderer;
  const gl = (r as unknown as { gl?: WebGLRenderingContext | WebGL2RenderingContext }).gl;
  if (!gl) return { renderer: String(app.renderer.name || app.renderer.type), gpu: '' };
  const isGl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  let gpu = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    gpu = '';
  }
  return { renderer: isGl2 ? 'WebGL2' : 'WebGL1', gpu };
}

async function waitForViewport(timeoutMs = 3000) {
  const t0 = performance.now();
  while ((window.innerWidth < 2 || window.innerHeight < 2) && performance.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 50));
}

type SceneName = 'title' | 'office' | 'lunch';
let scene: SceneName = 'title';
let office!: OfficeScene;
let lunch: LunchScene | null = null;
let lunchHud!: LunchHud;
let title: TitleScene | null = null;
let busy = false;

async function boot() {
  injectStyle();
  const [fontOk] = await Promise.all([loadFonts(), waitForViewport()]);
  const mark = (k: string) => ((perf as unknown as Record<string, number>)['boot_' + k] = Math.round(performance.now()));
  mark('fonts');
  /* 저장(화면 설정)을 먼저 읽어 화질 등급·해상도·안티앨리어싱을 정한 뒤 캔버스를 만든다(설계서 7장) */
  loadGame();
  setResolutionFn(renderRes);
  try {
    await initStage({ antialias: wantAntialias() });
  } catch (e) {
    if (e instanceof NoWebGLError) {
      showBootNote('이 기기에서는 그래픽 가속을 쓸 수 없어요');
      state.errors.push('webgl: ' + e.message);
      return;
    }
    throw e;
  }
  try {
    const gl = (app.renderer as unknown as { gl?: WebGLRenderingContext }).gl;
    if (gl) setMaxTexture(Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0);
  } catch {
    /* 무시 */
  }
  mark('stage');
  startLoop();
  setFxNeeds(() => {
    if (topActive()) markFx();
    return takeFx();
  });
  onLayout(() => requestRender(2));
  /* 사무실: HUD 숫자가 따라 올라가는 동안은 깨어 있음(그 밖에는 할 일이 없으면 루프가 잠듦) */
  setAwake(() => scene === 'title' || (scene === 'office' && displayBusy()));
  applyQuality(false);
  onTierChange((_t, auto) => applyQuality(auto));
  /*
   * 화질 자동(설계서 7-추가): 타이틀이 뜬 뒤 3초 프레임 작업 시간의 가운데 값이 프레임 간격의 75% 를 넘으면 한 단계 낮춤 · 영업 중에는 sampleFrame.
   * 그림을 굽는 동안·첫 몇 프레임(셰이더 준비·텍스처 첫 업로드)은 기기 속도와 상관없이 무거우므로 빼고 잰다(데스크톱이 30fps 로 떨어지던 것)
   */
  let bootT = 0;
  const bootW: number[] = [];
  let watchingLunch = false;
  onFrame((dt, w) => {
    if (bootT >= 0 && scene === 'title' && titleShown) {
      bootT += dt;
      if (bootT > 400) bootW.push(w);
      if (bootT >= 3400) {
        bootW.sort((a, b) => a - b);
        const med = bootW.length ? bootW[bootW.length >> 1] : 0;
        if (bootW.length >= 10 && med > (1000 / fpsCap()) * 0.75) lowerTier();
        bootT = -1;
      }
    }
    /* 영업 시작 1초 뒤 ~ 시간 끝까지만 본다(와이프·지도 굽기는 빼고) */
    const inLunch = scene === 'lunch' && !!lunch?.lunch && lunch.lunch.t > 1 && !lunch.lunch.ended;
    if (inLunch !== watchingLunch) {
      watchingLunch = inLunch;
      watchFrames(inLunch);
    }
    if (inLunch) sampleFrame(dt, w, fpsCap());
  });
  state.perf = perf as unknown as Record<string, number | string>;
  const info = describeRenderer();
  state.renderer = info.renderer;
  state.gpu = info.gpu;
  state.launches = storage.load<number>('launches', 0) + 1;
  storage.save('launches', state.launches);
  installFonts();
  installButtonFeel(uiRoot);
  document.body.classList.add('pe-root');
  /* 마지막 입력이 터치면 body.touching — 터치에서는 hover 이름표(단축키)를 숨긴다 */
  if (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches) document.body.classList.add('touching');
  window.addEventListener('pointerdown', (e) => document.body.classList.toggle('touching', e.pointerType === 'touch' || e.pointerType === 'pen'), true);

  refreshEff();
  snapDisplay();
  const hadSave = hasSave();

  /* 타이틀 먼저 */
  title = new TitleScene(uiRoot);
  title.setFsIcon(isFullscreen());
  title.dom.querySelector('[data-a="fs"]')?.addEventListener('click', () => doFullscreen());
  if (!isFullscreenSupported()) (title.dom.querySelector('.menu') as HTMLElement).style.display = 'none';
  await title.prepare();
  music('title');

  /* DOM 틀 */
  office = new OfficeScene(uiRoot, {
    goLunch: () => void goLunch(),
    toggleFullscreen: () => doFullscreen(),
    isFullscreen: () => isFullscreen(),
    applySettings: () => {
      saveGame();
      applyQuality(false);
    },
    resetAll: () => {
      resetGame();
      saveGame();
      location.reload();
    },
  });
  lunchHud = new LunchHud(uiRoot);
  lunchHud.endBtn.addEventListener('click', () => lunch?.finish());
  lunchHud.fsBtn.addEventListener('click', () => void doFullscreen());
  if (!isFullscreenSupported()) lunchHud.fsBtn.style.display = 'none';
  mountModal(uiRoot);
  mountToasts(uiRoot);
  const spd = document.createElement('div');
  spd.className = 'spd';
  uiRoot.appendChild(spd);
  onSpeed((s) => {
    spd.style.display = s === 1 ? 'none' : 'flex';
    spd.textContent = `×${s} 배속  ( [ ] 키 )`;
    lunchHud.setSpeed(s);
    sfx('speed_change');
  });
  if (!isFullscreenSupported()) (office.hud.menu.querySelector('[data-a="fs"]') as HTMLElement).style.display = 'none';
  initTop();
  setHudResolver(anchorOf, (id) => bumpAnchor(id));

  /*
   * 그림 래스터화(로딩 막대, 설계서 7-추가): 타이틀·사무실에 쓰는 그림(배경·로고·트리 칸·아이콘·캐릭터·사무실 연출)만 먼저 굽고 타이틀을 띄운다.
   * 영업 그림(대상·장식·아이템·차·영업 연출)과 오늘 지도는 그 뒤 한 프레임에 6장씩 나눠 굽는다(첫 영업 전 여유 시간). 영업 나가기는 끝날 때까지 기다림
   */
  const res = Math.max(1, Math.min(budget().artRes, Math.ceil(view.k * view.dpr * 2) / 2));
  await art.loadAll(app.renderer, (d, t) => title?.progress(d, t), { resolution: res, only: firstArt });
  mark('art');
  restArt = (async () => {
    try {
      await art.loadAll(app.renderer, undefined, { resolution: res, only: (k, g) => !firstArt(k, g), perFrame: 6 });
      await art.loadMap(app.renderer, S.district, view.orient, todayMap(view.orient).seed, todayMap(view.orient).day).catch(() => null);
    } finally {
      (perf as unknown as Record<string, number>).artRest = 1;
      mark('rest');
      preUploadFx();
      warmTopIdle();
    }
  })();
  mark('map');
  title.showLogo();
  title.ready(hadSave);
  titleShown = true;
  title.onStart = (mode) => {
    if (busy) return;
    if (mode === 'new') {
      confirmBox('새로 시작할까요?', '지금까지의 진행이 전부 사라져요.', '새로 시작', () => {
        confirmBox('정말 지울까요?', '되돌릴 수 없어요.', '전부 지우고 시작', () => {
          resetGame();
          saveGame();
          refreshEff();
          snapDisplay();
          void enterOffice(true);
        }, true);
      }, true);
      return;
    }
    sfx('title_start');
    void enterOffice(mode === 'start' && !hadSave);
  };

  /* 소리 굽기(효과음 변형·곡)는 영업 화면 밖에서만(설계서 7장 7) — 영업 중에는 구운 것·가까운 것으로 틀고 굽기 줄은 영업 뒤에 */
  setAudioBakeGate(() => scene !== 'lunch');

  /* 입력: 첫 입력에 소리 */
  const firstInput = () => {
    void startAudio();
  };
  window.addEventListener('pointerdown', firstInput, { capture: true });
  window.addEventListener('keydown', firstInput, { capture: true });
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', (e) => {
    if (skipCut()) e.stopPropagation();
  });
  onFullscreenChange((on) => {
    state.fullscreen = on;
    office.hud.setFullscreen(on);
    lunchHud.fsBtn.innerHTML = img(on ? 'ic.fullscreenExit' : 'ic.fullscreen');
    title?.setFsIcon(on);
    setTimeout(() => layout(true), 60);
  });
  state.fullscreen = isFullscreen();

  /* 저장 */
  setInterval(() => {
    if (scene !== 'title') saveGame();
  }, F.SAVE_EVERY * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && scene !== 'title') saveGame();
  });
  window.addEventListener('pagehide', () => scene !== 'title' && saveGame());
  window.addEventListener('beforeunload', () => scene !== 'title' && saveGame());

  /* 루프: loop.ts 가 프레임 상한에 맞춰 app.ticker.update → 렌더를 부른다. 사무실은 바뀔 때만 그림 */
  app.ticker.add((t) => {
    const rt = Math.min(0.1, t.deltaMS / 1000);
    if (scene === 'title') title?.update(rt);
    /* 사무실은 잠든 동안 0.25초마다 갱신 — 플레이 시간은 실제 흐른 시간으로(상한 0.5초) */
    else if (scene === 'office') office.update(rt, Math.min(0.5, t.elapsedMS / 1000));
    else if (scene === 'lunch' && lunch) lunch.update(rt);
    tickDisplay(rt);
    updateTop(rt);
  });
  setInterval(() => {
    state.fps = Math.round(app.ticker.FPS);
    /* 메모리 검사용: GPU 텍스처 수(stage + fxTop) */
    try {
      /* managedTextures 는 지운 자리가 null 로 남으므로 살아 있는 것만 셈 */
      const n = (r: unknown) => ((r as { texture?: { managedTextures?: readonly unknown[] } }).texture?.managedTextures || []).reduce<number>((k, t) => (t ? k + 1 : k), 0);
      perf.textures = n(app.renderer) + n(fxApp.renderer);
    } catch {
      /* 무시 */
    }
  }, 1000);

  installDebug();
  state.ready = true;
  console.info(
    `SIKDAE_READY platform=${state.platform} renderer=${state.renderer} gpu="${state.gpu}" ` +
      `size=${view.w}x${view.h} dpr=${view.dpr} font=${fontOk ? 'Jua' : 'fallback'} launches=${state.launches}`,
  );
}

/** 타이틀·사무실에 쓰는 그림(먼저 굽는 것) */
const FIRST_GROUPS = new Set(['bg', 'ui', 'node', 'icon', 'character']);
const FIRST_FX = new Set(['fx.banner', 'fx.firework', 'fx.glow', 'fx.rays', 'fx.ring', 'fx.spark', 'fx.star', 'fx.dot', 'fx.coin', 'fx.ticket', 'fx.point', 'fx.confetti0', 'fx.confetti1', 'fx.confetti2', 'fx.confetti3', 'fx.confetti4', 'fx.confetti5']);
function firstArt(key: string, group: string): boolean {
  return FIRST_GROUPS.has(group) || FIRST_FX.has(key);
}
/** 타이틀 버튼이 뜬 뒤(화질 자동 첫 판정은 이때부터) */
let titleShown = false;
/** 뒤에서 굽는 영업 그림(끝나면 풀림) */
let restArt: Promise<void> = Promise.resolve();

/**
 * fxTop 캔버스(따로 된 WebGL 컨텍스트)가 쓰는 그림 묶음을 미리 GPU 에 올림(설계서 7장). 안 하면 첫 코인·배너·아이템 컷 프레임에
 * 2048² 아틀라스를 올리느라 수십 ms 멈춤(첫 영업일 긴 작업). 한 묶음씩 쉬어 가며(한 작업에 하나)
 */
function preUploadFx(): void {
  const top = /^fx\.(coin|ticket|point|star|spark|glow|rays|ring|banner|firework|confetti\d|arrow)$/;
  const keys = art.SPRITE_KEYS.filter((k) => top.test(k) || k.startsWith('i.') || k.startsWith('c.'));
  keys.push('ic.tech');
  const srcs: unknown[] = [];
  for (const k of keys) {
    try {
      const src = art.tex(k).source;
      if (src && !srcs.includes(src)) srcs.push(src);
    } catch {
      /* 무시 */
    }
  }
  const ts = (fxApp.renderer as unknown as { texture?: { initSource?: (s: unknown) => void } }).texture;
  let i = 0;
  const step = (): void => {
    if (i >= srcs.length || !ts?.initSource) return;
    try {
      ts.initSource(srcs[i++]);
    } catch {
      /* 무시 */
    }
    setTimeout(step, 80);
  };
  setTimeout(step, 300);
}

/** 보스가 나올 수 있으면 보스 곡을 사무실에서 미리 구움(영업 중 굽기·실시간 합성 없게, 설계서 7장 7) */
function prefetchBoss(): void {
  if (unlockedTargets().some((t) => t.beh === 'boss')) prefetchMusic('boss');
  warmTopIdle();
}
/** 영업 중에 처음 뜰 fxTop 글자(배너·아이템 컷)를 사무실 여유 시간에 미리 그림(설계서 7장 — 영업 중 긴 작업 없게) */
function warmTopIdle(): void {
  warmSettleIcons();
  setTimeout(() => {
    if (scene !== 'lunch') warmSettleLayout();
  }, 2500);
  idleWarmTop(
    unlockedTargets().filter((t) => t.grade >= 3).map((t) => `${t.name} · ${t.sizeLabel}`),
    () => scene === 'lunch',
  );
}

/** 부팅 안내 한 줄(WebGL 없음 등) — 흰 화면 대신 */
function showBootNote(msg: string): void {
  const box = document.createElement('div');
  box.id = 'boot-error';
  box.textContent = msg;
  document.body.appendChild(box);
}

/** 화질 등급을 지금 화면에 반영(해상도·프레임 상한·연출 예산). auto = 자동으로 낮춘 경우(토스트 한 번) */
let qualityToast = false;
/** 영업 중에 자동으로 낮춘 화질의 해상도는 그 영업이 끝난 뒤(와이프 안)에 맞춤 */
let resPending = false;
function flushResolution(): void {
  if (!resPending) return;
  resPending = false;
  applyResolution();
  perf.res = view.res;
}
function applyQuality(auto: boolean): void {
  const b = budget();
  setFpsCap(fpsTarget());
  setFlyBudget(b.coins);
  /*
   * 영업 중 자동으로 낮춘 경우(설계서 7장): 연출 예산·프레임 상한은 바로, 해상도(캔버스 두 장 다시 잡기·HUD 다시 재기)는 영업이 끝난 뒤 와이프 안에서.
   * 영업 도중에 한 프레임에 몰아서 하면 폰 4배 느림에서 수백 ms 짜리 긴 작업 하나였음
   */
  if (auto && scene === 'lunch') resPending = true;
  else {
    resPending = false;
    applyResolution();
  }
  perf.tier = currentTier();
  document.body.classList.toggle('fx-lite', currentTier() !== 'high');
  perf.quality = S.settings.quality;
  perf.res = view.res;
  lunch?.view?.applyBudget(b);
  office?.applyQuality(b);
  requestRender(2);
  if (auto) {
    /* 저장(직렬화·localStorage)은 따로 한 작업으로 */
    setTimeout(() => saveGame(), 0);
    if (!qualityToast) {
      qualityToast = true;
      toast('화질을 낮췄어요', 'ic.settings');
    }
  }
}

async function doFullscreen(): Promise<void> {
  sfx('ui_fullscreen');
  await toggleFullscreen();
}

async function enterOffice(firstTime: boolean): Promise<void> {
  if (busy) return;
  busy = true;
  await wipe(() => {
    title?.destroy();
    title = null;
    scene = 'office';
    office.enter();
    setContinuous(false);
    requestRender(3);
    prefetchBoss();
    const mt = takeMigrateToast();
    if (mt) setTimeout(() => toast(mt, 'ic.reset'), 500);
    if (firstTime || S.runs === 0) setTimeout(() => toast('[영업 나가기]로 시작해요', 'ic.go'), 700);
  });
  busy = false;
}

async function goLunch(): Promise<void> {
  if (busy || scene === 'lunch') return;
  busy = true;
  hideModal();
  lunch = new LunchScene(lunchHud);
  lunch.onEnd = (st, ending) => onLunchEnd(st, ending);
  await wipe(async () => {
    /* 뒤에서 굽던 영업 그림이 아직이면 와이프가 덮은 채로 기다림 */
    await restArt;
    clearTop();
    clearToasts();
    office.exit();
    lunchHud.root.classList.add('on');
    scene = 'lunch';
    setContinuous(true);
    await lunch!.start();
  });
  lunch?.go();
  busy = false;
}

function onLunchEnd(st: RunStats, ending: boolean): void {
  const again = async () => {
    if (busy) return;
    busy = true;
    await wipe(async () => {
      lunch?.destroy();
      flushResolution();
      clearTop();
      lunch = new LunchScene(lunchHud);
      lunch.onEnd = (s2, e2) => onLunchEnd(s2, e2);
      await lunch.start();
    });
    lunch?.go();
    busy = false;
  };
  const toOffice = async () => {
    if (busy) return;
    busy = true;
    await wipe(() => {
      lunch?.destroy();
      flushResolution();
      lunch = null;
      clearTop();
      lunchHud.root.classList.remove('on');
      app.renderer.background.color = '#2b3f8a';
      scene = 'office';
      office.enter();
      setContinuous(false);
      requestRender(3);
      prefetchBoss();
    });
    busy = false;
  };
  if (ending) {
    music('ending');
    sfx('ending');
    /* 엔딩: 폭죽 반복 */
    fireworks(4);
    confetti(40, true);
    const fw = window.setInterval(() => {
      fireworks(3);
      confetti(24, true);
    }, 1600);
    /* 엔딩을 닫으면 그날 정산(식대 거래액·매출)을 보여 주고, 거기서 다음 영업일 / 사무실로 */
    endingModal(() => {
      clearInterval(fw);
      settleModal({ stats: st, runNo: S.runs, districtName: DISTRICT_BY[S.district].name, onAgain: () => void again(), onOffice: () => void toOffice() });
    });
    return;
  }
  settleModal({ stats: st, runNo: S.runs, districtName: DISTRICT_BY[S.district].name, onAgain: () => void again(), onOffice: () => void toOffice() });
}

function onKey(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement)?.tagName || '';
  if (/INPUT|TEXTAREA/.test(tag)) return;
  if (e.code === 'BracketRight') {
    stepSpeed(1);
    return;
  }
  if (e.code === 'BracketLeft') {
    stepSpeed(-1);
    return;
  }
  if (e.key === 'f' || e.key === 'F' || e.key === 'ㄹ') {
    if (isFullscreenSupported()) void doFullscreen();
    return;
  }
  if (e.key === 'F11' && isFullscreenSupported()) {
    e.preventDefault();
    void doFullscreen();
    return;
  }
  const enter = e.key === 'Enter' || e.code === 'Space';
  if (modalOpen()) {
    if (e.key === 'Escape') modalKey('esc');
    else if (enter) {
      e.preventDefault();
      modalKey('enter');
    }
    return;
  }
  if (wiping()) return;
  if (scene === 'title' && enter) {
    const b = title?.dom.querySelector<HTMLElement>('.tbtns.show [data-a="start"], .tbtns.show [data-a="continue"]');
    if (b) {
      e.preventDefault();
      b.click();
    }
    return;
  }
  if (scene === 'office') {
    if (enter) {
      e.preventDefault();
      void goLunch();
      return;
    }
    office.key(e.key);
    return;
  }
  if (scene === 'lunch' && e.key === 'Escape') lunch?.finish();
}

/* ── 검수용 훅 (UI 노출 없음) ── */
function installDebug(): void {
  const game = {
    speed: (n: number) => setSpeed(n),
    /** 검수용: 매출 amount · 기술력 tech · 경험치 xp 주기 */
    give: (amount: number, tech = 0, xp = 0) => {
      S.revenue += amount;
      S.tech += tech;
      if (xp) addXp(xp);
      office.refresh();
      return S.revenue;
    },
    get state() {
      return S;
    },
    get scene() {
      return scene;
    },
    get lunch() {
      return lunch?.lunch;
    },
    startRun: () => {
      if (scene === 'title') void enterOffice(false).then(() => goLunch());
      else void goLunch();
    },
    endRun: () => lunch?.finish(),
    office: () => office,
    openTab: (t: string) => office.openTab(t),
    district: (id: string) => {
      if (DISTRICT_BY[id]) S.district = id as typeof S.district;
      office.hud.renderDistrict();
    },
    buyNode: (id: string) => {
      const n = TREE_BY[id];
      return n ? office.buyNode(n) : false;
    },
    canBuy: (id: string) => (TREE_BY[id] ? canBuyNode(TREE_BY[id]) : false),
    /** 칸 다음 레벨 비용 · 재화('rev' | 'tech') */
    nodeCost: (id: string) => (TREE_BY[id] ? { cost: nodeCost(TREE_BY[id]), cur: nodeCurrency(TREE_BY[id]) } : null),
    /** 기본 역량(설득력 power · 반경 radius) */
    baseCost: (k: 'power' | 'radius') => baseCost(k),
    canBuyBase: (k: 'power' | 'radius') => canBuyBase(k),
    buyBase: (k: 'power' | 'radius') => {
      const ok = buyBase(k);
      if (ok) office.refresh();
      return ok;
    },
    districtModal: () => districtModal((id) => (S.district = id)),
    clock,
    /** 지도(논리) 좌표 → 화면 CSS px */
    toScreen: (x: number, y: number) => ({ x: view.ox + x * view.k, y: view.oy + y * view.k }),
    nodeScreen: (id: string) => office.tree?.nodeScreen(id) ?? null,
    treeIds: () => TREE.map((n) => n.id),
    nodeD: (id: string) => TREE_BY[id]?.d ?? 99,
    artMissing,
    audio: () => audioDebug(),
    cutBusy: () => cutBusy(),
    bannerStat: () => bannerStat(),
    bannerRects: () => bannerRects(),
    lunchView: () => lunch?.view,
    /** 메모리 검수용: GPU 텍스처 목록(렌더러 · 이름 · 크기) */
    texInfo: () => {
      const out: string[] = [];
      for (const [tag, r] of [['s', app.renderer], ['f', fxApp.renderer]] as const) {
        const list = (r as unknown as { texture?: { managedTextures?: readonly ({ label?: string; pixelWidth: number; pixelHeight: number; resource?: unknown } | null)[] } }).texture?.managedTextures || [];
        for (const t of list) if (t) out.push(`${tag}:${t.label || (t.resource && (t.resource as { constructor?: { name?: string } }).constructor?.name) || '?'}:${t.pixelWidth}x${t.pixelHeight}`);
      }
      return out;
    },
    /** 성능 검수용: 영업 장면 · 영업 HUD 객체 */
    lunchScene: () => lunch,
    lunchHud: () => lunchHud,
    save: () => saveGame(),
    net: (x: number, y: number) => {
      if (lunch?.lunch) {
        lunch.lunch.net.x = x;
        lunch.lunch.net.y = y;
      }
    },
  };
  (window as unknown as { __game: typeof game }).__game = game;
  (state as unknown as { debug: unknown }).debug = {
    speed: game.speed,
    cheat: (rev: number, tech = 0, xp = 0) => game.give(rev, tech, xp),
    buyNode: game.buyNode,
    sim: (sec: number) => {
      const L0 = lunch?.lunch;
      if (!L0) return false;
      const step = 1 / 60;
      for (let t = 0; t < sec; t += step) if (!L0.update(step)) break;
      return true;
    },
  };
}

boot().catch((err) => {
  console.error('[boot] 시작 실패', err);
  state.errors.push('boot: ' + String(err && (err as Error).message ? (err as Error).message : err));
  const box = document.createElement('div');
  box.id = 'boot-error';
  box.textContent = '게임을 시작하지 못했습니다.\n' + String(err && (err as Error).message ? (err as Error).message : err);
  document.body.appendChild(box);
});

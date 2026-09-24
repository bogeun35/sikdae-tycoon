/**
 * 전체화면 (Fullscreen API). 사용자 입력(클릭·탭·키) 안에서 불러야 동작한다.
 * 아이폰 Safari 는 요소 전체화면을 지원하지 않는다 → isFullscreenSupported() 가 false.
 */
export function isFullscreenSupported(): boolean {
  return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export async function toggleFullscreen(el: HTMLElement = document.documentElement): Promise<boolean> {
  try {
    if (isFullscreen()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else await document.webkitExitFullscreen?.();
    } else if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
    } else {
      await el.webkitRequestFullscreen?.();
    }
  } catch (e) {
    console.warn('[fullscreen] 전환 실패', e);
  }
  return isFullscreen();
}

/** 전체화면 상태가 바뀔 때마다 호출 */
export function onFullscreenChange(cb: (on: boolean) => void): void {
  const h = () => cb(isFullscreen());
  document.addEventListener('fullscreenchange', h);
  document.addEventListener('webkitfullscreenchange', h);
}

/** 어디서 열렸는지 (HUD·검수 로그용) */
export type PlatformName = 'desktop' | 'mobile';

export function getPlatform(): PlatformName {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const touch = navigator.maxTouchPoints > 0;
  return coarse && touch ? 'mobile' : 'desktop';
}

/** file:// 로 열었는지 (더블클릭 실행) */
export const isFileProtocol = () => location.protocol === 'file:';

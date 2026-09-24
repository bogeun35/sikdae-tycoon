/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    /** 자동 검수 스크립트(scripts/shot-web.js)가 읽는 상태. 게임을 채울 때도 남겨 둘 것. */
    __sikdae?: {
      ready: boolean;
      platform: string;
      renderer: string;
      gpu: string;
      fps: number;
      launches: number;
      fullscreen: boolean;
      errors: string[];
    };
  }
  interface Document {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
    webkitFullscreenEnabled?: boolean;
  }
  interface HTMLElement {
    webkitRequestFullscreen?: () => Promise<void> | void;
  }
}

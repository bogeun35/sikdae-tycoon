/**
 * 게임 폰트 (Jua, OFL-1.1) — ?inline 으로 base64 data URI 가 되어 HTML 안에 들어간다. 오프라인·file:// 에서도 보인다.
 *
 * Google Fonts 식 unicode-range 조각(100여 개)이 아니라 한글 통파일 1개 + 라틴 1개를 쓴다.
 * 조각 방식이면 처음 쓰는 글자마다 조각을 나중에 읽어서, 그 사이 만든 Pixi Text 가 대체 글꼴로
 * 그려진 채 남을 수 있다. 통파일은 한 번 로드하면 모든 한글이 바로 나온다.
 *
 * Pixi Text 를 만들기 전에 반드시 await loadFonts() 할 것.
 */
import juaKorean from '@fontsource/jua/files/jua-korean-400-normal.woff2?inline';
import juaLatin from '@fontsource/jua/files/jua-latin-400-normal.woff2?inline';

export const GAME_FONT = 'Jua';
/** 폰트가 늦거나 실패했을 때 대신 쓸 글꼴 */
export const FONT_STACK = [GAME_FONT, 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', 'sans-serif'];

const LATIN_RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

export async function loadFonts(timeoutMs = 6000): Promise<boolean> {
  const faces = [
    new FontFace(GAME_FONT, `url(${juaKorean}) format('woff2')`, { weight: '400', style: 'normal', display: 'block' }),
    new FontFace(GAME_FONT, `url(${juaLatin}) format('woff2')`, {
      weight: '400',
      style: 'normal',
      display: 'block',
      unicodeRange: LATIN_RANGE,
    }),
  ];
  faces.forEach((f) => document.fonts.add(f));
  const timer = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), timeoutMs));
  const loading = Promise.all(faces.map((f) => f.load()))
    .then(() => 'ok' as const)
    .catch((e) => {
      console.error('[fonts] Jua 로드 실패', e);
      return 'error' as const;
    });
  const result = await Promise.race([loading, timer]);
  if (result === 'error') return false;
  if (result === 'timeout') {
    console.warn('[fonts] Jua 로드 시간 초과, 대체 글꼴로 진행');
    return false;
  }
  return true;
}

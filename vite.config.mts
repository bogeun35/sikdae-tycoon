import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * 빌드 결과 = dist/index.html 한 파일.
 *   JS·CSS·폰트(Jua, base64)·그림을 전부 인라인한다. 더블클릭(file://)으로 열어도 외부 요청 없이 동작.
 *   public/ 폴더는 쓰지 않는다 (쓰면 dist 에 별도 파일이 생긴다). 그림·폰트는 src/assets 에 두고 import 할 것.
 */

/* 파비콘(data URI)과 폰트 라이선스(OFL, HTML 주석)를 HTML 에 직접 넣는다.
   vite 는 <link rel=icon> 을 인라인하지 않고 파일로 빼기 때문에 여기서 넣는다. */
function inlineHeadExtras(): Plugin {
  const icon = readFileSync(fileURLToPath(new URL('./src/assets/favicon.png', import.meta.url))).toString('base64');
  const text = readFileSync(fileURLToPath(new URL('./src/assets/Jua-OFL.txt', import.meta.url)), 'utf8')
    .replace(/--/g, '- -');
  return {
    name: 'sikdae-inline-head',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace(
          '</head>',
          `<link rel="icon" type="image/png" href="data:image/png;base64,${icon}" />\n` +
            `<!--\nJua font (embedded)\n${text}\n-->\n</head>`,
        ),
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  server: { port: 5173, strictPort: false },
  plugins: [viteSingleFile({ removeViteModuleLoader: true }), inlineHeadExtras()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 5000,
  },
});

/**
 * 소리 검수 페이지를 한 파일로 빌드 → test-shots/audio/audio-test.html (file:// 로 열림, 외부 요청 0)
 *   node src/audio/dev/build-test.mjs
 * 게임 빌드(dist/)와 따로 돈다. tsc 검사는 하지 않으니 먼저 npx tsc --noEmit 으로 확인할 것.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

await build({
  root,
  configFile: false,
  base: './',
  publicDir: false,
  logLevel: 'warn',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: path.join(root, 'test-shots/audio'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 5000,
    rollupOptions: { input: path.join(root, 'audio-test.html') },
  },
});
console.log('[audio] test-shots/audio/audio-test.html');

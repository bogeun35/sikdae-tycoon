/**
 * 실제 게임으로 새 저장 N영업일 연속 플레이: 봇 궤적으로 영업 → 정산 숫자·스크린샷 → 사무실에서 싼 것부터 구매 → 다음 영업일.
 *
 *   node scripts/balance/play-real.cjs --file <html> [--bot normal] [--runs 10] [--repeat 1] [--fast 4] [--label fix] [--shots <폴더>]
 *   --fast N: N영업일째부터 8배속(판단·이동은 영업 로직 시간 기준이라 결과는 1배속과 같고 벽시계 시간만 줄어듦)
 *   --repeat K: 새 저장으로 K번(경력마다 새 페이지). 표준출력 JSON 에 영업일별 평균
 *   환경변수 PUPPETEER_CORE = puppeteer-core 경로(없으면 require('puppeteer-core')), CDP = 헤드리스 크롬 주소(기본 http://localhost:9224)
 *
 * 구매(시뮬 sim.ts '싼 칸 우선'과 같음): 살 수 있는 것(트리 칸 + 해금된 기본 역량) 중 "비용 ÷ 그 재화 직전 영업일 수입"이 가장 작은 것부터.
 * 결과: 표준출력 JSON 한 줄 + scripts/balance/out/play-<label>-<bot>.json, 정산 모달 스크린샷 <shots>/bal-<label>-<bot>-KK-NN.png
 *
 * 규칙(BUILD.md): 9224(팀원 전용 헤드리스)만. newPage 로 만든 페이지에만 setViewport, dialog dismiss, bringToFront 금지,
 *   끝나면 page.close() + disconnect(브라우저는 닫지 않음). 9223 은 사용자 크롬이라 접속 금지. 페이지는 한 번에 하나.
 *   빌드·헤드리스는 .work.lock 을 잡은 채로(이 스크립트는 락을 잡지 않음 — 부르는 쪽에서).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const puppeteer = require(process.env.PUPPETEER_CORE || 'puppeteer-core');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
const flag = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const BOT = flag('--bot', 'normal');
const RUNS = Number(flag('--runs', 10));
const REPEAT = Number(flag('--repeat', 1));
const FAST = Number(flag('--fast', 4));
const LABEL = flag('--label', 'fix');
const FILE = flag('--file', path.join(ROOT, 'dist', 'index.html'));
const SHOTS = flag('--shots', path.join(ROOT, 'test-shots'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 페이지 안 봇(verify-real.cjs 와 같음): rAF 마다 영업 로직 시간만큼 반경을 옮기고 pointermove 를 쏜다 */
function startBotInPage() {
  const B = window.__bot;
  const mem = {};
  let cur = null;
  let lastT = 0;
  let think = 0;
  let goal = null;
  /* 반경 밀도 표본(설계서 0-3): 영업 로직 0.1초마다 반경 안 대상 수 */
  const rad = (window.__rad = window.__rad || {});
  let lastS = -1;
  const loop = () => {
    const g = window.__game;
    const L = g.lunch;
    if (L && !L.ended && L.t > 0 && g.scene === 'lunch') {
      const speed = B.spec.speed * (L.U / 1.42);
      if (!cur) {
        cur = { x: L.net.x, y: L.net.y };
        lastT = L.t;
        mem.speed = speed;
        mem.dt = B.spec.think;
        goal = { x: cur.x, y: cur.y };
      }
      const dt = Math.max(0, L.t - lastT);
      lastT = L.t;
      think -= dt;
      if (think <= 0) {
        think = B.spec.think;
        goal = B.decide(L, mem, Math.random);
      }
      B.move({ area: L.area, map: L.map, net: cur }, goal, speed, dt);
      const p = g.lunchView().camera.cam.toGlobal({ x: cur.x, y: cur.y });
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: p.x, clientY: p.y, pointerType: 'mouse', bubbles: true }));
      const k = Math.floor(L.t * 10);
      if (k !== lastS) {
        lastS = k;
        let n = 0;
        for (const e of L.ents) if (e.inR) n++;
        rad[n] = (rad[n] || 0) + 1;
      }
    }
    if (!(L && L.ended)) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/** 사무실 구매(페이지 안): 트리 칸 + 기본 역량, 비용 ÷ 그 재화 직전 영업일 수입이 작은 것부터 */
function shopInPage(inc) {
  const g = window.__game;
  const got = [];
  for (let guard = 0; guard < 80; guard++) {
    let best = null;
    let bv = Infinity;
    for (const id of g.treeIds()) {
      if (!g.canBuy(id)) continue;
      const c = g.nodeCost(id);
      const v = c.cost / Math.max(1, inc[c.cur]);
      if (v < bv) {
        bv = v;
        best = { kind: 'tree', id, cost: c.cost, cur: c.cur };
      }
    }
    for (const k of ['power', 'radius']) {
      if (!g.canBuyBase(k)) continue;
      const c = g.baseCost(k);
      const v = c / Math.max(1, inc.rev);
      if (v < bv) {
        bv = v;
        best = { kind: 'base', id: k, cost: c, cur: 'rev' };
      }
    }
    if (!best) break;
    const lv0 = best.kind === 'tree' ? g.state.tree[best.id] || 0 : g.state.base[best.id];
    const ok = best.kind === 'tree' ? g.buyNode(best.id) : g.buyBase(best.id);
    if (!ok) break;
    got.push({ ...best, lv: lv0 + 1 });
  }
  return got;
}

async function career(browser, k, botSrc, out) {
  const page = await browser.newPage();
  page.on('dialog', (d) => {
    out.errors.push('dialog: ' + d.message());
    d.dismiss().catch(() => {});
  });
  page.on('console', (m) => {
    if (m.type() === 'error') out.errors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => out.errors.push('pageerror: ' + String(e.message || e).slice(0, 300)));
  const tapSel = async (sel) => {
    const r = await page.evaluate((s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width };
    }, sel);
    if (!r || !r.w) throw new Error('없음: ' + sel);
    await page.mouse.click(r.x, r.y);
  };
  const runs = [];
  try {
    await page.evaluateOnNewDocument(() => {
      try {
        for (const key of Object.keys(localStorage)) if (key.startsWith('sikdae-tycoon:') && !/launches|vol/.test(key)) localStorage.removeItem(key);
      } catch (e) {}
    });
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(FILE).href, { waitUntil: 'load', timeout: 240000 });
    await page.waitForFunction('window.__sikdae && window.__sikdae.ready', { timeout: 240000 });
    await sleep(900);
    const fresh = await page.evaluate(() => window.__game.state.runs === 0 && window.__game.state.gmv === 0 && window.__game.state.tech === 0);
    if (!fresh) throw new Error('새 저장이 아님');
    await tapSel('.tbtns [data-a="start"], .tbtns [data-a="continue"]');
    await page.waitForFunction('window.__game && window.__game.scene === "office"', { timeout: 30000 });
    await sleep(1200);
    await page.evaluate(botSrc);
    for (let i = 1; i <= RUNS; i++) {
      const t0 = Date.now();
      await page.evaluate((s) => window.__game.speed(s), i >= FAST ? 8 : 1);
      await page.evaluate(startBotInPage);
      for (let j = 0; j < 6; j++) {
        /* 사무실에 떠 있는 안내 모달(상권 해금 등)이 있으면 닫고 출발 */
        await page.evaluate(() => document.querySelector('.modal.show [data-a="close"], .modal.show [data-a="ok"]')?.click());
        await tapSel('#office .go').catch(() => {});
        const ok = await page.waitForFunction('window.__game.scene === "lunch"', { timeout: 8000 }).then(() => true, () => false);
        if (ok) break;
      }
      await page.waitForFunction('document.querySelector(".modal.show .box.settle, .modal.show .box.ending")', { timeout: 480000 });
      await page.evaluate(() => window.__game.speed(1));
      await sleep(2800);
      const r = await page.evaluate(() => {
        const L = window.__game.lunch;
        const st = L.stats;
        const S = window.__game.state;
        const shown = [...document.querySelectorAll('.modal.show [data-count]')].map((e) => e.textContent.trim());
        const title = document.querySelector('.modal.show h2')?.textContent.trim() || '';
        return {
          gmv: st.gmv, comm: st.comm, fee: st.fee, bonus: st.bonus, rev: st.rev, tech: st.tech, count: st.count, corps: st.corps, stores: st.stores, bestM: st.bestM,
          lv: S.lv, revenueHeld: S.revenue, techHeld: S.tech, shown, title, district: S.district, R: L.R,
        };
      });
      r.run = i;
      r.wallSec = (Date.now() - t0) / 1000;
      fs.mkdirSync(SHOTS, { recursive: true });
      const shot = path.join(SHOTS, `bal-${LABEL}-${BOT}-${String(k).padStart(2, '0')}-${String(i).padStart(2, '0')}.png`);
      await page.screenshot({ path: shot });
      r.shot = shot;
      await tapSel('.modal.show [data-a="office"]');
      await page.waitForFunction('window.__game.scene === "office"', { timeout: 20000 });
      await sleep(700);
      r.bought = await page.evaluate(shopInPage, { rev: r.rev, tech: r.tech });
      r.heldAfter = await page.evaluate(() => ({ rev: window.__game.state.revenue, tech: window.__game.state.tech }));
      r.rad = await page.evaluate(() => ({ ...(window.__rad || {}) }));
      await page.evaluate(() => (window.__rad = {}));
      runs.push(r);
      process.stderr.write(`#${k} ${i}영업일: 매출 ${r.rev} (수수료 ${r.comm} 이용료 ${r.fee} 선물·문의 ${r.bonus}) 기술력 ${r.tech} 거래액 ${r.gmv} 계약 ${r.count} R ${r.R.toFixed(1)} | 구매 ${r.bought.length} ${r.bought.map((b) => b.id + b.lv + ':' + b.cost + (b.cur === 'tech' ? 'T' : '')).join(' ')} (${r.wallSec.toFixed(0)}초)\n`);
      await sleep(600);
    }
  } catch (e) {
    out.fatal.push(String(e && e.stack ? e.stack : e).slice(0, 800));
  } finally {
    await page.close().catch(() => {});
  }
  return runs;
}

(async () => {
  const bots = await import(pathToFileURL(path.join(HERE, 'bots.mjs')).href);
  const botSrc = `window.__bot = { spec: ${JSON.stringify(bots.BOT_SPEC[BOT])}, decide: (${bots.DECIDE[BOT].toString()}), move: (${bots.moveNet.toString()}) };`;
  const out = { bot: BOT, file: path.basename(FILE), careers: [], errors: [], fatal: [] };
  const browser = await puppeteer.connect({ browserURL: process.env.CDP || 'http://localhost:9224', defaultViewport: null, protocolTimeout: 600000 });
  try {
    for (let k = 1; k <= REPEAT; k++) out.careers.push(await career(browser, k, botSrc, out));
  } finally {
    browser.disconnect();
  }
  const perDay = [];
  for (let i = 0; i < RUNS; i++) {
    const rs = out.careers.map((c) => c[i]).filter(Boolean);
    if (!rs.length) continue;
    const a = (f) => rs.reduce((x, r) => x + f(r), 0) / rs.length;
    perDay.push({ day: i + 1, n: rs.length, rev: a((r) => r.rev), tech: a((r) => r.tech), gmv: a((r) => r.gmv), count: a((r) => r.count), bought: a((r) => r.bought.length), R: a((r) => r.R) });
  }
  out.perDay = perDay;
  /* 반경 안 대상 수(0.1초 표본, 반경에 1곳 이상인 표본 중) */
  const H = {};
  for (const c of out.careers) for (const r of c) for (const k in r.rad || {}) H[k] = (H[k] || 0) + r.rad[k];
  const pos = Object.entries(H).filter(([k]) => Number(k) > 0).reduce((a, [, v]) => a + v, 0);
  out.radius = { hist: H, le2: ((H[1] || 0) + (H[2] || 0)) / Math.max(1, pos), one: (H[1] || 0) / Math.max(1, pos), max: Math.max(0, ...Object.keys(H).map(Number)) };
  fs.mkdirSync(path.join(HERE, 'out'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'out', `play-${LABEL}-${BOT}.json`), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ bot: BOT, careers: out.careers.length, perDay, radius: out.radius, errors: out.errors.slice(0, 5), fatal: out.fatal.slice(0, 2) }));
})();

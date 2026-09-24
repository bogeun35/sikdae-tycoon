/**
 * 영업 한 판의 로직(고정 스텝). 그림과 분리 — 사건은 LunchEvents 로 알린다.
 * 규칙·수치는 설계서 3장·밸런스 시뮬(sim.js)과 같다.
 */
import {
  DISTRICT_BY, F, ITEMS, SKILLS, SKILL_ORDER, TARGETS,
  type DistrictDef, type MapData, type MapRoute, type SkillId, type TargetDef,
} from '../data';
import {
  COMMISSION_RATE, DIST, E, MATCH, REQUIRE_BOTH_SIDES, RUN, SERVICE_FEE_RATE, addXp, lunchTime, power, radiusOf, refreshEff,
  skLv, skillUnlocked, unlockedTargets,
} from '../rules';
import { S } from '../state';

const rand = Math.random;
const rnd = (a: number, b: number) => a + rand() * (b - a);
const pickOne = <T>(a: T[]): T => a[Math.floor(rand() * a.length)];
const hyp = Math.hypot;
/** 금액은 원 단위 정수: 반올림, 0보다 크면 최소 1원(아주 작은 계약에서 0원이 뜨지 않게) */
export const won1 = (x: number): number => (x > 0 ? Math.max(1, Math.round(x)) : 0);
/** 보스가 나올 수 있는 가장 이른 판 시간(초) — 영업 시작! 알약 0.95초 + 여유 */
const BOSS_AFTER = 1.2;

export interface Ent {
  id: number; t: TargetDef; x: number; y: number; dir: 1 | -1; hp: number; max: number; w: number;
  road: MapRoute | null; lots: number[]; life: number; grace: number; frz: number; hit: number; src: SkillId | null;
  tank: boolean; boss: boolean; dartT: number; dart: number; hopCD: number; hops: number; jetT: number;
  damaged: boolean; warn: boolean; fleeing: boolean; lifeMax: number; age: number; inR: boolean;
  /** 그림 쪽이 붙이는 자리 */
  view?: unknown;
}
export interface ContractResult {
  gmv: number; comm: number; fee: number; rev: number; xp: number; point: number; crit: boolean; M: number; G0: number;
  pending: boolean; grade: number; released: { gmv: number; comm: number } | null; fromSkill: SkillId | null;
}
export interface Chest { id: number; x: number; y: number; t: number; tier: number; got?: boolean }
export interface Inquiry { id: number; x: number; y: number; vx: number; t: number; tier: number; got?: boolean }
export interface FloatItem { id: number; item: string; x: number; y: number; t: number; got?: boolean }
export interface Reward { rev: number; point: number; xp: number; item: string | null; itemNew: boolean }
export type SkFx =
  | { type: 'bomb'; id: number; sk: SkillId; x: number; y: number; t: number; fuse: number; r: number; dmg: number; echo: boolean; done?: boolean; isEcho?: boolean }
  | { type: 'jet'; id: number; sk: SkillId; x: number; y: number; vx: number; vy: number; t: number; life: number; dmg: number; ramp: number; trail: { x: number; y: number }[] }
  | { type: 'qr'; id: number; sk: SkillId; x: number; y: number; t: number; life: number; r: number; dps: number; follow: boolean }
  | { type: 'hot'; id: number; x: number; y: number; t: number; life: number; r: number };

export interface LunchEvents {
  spawn(e: Ent, initial: boolean): void;
  remove(e: Ent, why: 'signed' | 'miss' | 'exit'): void;
  contract(e: Ent, c: ContractResult): void;
  hop(e: Ent, fx: number, fy: number): void;
  flee(e: Ent): void;
  dash(e: Ent): void;
  bolt(sk: SkillId, pts: { x: number; y: number }[]): void;
  skillCast(sk: SkillId, fx: SkFx | null): void;
  promoBoom(fx: SkFx & { type: 'bomb' }): void;
  bounce(fx: SkFx & { type: 'jet' }): void;
  wom(x: number, y: number, r: number, n: number): void;
  hot(fx: SkFx & { type: 'hot' }): void;
  ref(x: number, y: number, n: number): void;
  chestSpawn(c: Chest): void;
  chestOpen(c: Chest, r: Reward): void;
  inquirySpawn(b: Inquiry): void;
  inquiryPick(b: Inquiry, r: Reward): void;
  itemDrop(it: FloatItem): void;
  itemPick(it: FloatItem, isNew: boolean): void;
  point(x: number, y: number, n: number, per10: boolean): void;
  levelUp(lv: number, gained: number): void;
  pendingRelease(gmv: number, comm: number): void;
  matchUp(step: number, M: number): void;
  bossAppear(e: Ent): void;
  firstSeen(e: Ent): void;
  tick(sec: number): void;
}

interface Lot { id: number; x: number; y: number; block: number; occ: number }
interface Big { lots: number[]; x: number; y: number }

export interface RunStats {
  gmv: number; comm: number; fee: number; rev: number; xp: number; point: number; count: number; cN: number; rN: number; corps: number; stores: number;
  /** 선물 상자·인바운드 문의로 받은 매출(수수료·이용료와 따로). rev = comm + fee + bonus */
  bonus: number; bonusChest: number; bonusInq: number;
  bestM: number; crits: number; best: { t: TargetDef; gmv: number } | null; newItems: string[]; newSeen: string[]; lvFrom: number; netC0: number; netR0: number;
  pendN: number; released: boolean; bossSigned: boolean; misses: number; salesLv: number; techLv: number;
}

export class Lunch {
  readonly map: MapData;
  readonly dist: DistrictDef;
  readonly mod: Record<string, number>;
  readonly pool: TargetDef[];
  readonly U: number;
  readonly DS: Record<string, number>;
  readonly area: { x0: number; x1: number; y0: number; y1: number };
  t = 0;
  total: number;
  left: number;
  ended = false;
  ents: Ent[] = [];
  fx: SkFx[] = [];
  chests: Chest[] = [];
  inquiries: Inquiry[] = [];
  items: FloatItem[] = [];
  net = { x: 0, y: 0 };
  cd: Record<string, number> = {};
  cN = 0;
  rN = 0;
  M = 1;
  matchStep = 0;
  stats: RunStats;
  /** 이번 판 시작 때 거래액 배율(숫자 크기 기준) */
  readonly gmvMult: number;
  private uid = 0;
  private spawnT = 0;
  private fpsT = 0;
  private chestT: number;
  private inqT: number;
  private topDone = false;
  private top2Done = false;
  private lots: Lot[];
  private bigs: Big[];
  private plaza: { x: number; y: number };
  private lastTick = 99;

  constructor(map: MapData, public ev: LunchEvents) {
    refreshEff();
    this.map = map;
    this.dist = DISTRICT_BY[S.district];
    this.mod = this.dist.mod || {};
    this.pool = unlockedTargets();
    this.U = map.U;
    this.DS = {};
    for (const k in DIST) {
      const v = DIST[k];
      if (typeof v === 'number') this.DS[k] = v * this.U;
      else if (Array.isArray(v)) v.forEach((x: number, i: number) => (this.DS[k + i] = x * this.U));
    }
    this.area = { x0: map.area.x, x1: map.area.x + map.area.w, y0: map.area.y, y1: map.area.y + map.area.h };
    this.total = lunchTime();
    this.left = this.total;
    this.lots = map.spawnSlots.filter((o) => o.kind === 'lot').map((o) => ({ id: o.id, x: o.x, y: o.y, block: o.block, occ: 0 }));
    this.bigs = map.spawnSlots.filter((o) => o.kind === 'big').map((o) => ({ lots: o.lots || [], x: o.x, y: o.y }));
    const pz = map.spawnSlots.find((o) => o.kind === 'plaza')!;
    this.plaza = { x: pz.x, y: pz.y };
    this.net = { x: map.area.x + map.area.w / 2, y: map.area.y + map.area.h / 2 };
    this.chestT = rnd(F.CHEST.first[0], F.CHEST.first[1]);
    this.inqT = rnd(F.INQUIRY.first[0], F.INQUIRY.first[1]);
    for (const id of SKILL_ORDER) this.cd[id] = rnd(F.FIRST_SKILL[0], F.FIRST_SKILL[1]);
    this.gmvMult = 1 + E.gmv + (this.mod.gmv || 0);
    this.stats = {
      gmv: 0, comm: 0, fee: 0, rev: 0, xp: 0, point: 0, count: 0, cN: 0, rN: 0, corps: 0, stores: 0, bonus: 0, bonusChest: 0, bonusInq: 0, bestM: 1, crits: 0, best: null, newItems: [], newSeen: [],
      lvFrom: S.lv, netC0: S.netC, netR0: S.netR, pendN: 0, released: false, bossSigned: false, misses: 0, salesLv: 0, techLv: 0,
    };
  }

  /** 첫 등장 호출 (그림 준비 뒤) */
  begin(): void {
    const maxF = RUN.MAX_TARGETS + E.crowd;
    for (let i = 0; i < RUN.INIT_CALLS + E.crowd && this.ents.length < maxF; i++) this.spawnFish(true);
  }

  get R(): number {
    return radiusOf(this.U);
  }
  get P(): number {
    return power();
  }
  maxTargets(): number {
    return RUN.MAX_TARGETS + E.crowd;
  }

  /* ── 자리 ── */
  private freeLots(): Lot[] {
    return this.lots.filter((l) => !l.occ);
  }
  private outside<T extends { x: number; y: number }>(list: T[], pad?: number): T[] {
    const R = this.R + (pad ?? this.map.lot * 0.5);
    const o = list.filter((l) => hyp(l.x - this.net.x, l.y - this.net.y) > R);
    return o.length ? o : list;
  }
  private addEnt(t: TargetDef, x: number, y: number, dir: 1 | -1, extra: Partial<Ent>, initial: boolean): Ent {
    const hp = t.hp * (1 - Math.min(0.5, E.soft));
    const e: Ent = {
      id: ++this.uid, t, x, y, dir, hp, max: hp, w: this.map.lot * t.s, road: null, lots: [], life: 0, grace: RUN.GRACE, frz: 0, hit: 0, src: null,
      tank: t.beh === 'tank' || t.beh === 'boss', boss: t.beh === 'boss', dartT: rnd(1, 4), dart: 0, hopCD: 0, hops: 0, jetT: -9,
      damaged: false, warn: false, fleeing: false, lifeMax: 0, age: 0, inR: false, ...extra,
    };
    if (!e.road) {
      e.life = t.beh === 'boss' ? 1e9 : RUN.LIFE_BASE * rnd(RUN.LIFE_JITTER[0], RUN.LIFE_JITTER[1]) * (t.lifeMult || 1);
      e.lifeMax = e.life;
    }
    this.ents.push(e);
    this.ev.spawn(e, initial);
    if (e.boss) this.ev.bossAppear(e);
    if (t.tier >= 4 && !S.seen[t.id]) {
      S.seen[t.id] = 1;
      this.stats.newSeen.push(t.id);
      this.ev.firstSeen(e);
    } else if (!S.seen[t.id]) S.seen[t.id] = 1;
    return e;
  }
  private pickFish(): TargetDef {
    const pool = this.pool;
    const rare = 1 + E.rare + (this.mod.rare || 0);
    let lack: 'corp' | 'store' | null = null;
    if (E.autoMatch) lack = this.cN > this.rN ? 'store' : this.rN > this.cN ? 'corp' : null;
    /* 보스는 '영업 시작!' 알약(0.95초)이 사라진 뒤에 등장(첫 호출에 섞여 나오면 등장 연출이 시작 알약과 겹침) */
    const bossOut = this.stats.bossSigned || this.ents.some((e) => e.boss) || this.t < BOSS_AFTER;
    const ws = pool.map((f, k) => {
      if (f.beh === 'boss' && bossOut) return 0;
      let w = f.w * (k >= pool.length - 2 ? rare : 1) * (f.beh === 'group' ? 0.5 : 1);
      if (f.side === 'store') w *= this.mod.storeBias || 1;
      if (f.side === 'corp') w *= this.mod.corpBias || 1;
      if (f.big) w *= this.mod.bigBias || 1;
      w *= (this.dist.weight || {})[f.id] || 1;
      if (lack && f.side === lack) w *= 1 + E.autoMatch;
      return w;
    });
    let tt = ws.reduce((a, b) => a + b, 0) * rand();
    for (let k = 0; k < pool.length; k++) {
      tt -= ws[k];
      if (tt <= 0) return pool[k];
    }
    return pool[0];
  }
  private place(t: TargetDef, near?: { x: number; y: number }, initial = false): Ent | null {
    if (t.beh === 'boss' && this.t < BOSS_AFTER) t = this.pool[0];
    if (t.beh === 'road') {
      const ln = pickOne(this.map.routes);
      const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;
      const s = dir > 0 ? ln.pts[0] : ln.pts[1];
      return this.addEnt(t, s.x, s.y, dir, { road: ln }, initial);
    }
    if (t.beh === 'boss') {
      /* 보스는 판 내내 한 곳만 — 이번 판에 이미 계약했으면 다시 나오지 않음 */
      if (this.stats.bossSigned || this.ents.some((f) => f.boss)) return null;
      return this.addEnt(t, this.plaza.x, this.plaza.y, 1, { lots: [] }, initial);
    }
    if (t.big) {
      let c = this.bigs.filter((b) => b.lots.every((i) => !this.lots[i].occ));
      if (!c.length) return null;
      c = this.outside(c, this.map.lot);
      const b = pickOne(c);
      const e = this.addEnt(t, b.x, b.y, 1, { lots: b.lots.slice() }, initial);
      b.lots.forEach((i) => (this.lots[i].occ = e.id));
      return e;
    }
    let fl = this.freeLots();
    if (near) fl = fl.filter((l) => hyp(l.x - near.x, l.y - near.y) < this.DS.hopDist);
    else fl = this.outside(fl);
    if (!fl.length) return null;
    const l = pickOne(fl);
    const e = this.addEnt(t, l.x, l.y, 1, { lots: [l.id] }, initial);
    l.occ = e.id;
    return e;
  }
  spawnFish(initial = false, force?: TargetDef): void {
    const f = force || this.pickFish();
    if (f.beh === 'group') {
      let bl = this.map.blocks
        .filter((b) => b.kind === 'lots')
        .map((b) => ({ b, x: b.cx, y: b.cy, free: b.lots.filter((i) => !this.lots[i].occ) }))
        .filter((o) => o.free.length >= 3);
      bl = this.outside(bl, this.map.lot * 1.5);
      if (!bl.length) {
        this.place(f, undefined, initial);
        return;
      }
      const o = pickOne(bl);
      const n = Math.min(o.free.length, 3 + Math.floor(rand() * 4));
      for (let i = 0; i < n; i++) {
        const lid = o.free.splice(Math.floor(rand() * o.free.length), 1)[0];
        const l = this.lots[lid];
        const e = this.addEnt(f, l.x, l.y, 1, { lots: [lid] }, initial);
        e.grace += i * 0.05;
        l.occ = e.id;
      }
      return;
    }
    this.place(f, undefined, initial);
  }
  private release(e: Ent): void {
    for (const i of e.lots) if (this.lots[i] && this.lots[i].occ === e.id) this.lots[i].occ = 0;
  }
  private hurt(f: Ent, d: number, src: SkillId | null): void {
    if (f.grace > 0) return;
    f.hp -= d * (f.frz > 0 ? 2 : 1);
    f.hit = 0.4;
    f.damaged = true;
    if (src) f.src = src;
  }

  /* ── 한 스텝 ── */
  update(dt: number): boolean {
    if (this.ended) return false;
    this.t += dt;
    this.left -= dt;
    S.play += dt;
    const sec = Math.ceil(this.left);
    if (this.left > 0 && this.left <= 5 && sec !== this.lastTick) {
      this.lastTick = sec;
      this.ev.tick(sec);
    }
    if (this.left <= 0) {
      this.left = 0;
      this.ended = true;
      return false;
    }
    const maxF = this.maxTargets();
    const cap = () => this.ents.length < maxF;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && cap()) {
      this.spawnFish();
      this.spawnT = RUN.SPAWN_EVERY / (1 + E.spawn + (this.mod.spawn || 0));
    }
    if (E.fps) {
      this.fpsT += dt * E.fps;
      while (this.fpsT >= 1) {
        this.fpsT -= 1;
        if (cap()) this.spawnFish();
      }
    }
    if (!this.topDone && this.t > RUN.TOP1_AT && this.pool.length > 2) {
      this.topDone = true;
      this.spawnFish(false, this.pool[this.pool.length - 1]);
    }
    if (!this.top2Done && this.t > RUN.TOP2_AT && this.pool.length > 3) {
      this.top2Done = true;
      this.spawnFish(false, this.pool[this.pool.length - 2]);
    }
    const P = this.P;
    const R = this.R;
    const nx = this.net.x;
    const ny = this.net.y;
    const slow = this.mod.slow || 1;
    for (const fs of this.ents) {
      fs.hit = Math.max(0, fs.hit - dt);
      fs.age += dt;
      fs.fleeing = false;
      const d = hyp(fs.x - nx, fs.y - ny);
      const inR = d < R + fs.w * 0.3;
      fs.inR = inR && fs.grace <= 0;
      if (fs.grace > 0) {
        fs.grace -= dt;
        continue;
      }
      if (E.auto) {
        fs.hp -= P * E.auto * dt;
        fs.damaged = true;
      }
      if (fs.frz > 0) {
        fs.frz -= dt;
        if (inR) {
          fs.hp -= P * dt * 2;
          fs.src = null;
          fs.hit = 0.4;
          fs.damaged = true;
        }
        if (!fs.road) fs.life -= dt;
        fs.warn = !fs.road && !fs.boss && fs.life <= F.RUN.WARN_LAST;
        continue;
      }
      if (fs.road) {
        let sp = fs.t.spd * this.U * slow;
        if (fs.t.dash) {
          fs.dartT -= dt;
          if (fs.dartT <= 0) {
            fs.dartT = rnd(2, 5);
            fs.dart = 0.6;
            this.ev.dash(fs);
          }
          if (fs.dart > 0) {
            fs.dart -= dt;
            sp *= 3;
          }
        }
        let dir = fs.dir;
        if (fs.t.flee && d < R * RUN.HOP_RANGE) {
          const along = fs.road.ax === 'h' ? fs.x - nx : fs.y - ny;
          const nd: 1 | -1 = along >= 0 ? 1 : -1;
          if (nd !== fs.dir || !fs.fleeing) this.ev.flee(fs);
          dir = nd;
          fs.dir = nd;
          sp *= 1.6;
          fs.fleeing = true;
        }
        if (fs.road.ax === 'h') fs.x += dir * sp * dt;
        else fs.y += dir * sp * dt;
      } else {
        fs.life -= dt;
        if (inR) fs.life = Math.max(fs.life, RUN.LIFE_HOLD);
        fs.warn = !fs.boss && fs.life <= RUN.WARN_LAST;
        if (fs.t.beh === 'hop') {
          fs.hopCD -= dt;
          if (d < R * RUN.HOP_RANGE && fs.hopCD <= 0 && fs.hops < RUN.HOP_MAX) {
            const fl = this.freeLots().filter((l) => hyp(l.x - fs.x, l.y - fs.y) < this.DS.hopDist && hyp(l.x - nx, l.y - ny) > d);
            if (fl.length) {
              const ox = fs.x;
              const oy = fs.y;
              this.release(fs);
              const l = pickOne(fl);
              fs.x = l.x;
              fs.y = l.y;
              fs.lots = [l.id];
              l.occ = fs.id;
              fs.hops++;
              fs.hopCD = RUN.HOP_CD;
              this.ev.hop(fs, ox, oy);
            }
          }
        }
      }
      if (inR) {
        fs.hp -= P * dt;
        fs.src = null;
        fs.hit = 0.4;
        fs.damaged = true;
      }
    }
    /* 스킬 */
    for (const id of SKILL_ORDER) {
      if (!skillUnlocked(id)) continue;
      this.cd[id] -= dt;
      if (this.cd[id] <= 0) {
        if (this.cast(id)) {
          this.cd[id] = this.cooldown(id);
          if (rand() * 100 < (E.dbl[id] || 0)) this.cast(id);
        } else this.cd[id] = RUN.SKILL_RETRY;
      }
    }
    /* 효과 */
    for (const fx of this.fx) {
      fx.t += dt;
      if (fx.type === 'hot') {
        for (const fs of this.ents) {
          const dx = fx.x - fs.x;
          const dy = fx.y - fs.y;
          const dd = hyp(dx, dy);
          if (dd < fx.r) {
            if (fs.road && dd > 6) {
              const k = Math.min(1, dt * F.PASSIVE.hot.pull);
              fs.x += dx * k;
              fs.y += dy * k;
            }
            this.hurt(fs, P * F.PASSIVE.hot.dps * dt, null);
          }
        }
      } else if (fx.type === 'bomb') {
        if (!fx.done && fx.t >= fx.fuse) {
          fx.done = true;
          for (const fs of this.ents) if (hyp(fs.x - fx.x, fs.y - fx.y) < fx.r + fs.w * 0.3) this.hurt(fs, fx.dmg, fx.sk);
          this.ev.promoBoom(fx);
          if (fx.echo) {
            const o = this.DS.promoEchoOffset;
            const echo: SkFx = { type: 'bomb', id: ++this.uid, sk: fx.sk, x: fx.x + rnd(-o, o), y: fx.y + rnd(-o, o), t: 0, fuse: F.SKILL_DMG.promo.echoFuse, r: fx.r * F.SKILL_DMG.promo.echoR, dmg: fx.dmg * F.SKILL_DMG.promo.echoDmg, echo: false, isEcho: true };
            this.fx.push(echo);
            this.ev.skillCast(fx.sk, echo);
          }
        }
      } else if (fx.type === 'jet') {
        fx.x += fx.vx * dt;
        fx.y += fx.vy * dt;
        let b = false;
        if (fx.x < this.area.x0 || fx.x > this.area.x1) {
          fx.vx *= -1;
          fx.x = Math.max(this.area.x0, Math.min(this.area.x1, fx.x));
          b = true;
        }
        if (fx.y < this.area.y0 || fx.y > this.area.y1) {
          fx.vy *= -1;
          fx.y = Math.max(this.area.y0, Math.min(this.area.y1, fx.y));
          b = true;
        }
        if (b) {
          if (fx.ramp) fx.ramp *= F.SKILL_DMG.rush.bounce;
          this.ev.bounce(fx);
        }
        const rr = this.DS.rushR;
        for (const fs of this.ents)
          if (hyp(fs.x - fx.x, fs.y - fx.y) < rr + fs.w * 0.3 && this.t - fs.jetT > F.SKILL_DMG.rush.hitGap) {
            fs.jetT = this.t;
            this.hurt(fs, fx.dmg * (fx.ramp || 1), fx.sk);
          }
      } else if (fx.type === 'qr') {
        if (fx.follow) {
          fx.x += (this.net.x - fx.x) * Math.min(1, dt * 6);
          fx.y += (this.net.y - fx.y) * Math.min(1, dt * 6);
        }
        for (const fs of this.ents) if (hyp(fs.x - fx.x, fs.y - fx.y) < fx.r + fs.w * 0.3) this.hurt(fs, fx.dps * dt, fx.sk);
      }
    }
    this.fx = this.fx.filter((fx) => (fx.type === 'bomb' ? !fx.done : fx.t < fx.life));
    /* 계약·퇴장 */
    const alive: Ent[] = [];
    const lo = this.DS.laneOver + 10;
    for (const fs of this.ents) {
      if (fs.hp <= 0) {
        this.release(fs);
        this.sign(fs);
      } else if (fs.road && (fs.x < -lo || fs.x > this.map.W + lo || fs.y < this.map.area.y - lo || fs.y > this.map.H + lo)) {
        this.ev.remove(fs, 'exit');
        this.stats.misses++;
      } else if (!fs.road && fs.life <= 0) {
        this.release(fs);
        this.ev.remove(fs, 'miss');
        this.stats.misses++;
      } else alive.push(fs);
    }
    this.ents = alive;
    /* 선물 상자 */
    if (E.chest) this.chestT -= dt * (1 + (this.mod.chest || 0) + E.itemFind * 0.5 + F.CHEST.tierSpeed * (E.chest - 1));
    if (E.chest && this.chestT <= 0 && this.chests.length < F.CHEST.max) {
      this.chestT = rnd(F.CHEST.next[0], F.CHEST.next[1]);
      const c: Chest = { id: ++this.uid, x: rnd(this.area.x0 + 40 * this.U, this.area.x1 - 40 * this.U), y: rnd(this.area.y0 + 30 * this.U, this.area.y1 - 30 * this.U), t: 0, tier: Math.max(1, E.chest) };
      this.chests.push(c);
      this.ev.chestSpawn(c);
    }
    for (const c of this.chests) {
      c.t += dt;
      if (hyp(c.x - nx, c.y - ny) < R + this.DS.pickChest) {
        c.got = true;
        this.ev.chestOpen(c, this.openChest());
      }
    }
    this.chests = this.chests.filter((c) => !c.got && c.t < F.CHEST.life);
    /* 인바운드 문의 */
    if (E.inquiry) {
      this.inqT -= dt * (1 + F.INQUIRY.tierSpeed * (E.inquiry - 1));
      if (this.inqT <= 0 && this.inquiries.length < F.INQUIRY.max) {
        this.inqT = rnd(F.INQUIRY.next[0], F.INQUIRY.next[1]);
        const dir = rand() < 0.5 ? 1 : -1;
        const b: Inquiry = { id: ++this.uid, x: dir > 0 ? -30 * this.U : this.map.W + 30 * this.U, y: rnd(this.area.y0 + 40 * this.U, this.area.y1 - 40 * this.U), vx: dir * rnd(this.DS.inquirySpd0, this.DS.inquirySpd1), t: 0, tier: Math.max(1, E.inquiry) };
        this.inquiries.push(b);
        this.ev.inquirySpawn(b);
      }
    }
    for (const b of this.inquiries) {
      b.x += b.vx * dt;
      b.t += dt;
      if (hyp(b.x - nx, b.y - ny) < R + this.DS.pickInquiry) {
        b.got = true;
        this.ev.inquiryPick(b, this.openInquiry());
      }
    }
    this.inquiries = this.inquiries.filter((b) => !b.got && b.x > -60 * this.U && b.x < this.map.W + 60 * this.U);
    /* 떠오르는 아이템 */
    for (const r of this.items) {
      r.y -= this.DS.itemFloat * dt;
      r.t += dt;
      if (hyp(r.x - nx, r.y - ny) < R + this.DS.pickItem) {
        r.got = true;
        const isNew = this.collectItem(r.item);
        this.ev.itemPick(r, isNew);
      }
    }
    this.items = this.items.filter((r) => !r.got && r.t < F.ITEM.life && r.y > this.area.y0 - 50 * this.U);
    return true;
  }

  cooldown(id: SkillId): number {
    return Math.max(RUN.SKILL_CD_MIN, SKILLS[id].cd * Math.pow(F.SKILL_LEVEL.cdStep, skLv(id, 2)) * (1 - E.cd) + (E.cds[id] || 0));
  }

  /* ── 스킬 ── */
  private zap(id: SkillId, x: number, y: number, chains: number, dmg: number): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [{ x, y }];
    const range = this.DS.skillRange;
    let cur = this.ents.filter((f) => f.grace <= 0 && hyp(f.x - x, f.y - y) < range).sort((a, b) => hyp(a.x - x, a.y - y) - hyp(b.x - x, b.y - y))[0];
    const used = new Set<Ent>();
    for (let k = 0; k < chains && cur; k++) {
      this.hurt(cur, dmg, id);
      used.add(cur);
      pts.push({ x: cur.x, y: cur.y - cur.w * 0.35 });
      const c = cur;
      cur = this.ents.filter((f) => !used.has(f) && f.grace <= 0 && hyp(f.x - c.x, f.y - c.y) < this.DS.callHop).sort((a, b) => hyp(a.x - c.x, a.y - c.y) - hyp(b.x - c.x, b.y - c.y))[0];
    }
    return pts;
  }
  cast(id: SkillId): boolean {
    const nx = this.net.x;
    const ny = this.net.y;
    const P = this.P;
    const dm = (1 + E.skillDmg) * Math.pow(F.SKILL_LEVEL.dmgStep, skLv(id, 0));
    const spec = skLv(id, 3) > 0;
    if (!this.ents.some((f) => hyp(f.x - nx, f.y - ny) < this.DS.skillRange)) return false;
    const D = F.SKILL_DMG;
    if (id === 'call') {
      const chains = D.call.chain + skLv(id, 1);
      this.ev.skillCast(id, null);
      this.ev.bolt(id, this.zap(id, nx, ny, chains, P * D.call.mult * dm));
      if (spec) {
        const o = this.DS.callSpecOffset;
        this.ev.bolt(id, this.zap(id, nx + rnd(-o, o), ny + rnd(-o, o), chains, P * D.call.mult * dm));
      }
      return true;
    }
    if (id === 'promo') {
      const fx: SkFx = { type: 'bomb', id: ++this.uid, sk: id, x: nx, y: ny, t: 0, fuse: D.promo.fuse, r: this.DS.promoR * Math.pow(D.promo.rGrowth, skLv(id, 1)), dmg: P * D.promo.mult * dm, echo: spec };
      this.fx.push(fx);
      this.ev.skillCast(id, fx);
      return true;
    }
    if (id === 'rush') {
      const a = rnd(0, Math.PI * 2);
      const fx: SkFx = { type: 'jet', id: ++this.uid, sk: id, x: nx, y: ny, vx: Math.cos(a) * this.DS.rushSpeed, vy: Math.sin(a) * this.DS.rushSpeed, t: 0, life: D.rush.dur + D.rush.durStep * skLv(id, 1), dmg: P * D.rush.mult * dm, ramp: spec ? 1 : 0, trail: [] };
      this.fx.push(fx);
      this.ev.skillCast(id, fx);
      return true;
    }
    if (id === 'qr') {
      const fx: SkFx = { type: 'qr', id: ++this.uid, sk: id, x: nx, y: ny, t: 0, life: D.qr.dur, r: this.R * D.qr.rMult * Math.pow(D.qr.rGrowth, skLv(id, 1)), dps: P * D.qr.mult * dm, follow: spec };
      this.fx.push(fx);
      this.ev.skillCast(id, fx);
      return true;
    }
    return false;
  }

  /* ── 입소문 → 핫플 → 소개 영업 ── */
  private womAt(x: number, y: number): void {
    const PS = F.PASSIVE;
    const r = this.DS.womR;
    let n = 0;
    for (const o of this.ents)
      if (hyp(o.x - x, o.y - y) < r) {
        o.frz = PS.wom.t;
        n++;
      }
    this.ev.wom(x, y, r, n);
    if (this.fx.filter((f) => f.type === 'hot').length >= PS.hot.max) return;
    if (!E.hot || rand() * 100 >= PS.hot.base + E.hotC) return;
    const hot: SkFx = { type: 'hot', id: ++this.uid, x, y, r: this.DS.hotR, t: 0, life: PS.hot.t };
    this.fx.push(hot);
    this.ev.hot(hot);
    if (!E.ref || rand() * 100 >= PS.ref.base) return;
    const n2 = PS.ref.n + E.refN;
    let placed = 0;
    for (let k = 0; k < n2; k++) {
      let f = this.pickFish();
      if (f.beh === 'boss') f = this.pool[0];
      if (f.beh !== 'road' && this.place(f, { x, y })) placed++;
    }
    this.ev.ref(x, y, placed);
  }

  private matchMult(): number {
    const c = this.cN;
    const r = this.rN;
    const mx = Math.max(c, r);
    if (!mx) return 1;
    const pairs = Math.min(c, r);
    const bal = pairs / mx;
    const ramp = Math.min(1, pairs / MATCH.RAMP_PAIRS);
    return 1 + (MATCH.BASE_BONUS + E.match) * bal * ramp;
  }

  avgRev(): number {
    const pool = this.pool;
    return (
      pool.reduce((a, f) => a + (f.value + E.gflat) * (1 + E.gmv + (this.mod.gmv || 0)) * (COMMISSION_RATE * (1 + E.comm) + (f.side === 'corp' ? SERVICE_FEE_RATE * (1 + E.fee) : 0)), 0) / pool.length
    );
  }

  /* ── 계약 ── */
  private sign(fs: Ent): void {
    const f = fs.t;
    const st = this.stats;
    const crit = rand() < RUN.CRIT_BASE + E.crit;
    if (f.side === 'corp') this.cN += fs.boss ? MATCH.BOSS_WEIGHT : 1;
    else this.rN++;
    const M = this.matchMult();
    this.M = M;
    st.bestM = Math.max(st.bestM, M);
    let G0 = (f.value + E.gflat) * (1 + E.gmv + (this.mod.gmv || 0)) * (1 + (E.tv[f.id] || 0)) * (1 + 0.05 * (S.mastery[f.id] || 0)) * (crit ? RUN.CRIT_MULT : 1) * (fs.tank ? RUN.BIG_MULT : 1);
    const src = fs.src;
    if (src) G0 *= 1 + F.SKILL_LEVEL.bonusStep * skLv(src, 4);
    const gmv = won1(G0 * M);
    const comm = won1(gmv * COMMISSION_RATE * (1 + E.comm));
    const fee = f.side === 'corp' ? won1(G0 * SERVICE_FEE_RATE * (1 + E.fee)) : 0;
    const opp = f.side === 'corp' ? S.netR : S.netC;
    if (f.side === 'corp') {
      S.netC++;
      st.corps++;
    } else {
      S.netR++;
      st.stores++;
    }
    let pending = false;
    let released: { gmv: number; comm: number } | null = null;
    let rev = 0;
    let gmvAdd = 0;
    let commAdd = 0;
    if (REQUIRE_BOTH_SIDES && opp === 0) {
      pending = true;
      S.pendG += gmv;
      S.pendC += comm;
      rev = fee;
      st.pendN++;
    } else {
      gmvAdd = gmv;
      commAdd = comm;
      if (S.pendG > 0) {
        released = { gmv: S.pendG, comm: S.pendC };
        gmvAdd += S.pendG;
        commAdd += S.pendC;
        S.pendG = 0;
        S.pendC = 0;
        st.released = true;
      }
      rev = commAdd + fee;
    }
    S.revenue += rev;
    S.revTotal += rev;
    S.gmv += gmvAdd;
    S.commTotal += commAdd;
    S.feeTotal += fee;
    st.gmv += gmvAdd;
    st.comm += commAdd;
    st.fee += fee;
    st.rev += rev;
    st.count++;
    if (crit) st.crits++;
    S.counts[f.id] = (S.counts[f.id] || 0) + 1;
    S.gmvBy[f.id] = (S.gmvBy[f.id] || 0) + gmv;
    if (!st.best || gmv > st.best.gmv) st.best = { t: f, gmv };
    if (!S.best || gmv > S.best.gmv) S.best = { id: f.id, gmv };
    /* 대장포인트 */
    let point = 0;
    const dc = (f.tier >= RUN.POINT_HIGH_TIER ? RUN.POINT_CHANCE_HIGH : RUN.POINT_CHANCE_LOW) * (1 + E.point + (this.mod.point || 0));
    if (rand() < dc) point = Math.max(1, Math.ceil(f.tier / 4));
    /* 경험치 */
    const xp = (f.xp + E.xflat) * (1 + E.xp + (this.mod.xp || 0));
    const grade = Math.min(fs.boss ? 4 : 3, f.grade + (crit ? 1 : 0));
    const res: ContractResult = { gmv, comm, fee, rev, xp, point, crit, M, G0, pending, grade, released, fromSkill: src };
    this.ev.remove(fs, 'signed');
    this.ev.contract(fs, res);
    if (released) this.ev.pendingRelease(released.gmv, released.comm);
    if (point) {
      S.point += point;
      st.point += point;
      this.ev.point(fs.x, fs.y - fs.w * 0.6, point, false);
    }
    if (E.per10 && st.count % 10 === 0) {
      const p = Math.round(E.per10);
      S.point += p;
      st.point += p;
      this.ev.point(fs.x, fs.y - fs.w * 0.9, p, true);
    }
    st.xp += xp;
    const up = addXp(xp);
    if (up) this.ev.levelUp(S.lv, up);
    /* 매칭 단계 */
    const stepsM: number[] = [1.25, 1.5, 1.75, 2, 2.5, 3];
    while (this.matchStep < stepsM.length && M >= stepsM[this.matchStep]) {
      this.matchStep++;
      this.ev.matchUp(this.matchStep, M);
    }
    if (E.respawn && rand() * 100 < E.respawn && this.ents.length < this.maxTargets()) this.spawnFish();
    if (E.wom && rand() * 100 < F.PASSIVE.wom.base + E.womC) this.womAt(fs.x, fs.y);
    if (rand() < RUN.ITEM_CHANCE * (1 + E.itemFind) * (f.tier >= RUN.ITEM_HIGH_TIER ? 2 : 1)) {
      const it: FloatItem = { id: ++this.uid, item: pickOne(ITEMS).id, x: fs.x, y: fs.y - fs.w * 0.4, t: 0 };
      this.items.push(it);
      this.ev.itemDrop(it);
    }
    if (fs.boss) st.bossSigned = true;
  }

  private collectItem(id: string): boolean {
    if (!S.items[id]) {
      S.items[id] = 1;
      this.stats.newItems.push(id);
      refreshEff();
      return true;
    }
    S.point += F.ITEM.dupPoint;
    this.stats.point += F.ITEM.dupPoint;
    return false;
  }
  private openChest(): Reward {
    const C = F.CHEST;
    const r = rand();
    const tier = Math.max(1, E.chest);
    const out: Reward = { rev: 0, point: 0, xp: 0, item: null, itemNew: false };
    if (r < C.split[0]) {
      out.rev = won1(Math.max(C.revMin, this.avgRev() * C.revK) * rnd(C.revJitter[0], C.revJitter[1]) * (1 + C.tierRev * (tier - 1)));
    } else if (r < C.split[1]) {
      out.point = Math.round((C.point[0] + C.point[1] * tier) * (1 + E.point));
    } else {
      const p2 = ITEMS.filter((x) => !S.items[x.id]);
      out.item = (p2.length ? pickOne(p2) : pickOne(ITEMS)).id;
    }
    this.applyReward(out, 'chest');
    return out;
  }
  private openInquiry(): Reward {
    const Q = F.INQUIRY;
    const tier = Math.max(1, E.inquiry);
    const r = rand();
    const out: Reward = { rev: 0, point: 0, xp: 0, item: null, itemNew: false };
    out.xp = (this.pool.reduce((a, f) => a + f.xp + E.xflat, 0) / this.pool.length) * Q.xpK * tier * (1 + E.xp);
    if (r < Q.split[0]) out.rev = won1(Math.max(Q.revMin, this.avgRev() * Q.revK) * tier * rnd(Q.revJitter[0], Q.revJitter[1]));
    else if (r < Q.split[1]) out.point = Math.round((Q.point[0] + Q.point[1] * tier) * (1 + E.point));
    else out.item = pickOne(ITEMS).id;
    this.applyReward(out, 'inq');
    return out;
  }
  private applyReward(o: Reward, from: 'chest' | 'inq'): void {
    const st = this.stats;
    if (o.rev) {
      S.revenue += o.rev;
      S.revTotal += o.rev;
      st.rev += o.rev;
      st.bonus += o.rev;
      if (from === 'chest') st.bonusChest++;
      else st.bonusInq++;
    }
    if (o.point) {
      S.point += o.point;
      st.point += o.point;
    }
    if (o.xp) {
      st.xp += o.xp;
      const up = addXp(o.xp);
      if (up) this.ev.levelUp(S.lv, up);
    }
    if (o.item) o.itemNew = this.collectItem(o.item);
  }

  /** 레벨 화면 표시용 */
  lacking(): 'corp' | 'store' | null {
    if (Math.abs(this.cN - this.rN) < 3) return null;
    return this.cN > this.rN ? 'store' : 'corp';
  }
}

/** 판 끝 처리(상태만): 영업 횟수 +1, 보스를 처음 계약한 판이면 엔딩 판 기록. 엔딩이면 true */
export function closeRun(st: RunStats): boolean {
  S.runs++;
  const ending = st.bossSigned && !S.ending;
  if (ending) S.ending = S.runs;
  return ending;
}

export function targetsForDebug(): TargetDef[] {
  return TARGETS;
}

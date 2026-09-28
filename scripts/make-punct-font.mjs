/**
 * 쉼표·마침표 보정 글꼴 만들기 → src/assets/jua-punct.ttf
 *   node scripts/make-punct-font.mjs
 *
 * 왜: Jua 의 마침표는 기준선 한가운데(아래로 반쯤 내려간 점), 쉼표는 기준선 위에 짧은 빗금이다.
 *     1배 화면(dpr 1)에서 12~20px 로 그리면 쉼표가 점처럼, 마침표가 쉼표처럼 보여 "2,880" 이 "2.880",
 *     "×1.08" 이 "×1,08" 로 읽힌다(2배 화면은 괜찮음).
 * 무엇: Jua 라틴 파일에서 마침표 점을 그대로 가져와 기준선 위로 올리고(마침표),
 *       같은 점 오른쪽에서 왼쪽 아래로 꼬리를 단 쉼표를 새로 그린다. 글자 폭은 Jua 그대로(쉼표 285, 마침표 200)라 줄 길이가 안 바뀐다.
 *       이 파일은 fonts.ts 가 unicode-range U+002C, U+002E 로 Jua 맨 뒤에 얹는다(그 두 글자만 이 파일에서 그림).
 * 라이선스: Jua 는 OFL-1.1(예약 글꼴 이름 없음). 수정본도 OFL 이고 이름은 SikdaeJuaPunct 로 바꿨다.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'node_modules/@fontsource/jua/files/jua-latin-400-normal.woff');
const OUT = path.join(ROOT, 'src/assets/jua-punct.ttf');

/* ── Jua woff 읽기(zlib 표) ── */
const woff = fs.readFileSync(SRC);
const T = {};
for (let i = 0, n = woff.readUInt16BE(12); i < n; i++) {
  const o = 44 + i * 20;
  const tag = woff.toString('latin1', o, o + 4);
  const off = woff.readUInt32BE(o + 4), comp = woff.readUInt32BE(o + 8), orig = woff.readUInt32BE(o + 12);
  let d = woff.subarray(off, off + comp);
  if (comp < orig) d = zlib.inflateSync(d);
  T[tag] = Buffer.from(d);
}
const upm = T.head.readUInt16BE(18);
if (upm !== 1000) throw new Error('Jua unitsPerEm 가 1000 이 아님: ' + upm);

/* Jua 마침표: 중심 (100, 0) 반지름 약 63.5, 폭 200 → 기준선 위로 올림 */
const R = 63.5;
const LIFT = 66;

/** 원호 → TrueType 이차 곡선 점(끝점 제외). a0 → a1(도), 한 조각 45도 이하 */
function arc(cx, cy, r, a0, a1) {
  const pts = [];
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 45));
  const step = (a1 - a0) / n;
  for (let i = 0; i < n; i++) {
    const am = ((a0 + step * (i + 0.5)) * Math.PI) / 180;
    const ae = ((a0 + step * (i + 1)) * Math.PI) / 180;
    const rm = r / Math.cos(((step / 2) * Math.PI) / 180);
    pts.push([cx + Math.cos(am) * rm, cy + Math.sin(am) * rm, 0]);
    pts.push([cx + Math.cos(ae) * r, cy + Math.sin(ae) * r, 1]);
  }
  return pts;
}
const P = (a, cx, cy, r) => [cx + Math.cos((a * Math.PI) / 180) * r, cy + Math.sin((a * Math.PI) / 180) * r];

/* 마침표: 점 하나(시계 방향 = 각도 감소) */
function periodGlyph() {
  const cx = 100, cy = LIFT;
  const pts = [[cx, cy + R, 1], ...arc(cx, cy, R, 90, -270)];
  pts.pop(); // 시작점과 같은 끝점
  return [pts];
}
/* 쉼표: 마침표와 같은 점 + 오른쪽에서 왼쪽 아래로 내려가는 꼬리 */
function commaGlyph() {
  const cx = 150, cy = LIFT, r = R;
  const pts = [[cx, cy + r, 1], ...arc(cx, cy, r, 90, 0)];
  pts.push([cx + r * 1.02, cy - r * 1.35, 0]); // 바깥 곡선
  pts.push([cx - r * 0.75, cy - r * 3.4, 1]); // 꼬리 끝
  pts.push([cx - r * 0.15, cy - r * 1.55, 0]); // 안쪽 곡선
  const back = P(230, cx, cy, r);
  pts.push([back[0], back[1], 1]);
  pts.push(...arc(cx, cy, r, 230, 90));
  pts.pop();
  return [pts];
}

function encodeGlyph(contours) {
  const all = contours.flat().map(([x, y, on]) => [Math.round(x), Math.round(y), on]);
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const parts = [];
  const h = Buffer.alloc(10 + contours.length * 2 + 2);
  h.writeInt16BE(contours.length, 0);
  bb.forEach((v, i) => h.writeInt16BE(v, 2 + i * 2));
  let end = -1;
  contours.forEach((c, i) => {
    end += c.length;
    h.writeUInt16BE(end, 10 + i * 2);
  });
  h.writeUInt16BE(0, 10 + contours.length * 2); // 명령어 없음
  parts.push(h);
  parts.push(Buffer.from(all.map((p) => (p[2] ? 1 : 0))));
  const xb = Buffer.alloc(all.length * 2), yb = Buffer.alloc(all.length * 2);
  let px = 0, py = 0;
  all.forEach((p, i) => {
    xb.writeInt16BE(p[0] - px, i * 2);
    yb.writeInt16BE(p[1] - py, i * 2);
    px = p[0];
    py = p[1];
  });
  parts.push(xb, yb);
  let g = Buffer.concat(parts);
  if (g.length % 4) g = Buffer.concat([g, Buffer.alloc(4 - (g.length % 4))]);
  return { data: g, bb, n: all.length, nc: contours.length };
}

const glyphs = [
  { name: '.notdef', adv: 500, g: null },
  { name: 'comma', adv: 285, g: encodeGlyph(commaGlyph()), cp: 0x2c },
  { name: 'period', adv: 200, g: encodeGlyph(periodGlyph()), cp: 0x2e },
];

/* glyf · loca(긴 형식) · hmtx */
const glyf = Buffer.concat(glyphs.map((g) => (g.g ? g.g.data : Buffer.alloc(0))));
const loca = Buffer.alloc((glyphs.length + 1) * 4);
let off = 0;
glyphs.forEach((g, i) => {
  loca.writeUInt32BE(off, i * 4);
  off += g.g ? g.g.data.length : 0;
});
loca.writeUInt32BE(off, glyphs.length * 4);
const hmtx = Buffer.alloc(glyphs.length * 4);
glyphs.forEach((g, i) => {
  hmtx.writeUInt16BE(g.adv, i * 4);
  hmtx.writeInt16BE(g.g ? g.g.bb[0] : 0, i * 4 + 2);
});
const real = glyphs.filter((g) => g.g);
const bb = [Math.min(...real.map((g) => g.g.bb[0])), Math.min(...real.map((g) => g.g.bb[1])), Math.max(...real.map((g) => g.g.bb[2])), Math.max(...real.map((g) => g.g.bb[3]))];

/* head */
const head = Buffer.from(T.head);
head.writeUInt32BE(0, 8);
bb.forEach((v, i) => head.writeInt16BE(v, 36 + i * 2));
head.writeInt16BE(1, 50);
/* hhea */
const hhea = Buffer.from(T.hhea);
hhea.writeUInt16BE(Math.max(...glyphs.map((g) => g.adv)), 10);
hhea.writeInt16BE(Math.min(...real.map((g) => g.g.bb[0])), 12);
hhea.writeInt16BE(Math.min(...real.map((g) => g.adv - g.g.bb[2])), 14);
hhea.writeInt16BE(Math.max(...real.map((g) => g.g.bb[2])), 16);
hhea.writeUInt16BE(glyphs.length, 34);
/* maxp 1.0 */
const maxp = Buffer.from(T.maxp);
maxp.writeUInt16BE(glyphs.length, 4);
maxp.writeUInt16BE(Math.max(...real.map((g) => g.g.n)), 6);
maxp.writeUInt16BE(Math.max(...real.map((g) => g.g.nc)), 8);
maxp.writeUInt16BE(0, 10);
maxp.writeUInt16BE(0, 12);
/* OS/2: Jua 값 그대로(줄 높이가 같게), 글자 범위만 */
const os2 = Buffer.from(T['OS/2']);
os2.writeUInt16BE(0x2c, 64);
os2.writeUInt16BE(0x2e, 66);
/* post 3.0 (글리프 이름 없음) */
const post = Buffer.from(T.post.subarray(0, 32));
post.writeUInt32BE(0x00030000, 0);
/* cmap: (3,1) format 4 */
const segs = [[0x2c, 1], [0x2e, 2], [0xffff, 0]];
const sub = Buffer.alloc(16 + segs.length * 8);
sub.writeUInt16BE(4, 0);
sub.writeUInt16BE(sub.length, 2);
sub.writeUInt16BE(0, 4);
sub.writeUInt16BE(segs.length * 2, 6);
const sr = 2 * Math.pow(2, Math.floor(Math.log2(segs.length)));
sub.writeUInt16BE(sr, 8);
sub.writeUInt16BE(Math.log2(sr / 2), 10);
sub.writeUInt16BE(segs.length * 2 - sr, 12);
segs.forEach(([c], i) => sub.writeUInt16BE(c, 14 + i * 2));
const so = 14 + segs.length * 2 + 2;
segs.forEach(([c], i) => sub.writeUInt16BE(c, so + i * 2));
segs.forEach(([c, g], i) => sub.writeUInt16BE(c === 0xffff ? 1 : (g - c) & 0xffff, so + segs.length * 2 + i * 2));
const cmap = Buffer.concat([Buffer.from([0, 0, 0, 1, 0, 3, 0, 1, 0, 0, 0, 12]), sub]);
/* name */
const names = [
  [0, 'Copyright 2018 The BM JUA Project Authors. Comma and period reshaped for sikdae-tycoon (2026).'],
  [1, 'SikdaeJuaPunct'],
  [2, 'Regular'],
  [3, 'SikdaeJuaPunct-Regular'],
  [4, 'SikdaeJuaPunct Regular'],
  [5, 'Version 1.000'],
  [6, 'SikdaeJuaPunct-Regular'],
  [13, 'This Font Software is licensed under the SIL Open Font License, Version 1.1.'],
  [14, 'https://openfontlicense.org'],
];
const strs = names.map(([, t]) => Buffer.from(t, 'utf16le').swap16());
const nameHead = Buffer.alloc(6 + names.length * 12);
nameHead.writeUInt16BE(0, 0);
nameHead.writeUInt16BE(names.length, 2);
nameHead.writeUInt16BE(nameHead.length, 4);
let so2 = 0;
names.forEach(([id], i) => {
  const o = 6 + i * 12;
  nameHead.writeUInt16BE(3, o);
  nameHead.writeUInt16BE(1, o + 2);
  nameHead.writeUInt16BE(0x409, o + 4);
  nameHead.writeUInt16BE(id, o + 6);
  nameHead.writeUInt16BE(strs[i].length, o + 8);
  nameHead.writeUInt16BE(so2, o + 10);
  so2 += strs[i].length;
});
const name = Buffer.concat([nameHead, ...strs]);

/* 조립 */
const tables = { 'OS/2': os2, cmap, glyf, head, hhea, hmtx, loca, maxp, name, post };
const tags = Object.keys(tables).sort();
const pad4 = (b) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);
const sum = (b) => {
  const p = pad4(b);
  let s = 0;
  for (let i = 0; i < p.length; i += 4) s = (s + p.readUInt32BE(i)) >>> 0;
  return s;
};
const nT = tags.length;
const dir = Buffer.alloc(12 + nT * 16);
dir.writeUInt32BE(0x00010000, 0);
dir.writeUInt16BE(nT, 4);
const tsr = 16 * Math.pow(2, Math.floor(Math.log2(nT)));
dir.writeUInt16BE(tsr, 6);
dir.writeUInt16BE(Math.floor(Math.log2(nT)), 8);
dir.writeUInt16BE(nT * 16 - tsr, 10);
let o = dir.length;
const body = [];
tags.forEach((tag, i) => {
  const d = tables[tag];
  const e = 12 + i * 16;
  dir.write(tag, e, 'latin1');
  dir.writeUInt32BE(sum(d), e + 4);
  dir.writeUInt32BE(o, e + 8);
  dir.writeUInt32BE(d.length, e + 12);
  const p = pad4(d);
  body.push(p);
  o += p.length;
});
const font = Buffer.concat([dir, ...body]);
const headOff = dir.readUInt32BE(12 + tags.indexOf('head') * 16 + 8);
font.writeUInt32BE((0xb1b0afba - sum(font)) >>> 0, headOff + 8);
fs.writeFileSync(OUT, font);
console.log(`${path.relative(ROOT, OUT)} ${font.length} bytes, comma bbox ${glyphs[1].g.bb.join(',')}, period bbox ${glyphs[2].g.bb.join(',')}`);

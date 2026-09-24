/**
 * DOM UI 스타일 — 참치 타이쿤 CSS(두꺼운 흰 테 + 아래로만 떨어지는 납작한 그림자 + 크림 알약·카드) 기준.
 * 단위는 "디자인 px"(원작 CSS px). #ui 전체를 view.kd 배로 줄여 화면에 맞춘다.
 */
const CSS = String.raw`
:root { --ink:#2a2118; --cream:#fff8ec; --paper:#fffdf7; --line:#e6d9bd; --brown:#8a5a2a; --brown-dark:#5c3a1a; --gold:#ffd36b; --gold-dark:#c9a13d;
  --green:#5cb85c; --sky:#4aa3df; --sky-dark:#2b6f9e; --coral:#ff8fab; --purple:#9b7bd8; --dia:#6fd3f7; --sales:#ff7b5e; --tech:#4aa3df; --gmv:#ff9f43; }
#stage, #fxtop { position:fixed; inset:0; width:100%; height:100%; display:block; }
#stage { z-index:1; } #fxtop { z-index:50; pointer-events:none; }
#ui { position:fixed; left:0; top:0; z-index:10; transform-origin:0 0; pointer-events:none; font-family:'Jua','Malgun Gothic','Apple SD Gothic Neo',sans-serif; color:var(--ink);
  -webkit-user-select:none; user-select:none; overflow:hidden; letter-spacing:-.2px; }
#ui * { box-sizing:border-box; }
#ui button { font-family:inherit; color:inherit; }
#ui img { -webkit-user-drag:none; user-drag:none; pointer-events:none; }
#ui .pe, #ui button, #ui .panel, #ui .sheet, #ui .modal, #ui input, #ui .cd, #ui .clickable { pointer-events:auto; }
.ic { width:1.25em; height:1.25em; object-fit:contain; vertical-align:-.22em; display:inline-block; flex:none; }
.scr { position:absolute; inset:0; display:none; }
.scr.on { display:block; }

/* ── 버튼 공통: 누르면 아래 3px + .97, 떼면 1.04 → 1 ── */
.tw { transition: transform .1s cubic-bezier(.3,1.6,.5,1), box-shadow .1s, filter .12s; cursor:pointer; }
.tw:hover { transform: translateY(-2px) scale(1.035); filter:brightness(1.05); }
.tw.down { transform: translateY(3px) scale(.97) !important; transition-duration:.05s; }
.tw.rel { animation: rel .14s ease-out; }
@keyframes rel { 0% { transform:scale(1.045); } 100% { transform:scale(1); } }
.btn { border:3px solid #fff; border-radius:999px; padding:9px 18px; font-size:16px; background:#ff7b5e; color:#fff !important; box-shadow:0 4px 0 #c9502e; white-space:nowrap; display:inline-flex; align-items:center; gap:6px; justify-content:center; }
.btn.down { box-shadow:0 1px 0 #c9502e; }
.btn.green { background:var(--green); box-shadow:0 4px 0 #3a7f3a; } .btn.green.down { box-shadow:0 1px 0 #3a7f3a; }
.btn.blue { background:var(--sky); box-shadow:0 4px 0 var(--sky-dark); } .btn.blue.down { box-shadow:0 1px 0 var(--sky-dark); }
.btn.light { background:#fff; color:var(--brown) !important; box-shadow:0 4px 0 #b8834a; font-size:14px; padding:7px 14px; } .btn.light.down { box-shadow:0 1px 0 #b8834a; }
.btn.red { background:#fff; color:#c0392b !important; box-shadow:0 4px 0 #b8834a; font-size:14px; padding:7px 14px; }
.btn:disabled, .btn.dis { opacity:.45; cursor:default; }
.shake { animation: shk .35s; }
@keyframes shk { 0%,100% { translate:0 0; } 20% { translate:-5px 0; } 40% { translate:5px 0; } 60% { translate:-4px 0; } 80% { translate:3px 0; } }

/* ── HUD 알약 ── */
.hud { position:absolute; left:10px; top:8px; display:flex; flex-direction:column; gap:5px; align-items:flex-start; }
.row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.lvl { display:flex; align-items:center; gap:6px; background:var(--cream); border:3px solid #fff; border-radius:999px; padding:3px 10px 3px 3px; box-shadow:0 3px 0 var(--brown-dark); }
.lvl .n { width:35px; height:35px; border-radius:50%; background:#ff6b6b; color:#fff; display:grid; place-items:center; font-size:16px; border:2px solid #fff; box-shadow:inset 0 -3px 0 rgba(0,0,0,.12); }
.xpbar { width:128px; height:16px; background:#eadfc6; border-radius:999px; overflow:hidden; position:relative; }
.xpbar i { position:absolute; left:0; top:0; bottom:0; background:linear-gradient(90deg,#8fe0c0,#5cb85c); border-radius:999px; transition:width .3s; }
.xpbar span { position:absolute; inset:0; font-size:11px; text-align:center; line-height:16px; color:var(--ink); }
.cur { background:var(--cream); border:3px solid #fff; border-radius:999px; padding:3px 13px 3px 8px; font-size:14px; box-shadow:0 3px 0 var(--brown-dark); white-space:nowrap; display:flex; align-items:center; gap:5px; position:relative; }
.cur b { font-size:27px; letter-spacing:-.5px; font-weight:normal; line-height:1.15; }
.cur .ic { width:28px; height:28px; }
.cur.gmv { background:linear-gradient(180deg,#fff1e0,#ffd6a8); }
.cur.rev { background:linear-gradient(180deg,#fff7d9,#ffe8a3); }
.cur.pt { background:linear-gradient(180deg,#eaf8ff,#c9ecff); }
.cur .gain { font-size:14px; color:#2e7d32; margin-left:2px; }
.cur small { font-size:11px; color:var(--brown); position:absolute; left:44px; top:-9px; background:#fff; border-radius:999px; padding:0 6px; border:2px solid #fff; box-shadow:0 1px 0 var(--line); }
.bump { animation: bump .25s ease; } @keyframes bump { 45% { transform:scale(1.14); } }
.chip { background:var(--cream); border:3px solid #fff; border-radius:999px; padding:2px 10px 2px 5px; font-size:13px; box-shadow:0 3px 0 var(--brown-dark); display:flex; gap:4px; align-items:center; white-space:nowrap; }
.chip .ic { width:20px; height:20px; }
.chip.sales { border-color:#ffc8b8; } .chip.sales b { color:#e0553a; }
.chip.tech { border-color:#bfe0ff; } .chip.tech b { color:#2b6f9e; }
.chip b { font-weight:normal; }
.chip.net b { color:var(--brown-dark); }
.hint { font-size:12px; color:#fff; background:rgba(0,0,0,.35); border-radius:999px; padding:3px 10px; white-space:nowrap; }

/* ── 메뉴 원 ── */
.menu { position:absolute; right:10px; top:8px; display:flex; gap:6px; }
.mb { width:47px; height:47px; border:3px solid #fff; border-radius:50%; background:linear-gradient(180deg,#ffe9a8,#f0b429); box-shadow:0 4px 0 #a8791a; position:relative; padding:0; display:grid; place-items:center; }
.mb .ic { width:28px; height:28px; }
.mb.on { background:linear-gradient(180deg,#fff,#ffd36b); box-shadow:0 4px 0 #a8791a, 0 0 0 3px rgba(255,255,255,.9); }
.mb.down { box-shadow:0 1px 0 #a8791a; }
.mb .dot { position:absolute; top:-5px; right:-4px; width:14px; height:14px; border-radius:50%; background:var(--coral); border:2px solid #fff; display:none; }
.mb.alert .dot { display:block; animation: pulse .8s ease-in-out infinite alternate; }
.mb.fs { background:linear-gradient(180deg,#fff,#f3e8d4); box-shadow:0 4px 0 #b8834a; }
@keyframes pulse { to { transform:scale(1.2); } }
.mb .tip { position:absolute; top:52px; left:50%; transform:translateX(-50%); font-size:11px; background:rgba(0,0,0,.6); color:#fff; padding:1px 7px; border-radius:999px; white-space:nowrap; opacity:0; transition:opacity .15s; pointer-events:none; }
.mb:hover .tip { opacity:1; }

/* ── 패널 ── */
.panel { position:absolute; left:6px; right:6px; bottom:66px; background:rgba(255,248,236,.95); border:4px solid #fff; border-radius:20px; box-shadow:0 6px 0 var(--brown-dark), 0 12px 24px rgba(0,0,0,.3); overflow:hidden; display:none; }
.panel.show { display:block; animation: panelIn .22s cubic-bezier(.3,1.4,.5,1); }
@keyframes panelIn { from { transform:translateY(14px) scale(.98); opacity:0; } }
.panel.tree { background:transparent; box-shadow:0 6px 0 #0f1a40, 0 12px 24px rgba(0,0,0,.35); }
#ui .panel.tree, #ui .panel.tree .body { pointer-events:none; }
.panel .body { position:absolute; inset:0; overflow-y:auto; overflow-x:hidden; padding:12px 12px 110px; scrollbar-width:thin; }
.panel.tree .body { padding:0; overflow:hidden; pointer-events:none; }
.panel h3 { margin:2px 2px 8px; font-size:17px; color:var(--brown-dark); font-weight:normal; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
.panel h3 small { font-size:12px; color:var(--brown); }
.cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px; }
.cd { background:var(--paper); border:3px solid #fff; border-radius:16px; padding:10px; box-shadow:0 3px 0 var(--line); display:flex; flex-direction:column; gap:3px; position:relative; cursor:pointer; transition:transform .1s, box-shadow .1s; }
.cd:hover { transform:translateY(-2px); }
.cd.ok { border-color:var(--green); box-shadow:0 3px 0 #3a7f3a; background:#f4fff0; }
.cd.on { border-color:var(--green); background:#f0fbe8; }
.cd.max { border-color:var(--purple); background:#f6f0ff; box-shadow:0 3px 0 #b9a3e6; }
.cd.lock { opacity:.55; }
.cd.sel { outline:3px solid var(--sky); outline-offset:1px; }
.cd .art { display:grid; place-items:center; height:92px; }
.cd .art img { max-width:100%; max-height:100%; }
.cd .nm { font-size:15px; text-align:center; }
.cd .ds { font-size:12px; color:var(--brown); text-align:center; line-height:1.35; }
.cd .cost { font-size:13px; text-align:center; margin-top:auto; padding-top:3px; }
.cd .badge { position:absolute; right:7px; top:7px; font-size:11px; background:var(--sky); color:#fff; border-radius:999px; padding:1px 7px; border:2px solid #fff; }
.cd .badge.corp { background:#4aa3df; } .cd .badge.store { background:#ff9f43; } .cd .badge.boss { background:#9b7bd8; }
.cd .stars { text-align:center; line-height:1; }
.cd .stars img { width:15px; height:15px; }
.cd .bar { height:9px; background:#eadfc6; border-radius:999px; overflow:hidden; margin:3px 4px 0; }
.cd .bar i { display:block; height:100%; background:linear-gradient(90deg,#b9a3e6,#9b7bd8); border-radius:999px; }
.cd .okTag { position:absolute; left:8px; top:7px; font-size:10px; background:var(--green); color:#fff; border-radius:999px; padding:1px 7px; }
.cd .up { display:flex; justify-content:center; align-items:center; gap:4px; font-size:12px; margin-top:2px; }
.cd .up .btn { font-size:12px; padding:3px 10px; border-width:2px; box-shadow:0 3px 0 #3a7f3a; }
.repTop { display:flex; gap:12px; align-items:center; margin-bottom:10px; background:var(--paper); border-radius:16px; padding:8px 12px; box-shadow:0 3px 0 var(--line); border:3px solid #fff; }
.portrait { border-radius:50%; background:var(--cream); border:4px solid var(--gold); box-shadow:0 3px 0 var(--gold-dark); overflow:hidden; display:grid; place-items:center; }
.portrait img { width:100%; height:100%; }

/* 스킬 판 */
.basics { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:10px; margin-bottom:12px; }
.basics .cd { flex-direction:row; align-items:center; gap:10px; text-align:left; }
.basics .cd .nm, .basics .cd .ds, .basics .cd .cost { text-align:left; }
.basics .cd .art { height:56px; width:56px; flex:none; }
.powers { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
.pw { background:var(--paper); border:3px solid #fff; border-radius:16px; padding:10px; box-shadow:0 3px 0 var(--line); }
.pw h4 { margin:0 0 4px; font-size:16px; font-weight:normal; display:flex; align-items:center; gap:6px; }
.pw h4 small { margin-left:auto; font-size:11px; color:var(--brown); }
.pw p { margin:0 0 8px; font-size:12px; color:var(--brown); line-height:1.35; }
.pw.lockd { opacity:.6; }
.sktree { display:grid; grid-template-columns:repeat(3,1fr); grid-template-areas:". t ." "l m r" ". b ."; gap:6px; }
.sk { background:#fff; border:3px solid var(--line); border-radius:14px; padding:6px 4px; min-height:84px; display:flex; flex-direction:column; align-items:center; gap:1px; text-align:center; cursor:pointer; position:relative; }
.sk.pl { grid-area:l; } .sk.pt { grid-area:t; } .sk.pr { grid-area:r; } .sk.pm { grid-area:m; } .sk.pb { grid-area:b; }
.sk .ic { width:30px; height:30px; } .sk .nm { font-size:12px; line-height:1.15; } .sk .lv { font-size:11px; color:var(--sky-dark); } .sk .c { font-size:10px; color:var(--brown); }
.sk.ok { border-color:var(--green); background:#f4fff0; }
.sk.maxed { border-color:var(--purple); background:#f6f0ff; }
.sk.hid { border-style:dashed; border-color:#cfc7b4; background:#f3efe4; color:#a49a86; cursor:default; }
.sk .dot2 { position:absolute; top:-9px; left:50%; transform:translateX(-50%); font-size:10px; background:var(--purple); color:#fff; border-radius:999px; padding:0 6px; white-space:nowrap; }

/* 설정 */
.stats { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:4px 16px; background:var(--paper); border-radius:16px; padding:10px 14px; border:3px solid #fff; box-shadow:0 3px 0 var(--line); margin-bottom:12px; }
.stat { display:flex; justify-content:space-between; font-size:14px; border-bottom:2px dotted var(--line); padding:4px 0; gap:10px; }
.stat span { color:var(--brown); } .stat b { font-weight:normal; text-align:right; }
.sets { background:var(--paper); border-radius:16px; padding:10px 14px; border:3px solid #fff; box-shadow:0 3px 0 var(--line); margin-bottom:12px; display:flex; flex-direction:column; gap:8px; }
.sets .ln { display:flex; align-items:center; gap:10px; font-size:14px; flex-wrap:wrap; }
.sets .ln > span { min-width:92px; color:var(--brown); }
.sets input[type=range] { flex:1; min-width:120px; accent-color:#ff9f43; height:26px; }
.tog { width:52px; height:28px; border-radius:999px; background:#d8cdb4; border:3px solid #fff; position:relative; box-shadow:0 2px 0 #b8834a; cursor:pointer; flex:none; }
.tog::after { content:''; position:absolute; left:2px; top:2px; width:18px; height:18px; border-radius:50%; background:#fff; transition:left .15s; }
.tog.on { background:var(--green); } .tog.on::after { left:26px; }
.seg { display:flex; border:3px solid #fff; border-radius:999px; overflow:hidden; box-shadow:0 2px 0 #b8834a; }
.seg button { border:0; background:#f3e8d4; padding:4px 14px; font-size:13px; cursor:pointer; }
.seg button.on { background:#ff9f43; color:#fff !important; }
.howto { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:8px; }
.step { display:flex; gap:8px; background:var(--paper); border-radius:14px; padding:8px 10px; border:3px solid #fff; box-shadow:0 3px 0 var(--line); }
.step .no { width:26px; height:26px; border-radius:50%; background:var(--sky); color:#fff; display:grid; place-items:center; flex:none; font-size:14px; }
.step p { margin:0; font-size:13px; line-height:1.45; }
textarea.code { width:100%; height:64px; font-size:11px; border:2px solid var(--line); border-radius:10px; padding:6px; font-family:monospace; resize:none; pointer-events:auto; }

/* ── 하단 설명 바 ── */
.sheet { position:absolute; left:10px; right:10px; bottom:10px; background:var(--cream); border:3px solid #fff; border-radius:16px; box-shadow:0 4px 0 var(--brown-dark), 0 8px 16px rgba(0,0,0,.3); padding:9px 12px; display:none; align-items:center; gap:12px; z-index:5; min-height:72px; }
.sheet.show { display:flex; animation: sheetIn .18s ease-out; }
@keyframes sheetIn { from { transform:translateY(12px); opacity:0; } }
.sheet .sic { width:48px; height:48px; flex:none; display:grid; place-items:center; }
.sheet .sic img { max-width:48px; max-height:48px; }
.sheet .t { flex:1; min-width:0; }
.sheet .nm { font-size:17px; } .sheet .nm small { font-size:12px; color:var(--sky-dark); margin-left:6px; }
.sheet .ds { font-size:13px; color:var(--brown); line-height:1.35; }
.sheet .pz { text-align:right; font-size:17px; display:flex; flex-direction:column; align-items:flex-end; gap:1px; white-space:nowrap; }
.sheet .pz small { font-size:11px; color:var(--brown); }
.sheet .pz.ok { color:var(--green); } .sheet .pz.ok small.hl { color:var(--green); font-size:12px; }
.sheet .pz.no { color:#c0392b; } .sheet .pz.no small.hl { color:#c0392b; font-size:12px; }
.sheet .pz.gray { color:#8a8070; } .sheet .pz.max { color:var(--purple); }
.sheet .pz .mxl { display:inline-flex; align-items:center; gap:4px; }
.sheet .pz .mxi { width:40px; height:40px; margin:-9px -2px -9px 0; flex:none; }

/* ── 좌하단·우하단 ── */
.bl { position:absolute; left:10px; bottom:10px; display:flex; gap:8px; align-items:center; }
.cfg { width:47px; height:47px; border-radius:50%; border:3px solid #fff; background:var(--cream); box-shadow:0 4px 0 var(--brown-dark); display:grid; place-items:center; padding:0; }
.cfg.on { background:var(--gold); }
.cfg .ic { width:28px; height:28px; }
.dist { border:3px solid #fff; border-radius:999px; background:var(--cream); box-shadow:0 4px 0 var(--brown-dark); padding:5px 14px 5px 8px; font-size:15px; display:flex; align-items:center; gap:6px; text-align:left; }
.dist small { display:block; font-size:11px; color:var(--brown); }
.dist.glow { animation: dglow 1s ease-in-out 3; }
@keyframes dglow { 50% { box-shadow:0 4px 0 var(--brown-dark), 0 0 0 8px rgba(255,211,107,.8); } }
.go { position:absolute; right:10px; bottom:9px; border:4px solid #fff; border-radius:999px; background:linear-gradient(180deg,#5cc6ff,#2f8fdc); color:#fff !important; font-size:23px; padding:11px 28px 11px 20px;
  box-shadow:0 6px 0 #1f5f9a, 0 10px 20px rgba(0,0,0,.35); animation: goglow 1.5s ease-in-out infinite alternate; display:flex; align-items:center; gap:8px; text-shadow:0 2px 0 rgba(0,0,0,.18); }
.go .ic { width:34px; height:34px; }
.go.down { box-shadow:0 2px 0 #1f5f9a; animation:none; }
@keyframes goglow { from { box-shadow:0 6px 0 #1f5f9a, 0 0 0 0 rgba(140,230,255,.75); } to { box-shadow:0 6px 0 #1f5f9a, 0 0 0 16px rgba(140,230,255,0); } }

/* ── 영업 HUD ── */
.lhud { position:absolute; left:8px; right:8px; top:8px; display:flex; flex-direction:column; gap:5px; pointer-events:none; }
.lhud .r1 { display:flex; gap:10px; align-items:center; }
/* 영업 HUD 재화 알약은 값이 커지면 폭이 넓어서, 튀는 크기를 줄여 옆 알약과 겹치지 않게 */
.lhud .cur.bump { animation: bumpS .25s ease; } @keyframes bumpS { 45% { transform:scale(1.05); } }
.lhud .r2 { display:flex; gap:6px; align-items:center; }
.lhud .sp { flex:1; }
.timer { background:var(--cream); border:3px solid #fff; border-radius:999px; box-shadow:0 3px 0 var(--brown-dark); font-size:25px; min-width:112px; text-align:center; padding:3px 12px; display:flex; align-items:center; gap:5px; justify-content:center; }
.timer .ic { width:26px; height:26px; }
.timer.low { background:#ff6b6b; color:#fff; animation: tlow .5s ease-in-out infinite alternate; }
@keyframes tlow { to { transform:scale(1.1); } }
.match { background:rgba(255,248,236,.92); border:3px solid #fff; border-radius:999px; box-shadow:0 3px 0 var(--brown-dark); padding:2px 12px 2px 6px; display:flex; align-items:center; gap:6px; font-size:14px; position:relative; }
.match .ic { width:22px; height:22px; }
.match .mm { font-size:17px; color:#e0553a; min-width:78px; }
.match .mb2 { width:76px; height:9px; background:#eadfc6; border-radius:999px; overflow:hidden; }
.match .mb2 i { display:block; height:100%; background:linear-gradient(90deg,#ffb3c1,#ff6b8b); border-radius:999px; transition:width .2s; }
.match .need { position:absolute; top:-18px; width:22px; height:22px; animation: needb .5s ease-in-out infinite alternate; }
@keyframes needb { to { transform:translateY(-5px); } }
.match.pop { animation: bump .3s ease; }
.pend { background:#fff3c4; border:3px solid #fff; border-radius:999px; box-shadow:0 3px 0 #c9a13d; padding:2px 10px 2px 6px; font-size:13px; display:flex; align-items:center; gap:4px; }
.pend .ic { width:20px; height:20px; }
.dname { background:rgba(0,0,0,.35); color:#fff; border-radius:999px; padding:3px 12px; font-size:13px; display:flex; gap:5px; align-items:center; }
.dname .ic { width:18px; height:18px; }
.lportrait { position:absolute; left:50%; top:58px; transform:translateX(-50%); width:62px; height:62px; transition:transform .1s; }
.lportrait.nod { animation: nod .25s ease; }
@keyframes nod { 50% { transform:translateX(-50%) translateY(4px) scale(.95); } }
.lportrait.cheer { animation: cheer .8s ease; }
@keyframes cheer { 20%,60% { transform:translateX(-50%) scale(1.18) rotate(-6deg); } 40% { transform:translateX(-50%) scale(1.18) rotate(6deg); } }
.slots { position:absolute; left:14px; bottom:12px; display:flex; gap:9px; pointer-events:none; }
.slot { width:62px; height:62px; border-radius:14px; background:rgba(0,0,0,.45); border:2px solid rgba(255,255,255,.75); position:relative; display:grid; place-items:center; overflow:hidden; }
.slot .ic { width:40px; height:40px; }
.slot.lockd { opacity:.4; }
.slot .lk { position:absolute; right:3px; bottom:3px; width:18px; height:18px; }
.slot .cdv { position:absolute; left:0; right:0; bottom:0; background:rgba(0,0,0,.55); }
.slot .cdt { position:absolute; inset:0; display:grid; place-items:center; color:#fff; font-size:15px; text-shadow:0 1px 2px #000; }
.slot.fire { animation: fire .3s ease; }
@keyframes fire { 0% { box-shadow:0 0 0 0 #fff; background:rgba(255,255,255,.9); } 100% { box-shadow:0 0 0 14px rgba(255,255,255,0); } }
.endbtn { position:absolute; right:10px; bottom:10px; }
.startPill { position:absolute; left:50%; top:40%; transform:translate(-50%,-50%); background:var(--cream); border:4px solid #fff; border-radius:999px; box-shadow:0 6px 0 var(--brown-dark); padding:10px 30px; font-size:34px; color:var(--brown-dark); animation: spill .9s ease forwards; white-space:nowrap; display:flex; gap:10px; align-items:center; }
.startPill .ic { width:42px; height:42px; }
@keyframes spill { 0% { transform:translate(-50%,-50%) scale(.3); opacity:0; } 25% { transform:translate(-50%,-50%) scale(1.15); opacity:1; } 40% { transform:translate(-50%,-50%) scale(1); } 80% { opacity:1; } 100% { transform:translate(-50%,-80%) scale(1); opacity:0; } }
.spd { position:fixed; left:50%; bottom:8px; transform:translateX(-50%); background:rgba(0,0,0,.6); color:#fff; padding:3px 12px; border-radius:10px; font-size:15px; display:none; z-index:30; align-items:center; gap:4px; }
.spd .ic { width:18px; height:18px; }

/* ── 모달 ── */
.modal { position:absolute; inset:0; background:rgba(0,0,0,.55); display:none; align-items:center; justify-content:center; z-index:20; padding:12px; }
.modal.show { display:flex; animation: fadeIn .2s; }
@keyframes fadeIn { from { opacity:0; } }
.box { background:var(--cream); border:4px solid #fff; border-radius:22px; box-shadow:0 8px 0 var(--brown-dark), 0 16px 32px rgba(0,0,0,.3); padding:16px 18px; width:100%; max-width:560px; max-height:100%; overflow-y:auto; text-align:center; animation: popin .35s cubic-bezier(.3,1.5,.5,1); scrollbar-width:thin; }
@keyframes popin { from { transform:scale(0); } 60% { transform:scale(1.25); } to { transform:scale(1); } }
.box h2 { margin:0 0 2px; font-size:24px; font-weight:normal; color:var(--brown-dark); display:flex; align-items:center; justify-content:center; gap:8px; }
.box .sub { font-size:12px; color:var(--brown); margin-bottom:10px; }
.box p { font-size:14px; color:var(--brown); margin:6px 0; line-height:1.45; }
.res { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:8px 0; }
.res > div { background:var(--paper); border-radius:12px; padding:7px 8px; display:flex; flex-direction:column; align-items:center; gap:1px; font-size:12px; color:var(--brown); }
.res > div b { font-size:21px; color:var(--ink); font-weight:normal; }
.res .ic { width:22px; height:22px; }
.res.c3 { grid-template-columns:1fr 1fr 1fr; }
.bigline { background:linear-gradient(180deg,#fff1e0,#ffe0bd); border-radius:14px; padding:8px; border:3px solid #fff; box-shadow:0 3px 0 #e8b27a; }
.bigline .lab { font-size:14px; color:var(--brown); display:flex; align-items:center; justify-content:center; gap:6px; }
.bigline .lab .ic { width:30px; height:30px; }
.bigline b { display:block; font-size:44px; color:#e07a1f; font-weight:normal; line-height:1.1; text-shadow:0 2px 0 #fff; }
.bigline small { display:block; font-size:12px; color:var(--brown); }
.sumline { background:linear-gradient(180deg,#fff7d9,#ffe29a); border-radius:14px; padding:6px 10px; border:3px solid #fff; box-shadow:0 3px 0 var(--gold-dark); display:flex; align-items:center; justify-content:center; gap:8px; font-size:15px; color:var(--brown-dark); margin:8px 0; }
.sumline b { font-size:28px; font-weight:normal; color:#b7791f; }
.sumline .ic { width:28px; height:28px; }
.res .note { font-size:11px; color:#a08a6a; }
.pendline { background:#fff3c4; border-radius:12px; padding:6px 10px; font-size:13px; display:flex; align-items:center; gap:6px; justify-content:center; margin:6px 0; }
.pendline .ic { width:22px; height:22px; }
.dealcard { display:flex; align-items:center; gap:10px; background:var(--paper); border-radius:14px; padding:8px 12px; text-align:left; margin:6px 0; border:3px solid #fff; box-shadow:0 3px 0 var(--line); }
.dealcard .art { width:84px; height:84px; flex:none; display:grid; place-items:center; }
.dealcard .art img { max-width:100%; max-height:100%; }
.dealcard .t { font-size:12px; color:var(--brown); line-height:1.4; }
.dealcard .t b { font-size:17px; color:var(--ink); font-weight:normal; }
.dealcard .t .g { color:#e07a1f; font-size:15px; }
.minis { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; }
.minis .dealcard { flex:1; min-width:200px; }
.foot { font-size:13px; color:var(--brown); margin:8px 0 10px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
.foot span { display:flex; align-items:center; gap:3px; }
.foot .ic { width:18px; height:18px; }
.btns { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
.btns .btn { font-size:19px; padding:10px 22px; }
.btns .btn.light { font-size:16px; }
.dgrid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:8px; }
.dcard { background:var(--paper); border:3px solid #fff; border-radius:16px; box-shadow:0 3px 0 var(--line); padding:6px; cursor:pointer; text-align:center; display:flex; flex-direction:column; gap:3px; }
.dcard img.th { width:100%; aspect-ratio:16/9; object-fit:cover; border-radius:10px; background:#eee; }
.dcard .nm { font-size:16px; display:flex; align-items:center; justify-content:center; gap:4px; }
.dcard .ds { font-size:11px; color:var(--brown); line-height:1.3; }
.dcard { transition:transform .12s cubic-bezier(.3,1.6,.5,1); } .dcard:not(.lock):hover { transform:translateY(-3px) scale(1.02); } .dcard:not(.lock):active { transform:translateY(2px) scale(.98); }
.dcard.on { border-color:var(--green); background:#f0fbe8; }
.dcard.lock { opacity:.5; cursor:default; }
.confirm .btns { margin-top:10px; }
/* 모달 버튼은 내용이 길어도 항상 보이게 */
.box > .btns { position:sticky; bottom:-16px; z-index:2; background:linear-gradient(180deg, rgba(255,248,236,0), var(--cream) 35%); padding:10px 0 6px; margin-top:4px; }

/* ── 토스트 ── */
.toasts { position:absolute; left:0; right:0; top:10px; display:flex; flex-direction:column; align-items:center; gap:6px; z-index:40; pointer-events:none; }
.toast { background:var(--cream); border-radius:999px; box-shadow:0 5px 0 var(--brown-dark), 0 10px 20px rgba(0,0,0,.25); padding:9px 20px; font-size:15px; animation: toastIn .3s cubic-bezier(.3,1.5,.5,1); display:flex; align-items:center; gap:6px; border:3px solid #fff; max-width:min(92%,560px); }
.toast .ic { width:22px; height:22px; }
.toast.out { animation: toastOut .3s forwards; }
@keyframes toastIn { from { transform:translateY(-24px); opacity:0; } }
@keyframes toastOut { to { transform:translateY(-24px); opacity:0; } }
body.lunching #ui .toasts { top:auto; bottom:84px; }
body.lunching #ui.port .toasts { bottom:150px; }
body.lunching #ui.port .toast { font-size:13px; padding:5px 14px; }
#ui.port .toasts { top:auto; bottom:96px; }
body.lunching .spd { display:none !important; }
.lhud .brk { display:none; }
#ui.port .lhud .r2 { flex-wrap:wrap; row-gap:6px; }
#ui.port .lhud .r2 .sp { display:none; }
#ui.port .lhud .r2 .brk { display:block; flex-basis:100%; height:0; order:3; }
#ui.port .lhud .r2 .match { order:1; flex:1 1 auto; min-width:0; }
#ui.port .lhud .r2 .portP { order:2; }
#ui.port .lhud .r2 .pend { order:4; }
#ui.port .lhud .r2 .dname { order:5; margin-left:auto; }
.pend, .dname { white-space:nowrap; flex:none; }
.bossbar { display:none; align-self:center; width:min(520px,70%); margin-top:26px; background:rgba(42,20,40,.72); border:3px solid #fff; border-radius:16px; padding:4px 10px 7px; box-shadow:0 4px 0 #5c2a3a; }
.bossbar.on { display:block; animation: popin .4s cubic-bezier(.3,1.5,.5,1); }
.bossbar .bn { color:#ffe9f0; font-size:15px; display:flex; align-items:center; gap:6px; }
.bossbar .bn .ic { width:20px; height:20px; }
.bossbar .bn span { margin-left:auto; color:#ffd36b; }
.bossbar .bb { position:relative; height:14px; background:rgba(0,0,0,.45); border-radius:999px; overflow:hidden; margin-top:3px; }
.bossbar .bb i { position:absolute; left:0; top:0; bottom:0; border-radius:999px; }
.bossbar .bb .gh { background:#fff; opacity:.85; }
.bossbar .bb .fl { background:linear-gradient(90deg,#ff8fab,#ff5c8a); box-shadow:inset 0 -3px 0 rgba(0,0,0,.15); }
#ui.port .bossbar { margin-top:4px; width:92%; }
.lhud .lfs { width:38px; height:38px; pointer-events:auto; flex:none; } .lhud .lfs .ic { width:22px; height:22px; }
#ui.port .lhud .r2 .lfs { order:6; }
.box.distpick { max-width:700px; }
/* 정산 모달: 내용만 안에서 스크롤, 버튼은 아래에 따로(내용을 덮지 않게). 가로 화면은 두 칸 */
.box.settle { display:flex; flex-direction:column; overflow:hidden; padding-bottom:12px; }
.box.settle > h2, .box.settle > .sub { flex:none; }
.box.settle > .bd { flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; scrollbar-width:thin; margin:0 -8px; padding:0 8px 2px; }
.box.settle > .btns { position:static; flex:none; background:none; padding:8px 0 2px; margin-top:0; }
.box.settle .cols { display:block; }
#ui.land .box.settle { max-width:1060px; }
#ui.land .box.settle .cols { display:grid; grid-template-columns:1fr 1fr; column-gap:14px; align-items:start; }
#ui.land .box.settle .col > :first-child { margin-top:0; }
#ui.land .box.settle .col > :last-child { margin-bottom:0; }
.res.rev .bonus { grid-column:1 / -1; flex-direction:row; justify-content:center; gap:8px; }
.res.rev .bonus .bl2 { display:flex; flex-direction:column; align-items:flex-start; line-height:1.25; text-align:left; }
.res.rev .bonus b { font-size:19px; margin-left:4px; }
.box.settle .minis .dealcard .art { width:56px; height:56px; }
#ui.land .box.settle .minis .dealcard { min-width:0; flex:1 1 calc(33.3% - 6px); padding:4px 8px; margin:3px 0; gap:6px; }
#ui.land .box.settle .minis .dealcard .art { width:44px; height:44px; }
#ui.land .box.settle .minis .dealcard .t { font-size:11px; line-height:1.3; }
#ui.land .box.settle .minis .dealcard .t b { font-size:14px; }
#ui.short .res.rev .bonus b { font-size:16px; }

/* ── 타이틀 ── */
.title { position:absolute; inset:0; }
.title .load { position:absolute; left:50%; top:70%; transform:translateX(-50%); width:min(540px,80%); text-align:center; }
.bar { height:22px; background:var(--cream); border:3px solid #fff; border-radius:999px; box-shadow:0 3px 0 var(--brown-dark); overflow:hidden; position:relative; }
.bar i { position:absolute; left:3px; top:3px; bottom:3px; border-radius:999px; background:linear-gradient(90deg,#8fe0c0,#5cb85c); width:0; transition:width .15s; }
.title .load p { margin:8px 0 0; font-size:15px; color:#fff; text-shadow:0 2px 0 rgba(0,0,0,.35); }
.title .tbtns { position:absolute; left:50%; top:74%; transform:translateX(-50%); display:none; gap:12px; flex-direction:column; align-items:center; }
.title .tbtns.show { display:flex; animation: popin .4s cubic-bezier(.3,1.5,.5,1); }
.title .go { position:static; font-size:28px; padding:13px 40px; }
.title .ver { position:absolute; left:12px; bottom:8px; font-size:14px; color:rgba(255,255,255,.75); text-shadow:0 1px 0 rgba(0,0,0,.3); }
.title .menu { top:8px; right:10px; }

/* ── 트리 머리 막대 ── */
.treehead { position:absolute; left:10px; right:10px; top:8px; display:flex; justify-content:space-between; align-items:flex-start; pointer-events:none; z-index:3; }
.panel:not(.tree) .treehead { display:none; }
.th { display:flex; align-items:center; gap:6px; background:rgba(10,18,50,.6); color:#fff; border-radius:999px; padding:3px 12px 3px 5px; font-size:13px; border:2px solid rgba(255,255,255,.35); }
.th .ic { width:22px; height:22px; }
.thb { width:110px; height:9px; background:rgba(255,255,255,.2); border-radius:999px; overflow:hidden; }
.thb i { display:block; height:100%; border-radius:999px; }
.tcenter { position:absolute; left:50%; top:0; transform:translateX(-50%); background:rgba(10,18,50,.5); color:#dfe8ff; border-radius:999px; padding:3px 12px 3px 6px; font-size:12px; display:flex; align-items:center; gap:4px; border:2px solid rgba(255,255,255,.25); cursor:pointer; }
.tcenter .ic { width:16px; height:16px; }
#ui.port .th span { font-size:12px; } #ui.port .thb { width:64px; } #ui.port .tcenter { top:38px; }
body.lunching #stage { cursor:none; }

/* ── 폰 세로 ── */
#ui.port .hud { left:8px; right:8px; top:8px; gap:6px; }
#ui.port .hud .row { flex-wrap:wrap; }
#ui.port .cur { padding:2px 10px 2px 5px; } #ui.port .cur b { font-size:21px; } #ui.port .cur .ic { width:22px; height:22px; }
#ui.port .menu { position:static; justify-content:space-between; width:100%; margin-top:2px; }
#ui.port .title .menu { position:absolute; width:auto; right:10px; top:8px; margin:0; }
#ui.port .mb { width:44px; height:44px; } #ui.port .mb .ic { width:25px; height:25px; }
#ui.port .xpbar { width:100px; }
#ui.port .cards { grid-template-columns:repeat(2,1fr); gap:8px; }
#ui.port .cd .art { height:74px; }
#ui.port .powers { grid-template-columns:1fr 1fr; }
#ui.port .sheet { flex-wrap:wrap; gap:8px; }
#ui.port .sheet .t { flex-basis:60%; }
#ui.port .sheet .pz { flex-basis:100%; flex-direction:row; justify-content:space-between; align-items:center; gap:8px; white-space:normal; }
#ui.port .go { font-size:21px; padding:10px 20px 10px 14px; }
#ui.port .panel { bottom:70px; }
#ui.port .dgrid { grid-template-columns:1fr 1fr; }
#ui.port .res.c3 { grid-template-columns:1fr 1fr 1fr; }
#ui.port .bigline b { font-size:34px; }
#ui.port .lhud .r1 .cur { display:none; }
#ui.port .lhud .r2x { display:flex; gap:5px; flex-wrap:nowrap; margin-top:6px; }
#ui.port .lhud .r2x .cur { padding:2px 9px 2px 4px; min-width:0; }
#ui.port .lhud .r2x .cur b { font-size:19px; }
#ui.port .lhud .r2x .cur .ic { width:20px; height:20px; }
/* 이번 판 증가분은 알약 위에 작은 딱지로(세로 화면에서 줄이 넘치지 않게) */
#ui.port .lhud .cur .gain { position:absolute; right:4px; top:-11px; font-size:11px; line-height:14px; background:#fff; border-radius:999px; padding:0 5px; box-shadow:0 1px 0 var(--line); margin:0; }
#ui.port .lhud .cur .gain:empty { display:none; }
#ui.port .timer { font-size:22px; min-width:96px; }
#ui.port .lportrait { position:static; transform:none; width:52px; height:52px; margin-left:auto; }
#ui.port .lportrait.nod, #ui.port .lportrait.cheer { animation:none; }
#ui.port .slots { left:50%; transform:translateX(-50%); bottom:14px; }
#ui.port .endbtn { bottom:86px; }
.lbl { position:absolute; left:10px; bottom:86px; display:flex; gap:6px; align-items:center; }
.lbl:empty { display:none; }
.lbl .dname { font-size:14px; padding:5px 12px; }
.lbl .lfs { width:38px; height:38px; pointer-events:auto; flex:none; } .lbl .lfs .ic { width:22px; height:22px; }
#ui.port .dist small { white-space:normal; word-break:keep-all; font-size:10px; line-height:1.2; }
#ui.port .dist { padding:4px 10px 4px 6px; gap:4px; }
#ui.land .lhud .r2x { display:none; }
#ui.narrow .xpbar { width:96px; }
#ui.short .hud { gap:3px; }
#ui.short .cur b { font-size:22px; }
#ui.short .panel { bottom:60px; }
#ui.short .go { font-size:19px; padding:8px 18px 8px 12px; }
#ui.short .mb, #ui.short .cfg { width:40px; height:40px; }
#ui.short .mb .ic, #ui.short .cfg .ic { width:24px; height:24px; }
#ui.short .slot { width:52px; height:52px; }
#ui.short .lportrait { width:48px; height:48px; top:50px; }
#ui.tiny .cur b { font-size:18px; }
/* 낮은 가로 화면(폰 가로): 정산 모달 두 칸 */
#ui.short.land .box.settle { padding:10px 14px; }
#ui.short .box > .btns { bottom:-10px; }
#ui.short .box h2 { font-size:20px; }
#ui.short .box .sub { margin-bottom:4px; }
#ui.short .bigline { padding:4px 8px; } #ui.short .bigline b { font-size:30px; }
#ui.short .res { margin:4px 0; gap:6px; } #ui.short .res > div { padding:3px 6px; } #ui.short .res > div b { font-size:17px; }
#ui.short .sumline { margin:4px 0; padding:3px 10px; } #ui.short .sumline b { font-size:22px; }
#ui.short .dealcard { margin:4px 0; padding:4px 10px; } #ui.short .dealcard .art { width:56px; height:56px; }
#ui.short .foot { margin:4px 0 6px; }
#ui.short .btns .btn { font-size:17px; padding:7px 18px; }
#ui.tiny .mb { width:40px; height:40px; }
/* 통합 검수 보정 */
.nw { white-space:nowrap; display:inline-flex; align-items:center; gap:2px; }
.cd .art { display:flex; align-items:center; justify-content:center; min-height:0; }
.cd .art > img { min-height:0; object-fit:contain; }
#ui.port .cd .art .portrait { width:70px !important; height:70px !important; }
.sk .nm, .sk .c, .pw h4, .pw h4 small, .pw p, .cd .nm, .cd .ds { word-break:keep-all; overflow-wrap:break-word; }
#ui.port .powers { grid-template-columns:1fr; }
/* 2차 검수 보정 */
.dcard .nm, .dcard .ds, .dist, .dist small, .res .note, .pendline, .sheet .ds, .sheet .pz small, .toast span { word-break:keep-all; overflow-wrap:break-word; }
.box.settle [data-count] { white-space:nowrap; }
.dealcard .t { word-break:keep-all; overflow-wrap:break-word; }
.pendline.mastline { background:#f1ebff; }
/* 설명 바 오른쪽 묶음: 데스크톱은 원래대로(위아래), 폰 세로는 아이콘과 글자를 한 덩어리로 */
.sheet .pz .grp { display:contents; }
#ui.port .sheet .pz .grp { display:inline-flex; align-items:center; gap:4px; }
#ui.port .sheet .pz { flex-wrap:wrap; row-gap:2px; }
#ui.port .sheet .pz small { white-space:nowrap; }
#ui.port .sheet .pz small.own { margin-left:auto; }
/* 터치 화면에는 키보드 단축키 이름표를 띄우지 않음(탭하면 hover 가 남아 이름표가 붙어 있음) */
body.touching .mb .tip { display:none; }
@media (hover:none) { .mb .tip { display:none; } }
/* 트리 머리 막대: 뒤로 칸이 비쳐 보이지 않게 띠를 깔고 [가운데로]도 그 안에 */
.panel.tree .treehead { left:0; right:0; top:0; padding:8px 10px 16px; background:linear-gradient(180deg, rgba(14,22,62,.97) 0, rgba(14,22,62,.95) 86%, rgba(14,22,62,0) 100%); }
.panel.tree .th { background:rgba(10,18,50,.92); }
.panel.tree .tcenter { top:8px; background:rgba(10,18,50,.92); }
#ui.port .panel.tree .treehead { padding-bottom:46px; }
#ui.port .panel.tree .tcenter { top:44px; }
/* 폰 가로 영업: 매칭·결제 대기 알약을 첫 줄로 올려 지도 맨 윗줄 부지를 덮지 않게(hud.ts place) */
#ui.short.land .lhud .r1 { gap:6px; }
#ui.short.land .lhud .r1 .pend { flex:none; }
/* 첫 줄이 모자라면(결제 대기 알약까지 뜰 때) 매칭 게이지 막대를 빼고 경험치 막대를 줄임 — hud.ts 가 .tight 를 붙임 */
#ui.short.land .lhud .r1 .match { flex:none; white-space:nowrap; }
#ui.short.land .lhud .r1 .match .need { top:auto; bottom:-20px; }
#ui.short.land .lhud .r1 .match .mm { min-width:0; }
#ui.short.land .lhud .r1 .match .mb2 { width:48px; }
#ui.short.land .lhud .r1.tight .match .mb2 { display:none; }
#ui.short.land .lhud .r1.tight .xpbar { width:72px; }
#ui.short.land .lhud .r1.tight2 .xpbar { display:none; }
#ui.short.land .lhud .r1 .timer { flex:none; }
#ui.short.land .lhud .cur .gain { position:absolute; right:4px; bottom:-12px; font-size:11px; line-height:14px; background:#fff; border-radius:999px; padding:0 5px; box-shadow:0 1px 0 var(--line); margin:0; }
#ui.short.land .lhud .cur .gain:empty { display:none; }
`;

export function injectStyle(): void {
  const st = document.createElement('style');
  st.id = 'game-style';
  st.textContent = CSS;
  document.head.appendChild(st);
}

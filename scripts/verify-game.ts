import assert from 'node:assert/strict';
import { F, CHARS, TREE, DISTRICTS, ITEMS, TARGETS, SKILL_ORDER } from '../src/game/data';
import { S, fresh, replaceState, saveGame, loadGame, exportCode, importCode } from '../src/game/state';
import { refreshEff, itemPool, E, itemEffectValue, canBuyItem } from '../src/game/rules';
import { hireRep } from '../src/game/shop';
import { Lunch } from '../src/game/lunch/logic';
import { genMap } from '../src/game/map/gen';
import { corpShare } from '../src/game/network';
import { STRATEGIES } from '../src/game/strategy';
const saved = new Map<string,string>();
Object.assign(globalThis,{localStorage:{getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>saved.set(k,v),removeItem:(k:string)=>saved.delete(k)}});
const checks:string[]=[];
const check=(name:string,fn:()=>void)=>{fn();checks.push(name)};
const all=()=>{replaceState(fresh());for(const n of TREE)S.tree[n.id]=n.max;refreshEff()};
check('legacy network migrates once, preserving cash and progress',()=>{
 const old:any=fresh();delete old.netRUnit;old.netR=12;old.netC=8;old.revenue=234;old.tree.edu1=1;
 saved.set('sikdae-tycoon:'+F.SAVE_KEY,JSON.stringify(old));assert(loadGame());assert.equal(S.netR,120);assert.equal(S.revenue,234);assert.equal(S.tree.edu1,1);
 saveGame();loadGame();assert.equal(S.netR,120);const code=exportCode();assert.equal(importCode(code),'ok');assert.equal(S.netR,120);
 assert.equal(importCode(btoa(unescape(encodeURIComponent(JSON.stringify(old))))),'ok');assert.equal(S.netR,120);
});
check('hires add permanent positive buffs; selecting old avatar has no effect',()=>{
 all();const before=E.tech;assert(hireRep('squirrel'));assert(E.tech>before);assert(hireRep('penguin'));assert(E.gmv>=0);const eff=JSON.stringify(E);S.rep='bear';refreshEff();assert.equal(JSON.stringify(E),eff);
 for(const c of CHARS){S.reps[c.id]=1;}refreshEff();assert(E.soft<1);assert(E.cd<1);assert(E.gmv>=0);
 assert.equal(itemEffectValue(ITEMS[0].id,1),ITEMS[0].v*(1+E.itemPow));
});
check('five strategies have distinct effects and persist',()=>{
 all();const effects=new Set();for(const s of STRATEGIES){S.strategy=s.id;refreshEff();effects.add(JSON.stringify(E));saveGame();loadGame();assert.equal(S.strategy,s.id);}assert.equal(effects.size,5);
});
check('district-exclusive relic pools cover all 20 and never leak',()=>{
 all();const seen=new Set();for(const d of DISTRICTS){S.district=d.id;const pool=itemPool();assert(pool.length);for(const it of pool){assert.equal(it.district,d.id);seen.add(it.id)}}assert.equal(seen.size,20);
 const late=ITEMS.find(it=>it.district==='sejong')!;replaceState(fresh());S.items[late.id]=1;S.tech=1e15;refreshEff();assert.equal(canBuyItem(late.id),false);
});
check('empty regional pool has safe chest and inquiry fallback',()=>{
 replaceState(fresh());S.district='sejong';S.tree.d_sejong=1;refreshEff();assert.equal(itemPool().length,0);
 const l:any=new Lunch(genMap('sejong','port',13,1),new Proxy({},{get:()=>()=>{}}) as any);
 for(let i=0;i<100;i++){const a=l.openChest(),b=l.openInquiry();assert.equal(a.item,null);assert.equal(b.item,null);}
});
check('1:10 contract counting, skill attribution, balance multiplier',()=>{
 replaceState(fresh());refreshEff();const l:any=new Lunch(genMap('euljiro','port',13,1),new Proxy({},{get:()=>()=>{}}) as any);
 const corp=TARGETS.find(t=>t.id==='c01')!,store=TARGETS.find(t=>t.id==='r01')!;
 for(const src of [null,...SKILL_ORDER]){l.sign({t:corp,boss:false,tank:false,src,x:300,y:400,w:40});l.sign({t:store,boss:false,tank:false,src,x:320,y:400,w:40});}
 assert.equal(S.netC,5);assert.equal(S.netR,50);assert.equal(l.stats.count,10);assert.equal(l.stats.stores,50);assert.equal(l.cN,5);assert.equal(l.rN,50);assert(l.M>1.4);assert(Number.isFinite(S.revenue));assert(S.revenue>0);
});
check('network correction counters late corporate bias',()=>{
 assert(corpShare(300,1000,1.85,1,1)<0.5);assert(corpShare(100,3000,1,1.15,1)>0.5);
 for(const d of DISTRICTS){assert(corpShare(100,1000,d.mod.corpBias||1,d.mod.storeBias||1)>=0.42);assert(corpShare(100,1000,d.mod.corpBias||1,d.mod.storeBias||1)<=0.58);}
});
console.log(JSON.stringify({passed:checks.length,checks},null,2));

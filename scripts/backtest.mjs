import { readFileSync } from "node:fs";
const teams = JSON.parse(readFileSync("data/teams.json","utf8"));
const fixtures = JSON.parse(readFileSync("data/matches.json","utf8")).matches;
const results = JSON.parse(readFileSync("data/results.json","utf8")).matches;
const efi = JSON.parse(readFileSync("data/efi.json","utf8")).matches;
const HOST_OF={USA:"US",Mexico:"MX",Canada:"CA"};
const hostCode=m=>HOST_OF[(m.city||"").split(", ").pop()]||null;
const seed=c=>teams[c]?.elo||1700;
const hc_=m=>m.home?.team, ac_=m=>m.away?.team;
const done=fixtures.filter(m=>{const r=results[m.id];return r&&r.st==="FT"&&r.h!=null&&hc_(m)&&ac_(m);}).sort((a,b)=>a.utc.localeCompare(b.utc));
function eloSeq(list){const E={},get=c=>E[c]??seed(c);const K=22,D=70,bind=c=>{E[c]=seed(c)+Math.max(-D,Math.min(D,get(c)-seed(c)));};
  for(const m of list){const hc=hc_(m),ac=ac_(m),r=results[m.id],host=hostCode(m);
    const dr=(get(hc)+(host===hc?40:0))-(get(ac)+(host===ac?40:0));const eH=1/(1+Math.pow(10,-dr/400));
    const sH=r.h>r.a?1:r.h<r.a?0:0.5;let seff=sH;const ef=efi[m.num];
    if(ef?.xg){const xH=ef.home===hc?ef.xg[0]:ef.xg[1],xA=ef.home===hc?ef.xg[1]:ef.xg[0];seff=0.7*Math.max(0,Math.min(1,0.5+(xH-xA)/4))+0.3*sH;}
    const mg=Math.abs(r.h-r.a),g=mg<=1?1:mg===2?1.5:mg===3?1.75:1.75+(mg-3)/8;const d=K*g*(seff-eH);
    E[hc]=get(hc)+d;E[ac]=get(ac)-d;bind(hc);bind(ac);}
  return c=>E[c]??seed(c);}
const F=[1,1,2,6,24,120,720,5040,40320,362880];const pois=(k,l)=>Math.exp(-l)*Math.pow(l,k)/F[k];const RHO=0.11;
const tau=(x,y,lh,la)=>x===0&&y===0?1-lh*la*RHO:x===0&&y===1?1+lh*RHO:x===1&&y===0?1+la*RHO:x===1&&y===1?1-RHO:1;
function predict(m,rating,playedH,playedA,shrinkOn){const hc=hc_(m),ac=ac_(m),mu=1.35;const sup=Math.max(-2.5,Math.min(2.5,(rating(hc)-rating(ac))/300));
  let lh=mu+sup/2,la=mu-sup/2;const host=hostCode(m);if(host===hc){lh*=Math.exp(0.13);la*=Math.exp(-0.06);}else if(host===ac){la*=Math.exp(0.13);lh*=Math.exp(-0.06);}
  lh=Math.max(0.18,lh);la=Math.max(0.18,la);let pH=0,pD=0,pA=0,best={h:0,a:0,p:0};
  for(let rh=0;rh<9;rh++)for(let ra=0;ra<9;ra++){const p=pois(rh,lh)*pois(ra,la)*tau(rh,ra,lh,la);if(rh>ra)pH+=p;else if(rh<ra)pA+=p;else pD+=p;if(p>best.p)best={h:rh,a:ra,p};}
  const t=pH+pD+pA;let prH=pH/t,prD=pD/t,prA=pA/t;
  if(shrinkOn){const s=0.18*Math.max(0,1-(playedH+playedA)/6);if(s>0){prH=(1-s)*prH+s*0.35;prD=(1-s)*prD+s*0.30;prA=(1-s)*prA+s*0.35;}}
  return{pH:prH,pD:prD,pA:prA,score:best};}
function run(shrinkOn){let brier=0,ll=0,corr=0,exact=0,n=0,sp=0;
  for(let i=0;i<done.length;i++){const m=done[i];const prior=done.slice(0,i);const rating=eloSeq(prior);
    const pH_=prior.filter(x=>hc_(x)===hc_(m)||ac_(x)===hc_(m)).length, pA_=prior.filter(x=>hc_(x)===ac_(m)||ac_(x)===ac_(m)).length;
    const pr=predict(m,rating,pH_,pA_,shrinkOn);const r=results[m.id];const act=r.h>r.a?'H':r.h<r.a?'A':'D';const pAct=act==='H'?pr.pH:act==='A'?pr.pA:pr.pD;sp+=pAct;
    brier+=(pr.pH-(act==='H'))**2+(pr.pD-(act==='D'))**2+(pr.pA-(act==='A'))**2;ll+=-Math.log(Math.max(1e-9,pAct));
    const pred=pr.pH>=pr.pD&&pr.pH>=pr.pA?'H':pr.pA>=pr.pD?'A':'D';if(pred===act)corr++;if(pr.score.h===r.h&&pr.score.a===r.a)exact++;n++;}
  return{acc:Math.round(corr/n*100),exact,meanP:Math.round(sp/n*100),brier:(brier/n).toFixed(3),ll:(ll/n).toFixed(3)};}
const a=run(false),b=run(true);
console.log("                          WITHOUT shrink   WITH draw-aware shrink");
console.log(`Outcome accuracy (W/D/A):      ${a.acc}%             ${b.acc}%`);
console.log(`Mean prob on actual outcome:   ${a.meanP}%             ${b.meanP}%   (33% = random)`);
console.log(`Brier (lower better, .667=rand): ${a.brier}           ${b.brier}`);
console.log(`Log-loss (lower better, 1.099):  ${a.ll}           ${b.ll}`);
console.log(`Exact scoreline hits:          ${a.exact}/18             ${b.exact}/18`);

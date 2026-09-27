import {VISUAL_THEME as THEME} from './visual-theme.mjs';
import {combatCue} from './combat-fx.mjs';

// One-way effects layer: consumes settled results and visible anchors, never issues moves.
const doc=document,root=doc.documentElement,abort=new AbortController(),signal=abort.signal;
const preference=matchMedia('(prefers-reduced-motion: reduce)'),mobile=matchMedia('(max-width: 1000px)');
let reduced=preference.matches,space=null,disposed=false,raf=0,last=0,clock=0,match=null,eventKey=null;
let tx=0,ty=0,x=0,y=0,board=null,arcs=[],particles=[],waves=[],flashes=[];
let tether=null,selected=[],layoutDirty=true;
const host=doc.createElement('div');host.className='space-scene';host.setAttribute('aria-hidden','true');doc.body.prepend(host);
const canopy=doc.createElement('div');canopy.className='cockpit-canopy';canopy.setAttribute('aria-hidden','true');
canopy.innerHTML='<svg viewBox="0 0 1600 900" preserveAspectRatio="none"><path class="canopy-metal" d="M-8 235L18 86Q24 35 112 20L455 -8M1145 -8L1488 20Q1576 35 1582 86L1608 235M-8 660L40 850Q55 889 180 906M1420 906Q1545 889 1560 850L1608 660"/><path class="canopy-rim" d="M2 232L29 88Q35 43 115 30L454 4M1146 4L1485 30Q1565 43 1571 88L1598 232M3 662L50 847Q67 883 180 897M1420 897Q1533 883 1550 847L1597 662"/><path class="canopy-light" d="M32 85Q36 48 110 34M1490 34Q1564 48 1568 85M54 844L62 861L105 879M1495 879L1538 861L1546 844"/></svg>';
doc.body.append(canopy);
const canvas=doc.createElement('canvas');canvas.className='cockpit-fx';canvas.setAttribute('aria-hidden','true');doc.body.append(canvas);
const ctx=canvas.getContext('2d');let width=innerWidth,height=innerHeight;
function resize(){width=innerWidth;height=innerHeight;const ratio=Math.min(devicePixelRatio||1,THEME.dpr);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx?.setTransform(ratio,0,0,ratio,0,0);layoutDirty=true;wake();}
function center(el,px=.5,py=.5){if(!el)return null;const r=el.getBoundingClientRect();return{x:r.left+r.width*px,y:r.top+r.height*py};}
function anchor(actor,engine=false){return center(doc.getElementById(`ship-anchor-${actor}`),engine?(actor?.76:.24):.5,.55);}
function circuit(){for(const panel of doc.querySelectorAll('.goal-panel,.repair-panel,.dock')){if(panel.querySelector('.hud-circuit'))continue;panel.insertAdjacentHTML('beforeend','<svg class="hud-circuit" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="circuit-track" pathLength="400" d="M7 1H93L99 7V93L93 99H7L1 93V7Z"/><path class="circuit-flow" pathLength="400" d="M7 1H93L99 7V93L93 99H7L1 93V7Z"/></svg>');}}
function refreshAnchors(){selected=[...doc.querySelectorAll('.hand .card.selected')].map(el=>center(el,.5,.05));tether=selected.length?anchor(0,true):null;layoutDirty=false;}
function bolt(from,to,colour){if(!from||!to)return;arcs.push({from,to,colour,age:0,seed:Math.random()*100});arcs=arcs.slice(-4);}
function transfer(detail){
  if(reduced||mobile.matches)return;const target=anchor(detail.actor,true);if(!target)return;
  for(const rect of detail.cards||[])for(let i=0;i<16;i++)particles.push({x:rect.left+Math.random()*rect.width,y:rect.top+Math.random()*rect.height,target,age:-i*.006,life:.48+Math.random()*.15,size:1.5+Math.random()*2.5,bend:(Math.random()-.5)*110,colour:THEME.blue});
  particles=particles.slice(-THEME.particles);wake();
}
function state(detail){
  circuit();layoutDirty=true;
  if(detail.match!==match){match=detail.match;eventKey=null;arcs=[];particles=[];waves=[];flashes=[];board=null;}
  if(board&&!reduced&&!mobile.matches)for(let i=0;i<3;i++)if(board[i]!==detail.board?.[i]){
    const r=doc.querySelector(`.track-${i} .rail`)?.getBoundingClientRect();
    if(r){const to={x:r.left+r.width*detail.board[i]/20,y:r.top+2};bolt({x:r.left+r.width*board[i]/20,y:r.top+2},to,THEME.chains[i]);waves.push({...to,age:0,colour:THEME.chains[i],power:.55});}
    doc.querySelector(`.track-${i} .track-heading>span`)?.animate?.([{transform:'translateY(10px)',opacity:.2},{transform:'translateY(0)',opacity:1}],{duration:280,easing:'ease-out'});
  }
  board=detail.board?.slice();const event=detail.event,key=event?`${event.epoch}:${event.seq}:${event.actor}`:null;
  if(key&&key!==eventKey){eventKey=key;if(!reduced&&!mobile.matches){
    const cue=combatCue({...event,blockedDamage:event.blocked}),target=anchor(event.actor===0?1:0),self=anchor(event.actor);
    if(target&&cue.shots)for(let i=0;i<cue.shots;i++)flashes.push({...target,age:-i*cue.shotSpacing/1000,power:cue.power,done:false});
    if(self&&cue.healPulses)for(let i=0;i<cue.healPulses;i++)waves.push({...self,age:-i*.14,power:cue.healPower,colour:THEME.heal,heal:true});
    canvas.dataset.lastCue=`shots:${cue.shots};heal:${cue.healPulses}`;
  }}wake();
}
function line(a,b,colour,alpha=.5,lineWidth=1){ctx.globalAlpha=alpha;ctx.strokeStyle=colour;ctx.lineWidth=lineWidth;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
function paint(now){
  raf=0;if(disposed||doc.hidden||mobile.matches)return;
  const dt=Math.min(.045,(now-last)/1000||.016);last=now;clock+=dt;x+=(tx-x)*Math.min(1,dt*7);y+=(ty-y)*Math.min(1,dt*7);
  root.style.setProperty('--look-x',reduced?'0':x.toFixed(3));root.style.setProperty('--look-y',reduced?'0':y.toFixed(3));
  root.style.setProperty('--glass-x',`${50+x*30}%`);root.style.setProperty('--glass-y',`${25+y*18}%`);
  space?.look(x,y);if(layoutDirty)refreshAnchors();
  if(ctx){ctx.clearRect(0,0,width,height);ctx.globalCompositeOperation='lighter';if(!reduced){
    if(tether)for(const from of selected){ctx.strokeStyle=THEME.blue;ctx.globalAlpha=.13+Math.sin(clock*2)*.025;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.bezierCurveTo(from.x,from.y-60,tether.x,tether.y+60,tether.x,tether.y);ctx.stroke();const t=(clock*.7)%1;ctx.globalAlpha=.65;ctx.fillStyle=THEME.blue;ctx.fillRect(from.x+(tether.x-from.x)*t-1,from.y+(tether.y-from.y)*t-2,2,4);}
    for(const arc of arcs){arc.age+=dt;const t=arc.age/.52;if(t>=1)continue;ctx.globalAlpha=(1-t)*.85;ctx.strokeStyle=arc.colour;ctx.shadowColor=arc.colour;ctx.shadowBlur=10;ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(arc.from.x,arc.from.y);for(let i=1;i<=16;i++){const f=i/16;ctx.lineTo(arc.from.x+(arc.to.x-arc.from.x)*f,arc.from.y+(arc.to.y-arc.from.y)*f+(i===16?0:Math.sin(i*17+arc.seed+Math.floor(clock*30))*7*(1-t)));}ctx.stroke();ctx.shadowBlur=0;}arcs=arcs.filter(a=>a.age<.52);
    for(const p of particles){p.age+=dt;if(p.age<0)continue;const t=Math.min(1,p.age/p.life),ease=t*t*(3-2*t);ctx.globalAlpha=Math.sin(t*Math.PI)*.9;ctx.fillStyle=p.colour;ctx.fillRect(p.x+(p.target.x-p.x)*ease+Math.sin(t*Math.PI)*p.bend,p.y+(p.target.y-p.y)*ease,p.size,p.size*1.5);}particles=particles.filter(p=>p.age<p.life);
    for(const f of flashes){f.age+=dt;if(f.age>=0&&!f.done){f.done=true;space?.impact(f.x,f.y,f.power);}}flashes=flashes.filter(f=>f.age<.6);
    for(const wave of waves){wave.age+=dt;if(wave.age<0)continue;const t=wave.age/(wave.heal?.68:.5);if(t>=1)continue;ctx.globalAlpha=(1-t)*.38;ctx.strokeStyle=wave.colour;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(wave.x,wave.y,(12+t*70)*wave.power,(wave.heal?10+t*38:12+t*70)*wave.power,0,0,Math.PI*2);ctx.stroke();if(wave.heal)for(let i=0;i<8;i++){const a=i*Math.PI/4+t,r=55*wave.power,px=wave.x+Math.cos(a)*r,py=wave.y+Math.sin(a)*r*.55-t*35;line({x:px-3,y:py},{x:px+3,y:py},wave.colour,(1-t)*.5);line({x:px,y:py-3},{x:px,y:py+3},wave.colour,(1-t)*.5);}}waves=waves.filter(w=>w.age<.7);
  }ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}if(!reduced)raf=requestAnimationFrame(paint);
}
function wake(){if(!raf&&!disposed&&!doc.hidden&&!mobile.matches){last=performance.now();raf=requestAnimationFrame(paint);}}
async function ensureSpace(){if(space||disposed||mobile.matches)return;try{const {createSpaceScene}=await import('./battle-scene.bundle.mjs');if(disposed||space)return;space=createSpaceScene(host);space.reduced(reduced);space.pause(doc.hidden||mobile.matches);}catch{root.dataset.spaceRenderer='fallback';}}
addEventListener('pointermove',e=>{tx=(e.clientX/innerWidth-.5)*2;ty=(e.clientY/innerHeight-.5)*2;wake();},{passive:true,signal});
addEventListener('resize',resize,{passive:true,signal});addEventListener('scroll',()=>{layoutDirty=true;},{passive:true,signal});
doc.addEventListener('starchain:state',e=>state(e.detail),{signal});doc.addEventListener('starchain:commit',e=>transfer(e.detail),{signal});
doc.addEventListener('visibilitychange',()=>{space?.pause(doc.hidden||mobile.matches);if(doc.hidden){cancelAnimationFrame(raf);raf=0;}else wake();},{signal});
preference.addEventListener('change',()=>{reduced=preference.matches;space?.reduced(reduced);if(reduced){arcs=[];particles=[];waves=[];flashes=[];tx=ty=0;}wake();},{signal});
mobile.addEventListener('change',()=>{space?.pause(mobile.matches||doc.hidden);if(mobile.matches){cancelAnimationFrame(raf);raf=0;ctx?.clearRect(0,0,width,height);}else{ensureSpace();wake();}},{signal});
addEventListener('pagehide',()=>{disposed=true;abort.abort();cancelAnimationFrame(raf);space?.destroy();canvas.remove();canopy.remove();},{once:true});
resize();circuit();ensureSpace();wake();

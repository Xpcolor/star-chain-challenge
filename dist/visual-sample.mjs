import * as THREE from 'three/webgpu';
import {pass, mrt, output, emissive, uniform, uv, vec2, vec4, float, sin, exp, length, normalize, texture} from 'three/tsl';
import {bloom} from 'three/addons/tsl/display/BloomNode.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {PLAYER_SHIP,FLEET} from './fleet.mjs';
import {createAudioBus} from './audio-bank.mjs';

// Deliberately separate from the rules engine and player records. This page is a
// rendering acceptance sample, with a replaceable portrait / GLB presentation.
const $=id=>document.getElementById(id), clamp=THREE.MathUtils.clamp;
const audio=createAudioBus({enabled:false,volume:.25});
let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches, disposed=false;
let age=0,last=0,mode='idle',modeStart=0,inspect=false,loadedModel=null;
let heroHP=17,enemyHP=18,selected=null,sign=1,pending=[],effects=[],portraitOnly=false;
let w=innerWidth,h=innerHeight,look={x:0,y:0,tx:0,ty:0};
let renderer,pipeline,scene,camera,hero,enemy,flash,key,rim,background;
let frames=0,statTime=0,ready=false;
const shapes=[],ships=[],railValues=[4,10,18],railColors=['#80e5ff','#c899ff','#ffb584'];
const shockCenter=uniform(new THREE.Vector2(.65,.5)),shockAge=uniform(2),shockPower=uniform(0),screenAspect=uniform(1);
const canvas=$('electricity'), ctx=canvas.getContext('2d');let borders=[];
const notice=text=>{$('combat-notice').textContent=text;};

$('rail-list').innerHTML=['蓝星链','紫星链','橙星链'].map((label,i)=>`<div class="rail" style="--rail-color:${railColors[i]}"><b>${label}</b><div class="track">${Array.from({length:21},(_,n)=>`<span class="tick ${[2,3,20].includes(n)?'target':''}">${n}</span>`).join('')}<i class="cursor" id="cursor-${i}" style="left:${railValues[i]*5}%"></i></div><span class="rail-current" id="current-${i}">当前 ${railValues[i]}</span></div>`).join('');
$('cards').innerHTML=[9,5,2,3,8,4].map(n=>`<button data-number="${n}" aria-label="手牌 ${n}" aria-pressed="false"><small>${n}</small>${n}</button>`).join('');
function setHP(){ $('hero-hp').textContent=heroHP;$('enemy-hp').textContent=enemyHP; }
function setMotion(value){reduced=value;document.body.classList.toggle('reduced',value);$('motion').setAttribute('aria-pressed',String(value));$('motion').textContent=value?'完整动效':'减弱动效';}
setMotion(reduced);
$('motion').onclick=()=>setMotion(!reduced);
$('audio').onclick=async()=>{const value=!audio.enabled;if(value&&!await audio.unlock()){notice('浏览器尚未允许声音播放。');return;}audio.setEnabled(value);$('audio').textContent=value?'音效：开':'音效：关';$('audio').setAttribute('aria-pressed',String(value));if(value)audio.play('select');};
$('cards').addEventListener('click',e=>{const card=e.target.closest('button');if(!card)return;selected=Number(card.dataset.number);document.querySelectorAll('#cards button').forEach(b=>b.setAttribute('aria-pressed',String(b===card)));$('selection').textContent=selected;$('damage-total').textContent=$('attack-value').textContent=selected>=5?'3':'1';audio.play('select');});
$('plus').onclick=()=>{sign=1;notice('加法已选定。');};$('minus').onclick=()=>{sign=-1;notice('减法已选定。');};
$('calibrate').onclick=()=>{railValues[0]=railValues[0]===4?3:4;updateRails();notice('蓝星链校准完成。');};
function updateRails(){railValues.forEach((v,i)=>{$(`cursor-${i}`).style.left=`${v*5}%`;$(`current-${i}`).textContent=`当前 ${v}`;});}
$('fire').onclick=()=>{if(!ready)return;if(selected===null){notice('先点选一张手牌。也可向下滚动，单独比较动效。');return;}railValues[0]=clamp(railValues[0]+sign*selected,0,20);updateRails();demo(selected>=5?'combo':'single');};
$('rest').onclick=()=>demo('heal1');$('reset').onclick=reset;
document.querySelectorAll('[data-demo]').forEach(b=>b.onclick=()=>demo(b.dataset.demo));
function reset(){pending=[];clearEffects();mode='idle';modeStart=age;inspect=false;heroHP=17;enemyHP=18;setHP();railValues.splice(0,3,4,10,18);updateRails();selected=null;document.querySelectorAll('#cards button').forEach(b=>b.setAttribute('aria-pressed','false'));$('selection').textContent='—';$('damage-total').textContent=$('attack-value').textContent=$('heal-value').textContent='0';notice('星海静默，等待你的指令。');audio.stop();if(enemy)enemy.visible=true;if(flash)flash.intensity=0;shockPower.value=0;}
function demo(kind){
  if(!ready)return;window.scrollTo(0,0);layout();pending=[];mode='idle';modeStart=age;inspect=false;clearEffects();enemy.visible=true;audio.stop();
  if(kind==='arrival'){mode='arrival';notice('跃迁抵达 · 引擎减速');audio.play('arrival');return;}
  if(kind==='single'||kind==='combo'){
    const count=kind==='combo'?3:1;enemyHP=Math.max(enemyHP,count+1);setHP();notice(count===1?'脉冲炮 · 单次命中':'引擎过载 · 三连齐射');
    for(let i=0;i<count;i++)pending.push({at:age+i*.31,run:()=>shoot(count>1,i)});return;
  }
  if(kind==='heal1'||kind==='heal3'){
    const count=kind==='heal3'?3:1;heroHP=Math.min(heroHP,20-count);setHP();$('heal-value').textContent=count;notice(count===1?'局部修复 · 一道纳米光环':'舰体重构 · 三重修复环');
    for(let i=0;i<count;i++)pending.push({at:age+i*.4,run:()=>repair(count>1)});return;
  }
  if(kind==='fall'){enemyHP=0;setHP();mode='fall';modeStart=age;burst(enemy.position.clone(),0xffbb63,50,2);ring(enemy.position.clone(),0xffc27a,2.8);audio.play('collapse');notice('敌舰失能 · 漂移陨落（完整舰体演示，预切破损待模型制作）');return;}
  if(kind==='victory'){notice('航道已清空 · 星海属于勇敢的你');ring(hero.position.clone(),0xffd695,3);audio.play('victory');}
}

function luminous(color,opacity=1){const m=new THREE.MeshBasicNodeMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});m.emissiveNode=uniform(new THREE.Color(color)).mul(1.4);return m;}
function mesh(geo,mat,parent=scene){const m=new THREE.Mesh(geo,mat);parent.add(m);return m;}
function ownEffect(object,life,update){effects.push({object,life,start:age,update});return object;}
function disposeObject(object){object.traverse(o=>{o.geometry?.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(!m)continue;for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});}
function clearEffects(){for(const e of effects){e.object.removeFromParent();disposeObject(e.object);}effects=[];}
function ring(position,color,size=1){const m=mesh(new THREE.TorusGeometry(1,.018,8,80),luminous(color,.9));m.position.copy(position);m.position.z+=.6;ownEffect(m,.8,(t)=>{m.scale.setScalar((.08+t*size));m.material.opacity=(1-t)**2;});}
function burst(position,color,count=20,power=1){
  const group=new THREE.Group();scene.add(group);group.position.copy(position);const material=luminous(color),geo=new THREE.IcosahedronGeometry(.023,0),pieces=[];
  for(let i=0;i<count;i++){const p=mesh(geo.clone(),material.clone(),group),a=i*2.399;const v=new THREE.Vector3(Math.cos(a)*(1+Math.random()),Math.sin(a)*(1+Math.random()),(Math.random()-.3)*1.5).multiplyScalar(power);p.userData.v=v;pieces.push(p);}
  geo.dispose();material.dispose();ownEffect(group,1.15,t=>{for(const p of pieces){p.position.copy(p.userData.v).multiplyScalar(t);p.scale.setScalar(1-t);p.material.opacity=(1-t)**1.5;}});
}
function shock(position,power){const p=position.clone().project(camera);shockCenter.value.set(p.x*.5+.5,1-(p.y*.5+.5));shockAge.value=0;shockPower.value=reduced?0:power;flash.position.copy(position).add(new THREE.Vector3(0,0,2));flash.intensity=12*power;}
function shield(position){
  const mat=luminous(0xbe9dff,.55),shell=mesh(new THREE.SphereGeometry(1.1,30,18),mat);shell.scale.set(1.25,.75,.7);shell.position.copy(position);shell.position.z+=.2;
  mat.wireframe=true;ownEffect(shell,.38,t=>{mat.opacity=(1-t)*.35;shell.scale.multiplyScalar(1.002);});
}
function shoot(combo,index){
  const from=hero.position.clone().add(new THREE.Vector3(hero.userData.width*.48, index%2?.12:-.12,.3));
  const to=enemy.position.clone().add(new THREE.Vector3(-enemy.userData.width*.4,0,.3));
  const group=new THREE.Group();scene.add(group);
  const shaft=mesh(new THREE.CylinderGeometry(.017,.017,.8,10),luminous(combo?0xb8eaff:0x79e9ff),group);shaft.rotation.z=Math.PI/2;
  const core=mesh(new THREE.CylinderGeometry(.006,.006,.85,6),luminous(0xffffff),group);core.rotation.z=Math.PI/2;
  ownEffect(group,.24,t=>group.position.lerpVectors(from,to,t));ring(from,0x72dfff,.5);audio.play(combo?'cannon':'laser');hero.userData.kick=age;
  pending.push({at:age+.24,run:()=>{enemyHP=Math.max(0,enemyHP-1);setHP();shield(to);burst(to,combo?0xffd59a:0xa5edff,combo?30:17,combo?1.3:.8);ring(to,0xc7a5ff,combo?1.8:1.1);shock(to,combo?1:.5);enemy.userData.kick=age;audio.play('impact');}});
}
function repair(large){heroHP=Math.min(20,heroHP+1);setHP();const group=new THREE.Group();group.position.copy(hero.position);group.position.z+=.4;scene.add(group);const ringMesh=mesh(new THREE.TorusGeometry(1,.018,8,90),luminous(0x80ffda),group);const sparks=[];
  for(let i=0;i<(large?30:16);i++)sparks.push(mesh(new THREE.IcosahedronGeometry(.025,0),luminous(0xb5ffe4),group));
  ownEffect(group,1.45,t=>{const r=.5+t*1.3;ringMesh.scale.set(r*1.5,r*.55,r);ringMesh.rotation.x=.4;ringMesh.material.opacity=Math.sin(t*Math.PI)*.65;sparks.forEach((p,i)=>{const a=i*.65+t*5;p.position.set(Math.cos(a)*r*1.5,Math.sin(a)*r*.5+t*.25,.1);p.material.opacity=Math.sin(t*Math.PI);});});audio.play('repair');}

async function portrait(entry){
  const tex=await new THREE.TextureLoader().loadAsync(entry.portrait);tex.colorSpace=THREE.SRGBColorSpace;
  const [x0,y0,x1,y1]=entry.art.bounds,bodyW=x1-x0,bodyH=y1-y0;
  const root=new THREE.Group(),mat=new THREE.MeshBasicNodeMaterial({map:tex,transparent:true,alphaTest:.015,depthWrite:false,side:THREE.DoubleSide});
  mat.toneMapped=false;
  const plane=mesh(new THREE.PlaneGeometry(1536/bodyW,1024/bodyW),mat,root);plane.position.set((768-(x0+x1)/2)/bodyW,((y0+y1)/2-512)/bodyW,0);
  root.userData={width:1,bodyRatio:bodyH/bodyW,portrait:plane,kick:-20,flames:[]};
  const isHero=entry===PLAYER_SHIP;
  for(const pt of entry.art.engines){
    const m=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    const q=uv(),fade=float(1).sub(q.x),width=q.x.mul(.45).add(.015),profile=exp(q.y.sub(.5).div(width).pow(2).mul(-12)).mul(q.x.sqrt()).mul(float(1).sub(q.x).mul(7).min(1));
    m.colorNode=vec4(isHero?vec4(.12,1.3,2,1).rgb:vec4(1,.35,2,1).rgb,profile.mul(.85));
    const tail=mesh(new THREE.PlaneGeometry(.27,.09),m,root);tail.position.set((pt[0]-(x0+x1)/2)/bodyW+(isHero?-.13:.13),((y0+y1)/2-pt[1])/bodyW,.01);if(!isHero)tail.rotation.z=Math.PI;root.userData.flames.push(tail);
  }
  scene.add(root);ships.push(root);return root;
}
function rectWorld(rect,z=0){const factor=(camera.position.z-z)/camera.position.z;return new THREE.Vector3((rect.x+rect.width/2-w/2)/h*10*factor,(h/2-rect.y-rect.height/2)/h*10*factor,z);}
function layout(){
  w=document.documentElement.clientWidth;h=innerHeight;if(renderer&&camera){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();screenAspect.value=w/h;
    for(const [ship,id] of [[hero,'hero-anchor'],[enemy,'enemy-anchor']]){if(!ship)continue;const r=$(id).getBoundingClientRect();ship.userData.base=rectWorld(r);ship.userData.width=Math.min(r.width/h*10*.98,r.height/h*10/ship.userData.bodyRatio*.95);ship.scale.setScalar(ship.userData.width);}
    if(background){const dist=32.071/12.071,s=1.02*Math.max(w/h/(1672/941),1);background.scale.set(10*1672/941*s*dist,10*s*dist,1);}
  }
  const ch=document.querySelector('.cockpit').offsetHeight,dpr=Math.min(devicePixelRatio,1.5);canvas.width=w*dpr;canvas.height=ch*dpr;canvas.style.width=w+'px';canvas.style.height=ch+'px';ctx.setTransform(dpr,0,0,dpr,0,0);
  borders=Array.from(document.querySelectorAll('[data-electric]')).map(el=>{
    // Project the local perimeter through the same CSS perspective as the glass.
    // A screen-aligned bounding box would leave the lightning floating off its edges.
    const r=el.getBoundingClientRect(),style=getComputedStyle(el),matrix=new DOMMatrixReadOnly(style.transform==='none'?undefined:style.transform);
    const [ox,oy]=style.transformOrigin.split(' ').map(parseFloat),bw=el.offsetWidth,bh=el.offsetHeight,c=18;
    const project=([x,y])=>{const p=new DOMPoint(x-ox,y-oy,0,1).matrixTransform(matrix);return [ox+p.x/p.w,oy+p.y/p.w];};
    const corners=[[0,0],[bw,0],[bw,bh],[0,bh]].map(project),dx=r.x-Math.min(...corners.map(p=>p[0])),dy=r.y+scrollY-Math.min(...corners.map(p=>p[1]));
    const points=[[c,0],[bw-c,0],[bw,c],[bw,bh-c],[bw-c,bh],[c,bh],[0,bh-c],[0,c],[c,0]].map(project).map(p=>[p[0]+dx,p[1]+dy]);
    let total=0;const edges=points.slice(1).map((p,i)=>{const a=points[i],len=Math.hypot(p[0]-a[0],p[1]-a[1]);const e={a,b:p,len,start:total};total+=len;return e;});return {edges,total,color:el.dataset.electric==='violet'?'#aa94ff':'#71dfff'};
  });
}
function perimeter(b,d){d=((d%b.total)+b.total)%b.total;const e=b.edges.find(e=>d<=e.start+e.len)||b.edges.at(-1),t=(d-e.start)/e.len;return [e.a[0]+(e.b[0]-e.a[0])*t,e.a[1]+(e.b[1]-e.a[1])*t];}
function lightning(){ctx.clearRect(0,0,w,canvas.height);for(const b of borders){for(let strand=0;strand<2;strand++){const start=(reduced?0:age*b.total/11)+strand*b.total/2,len=b.total*.17,points=[];for(let i=0;i<=65;i++){const p=perimeter(b,start-i*len/65),n=perimeter(b,start-i*len/65+1),j=reduced?0:Math.sin(i*2.7+Math.floor(age*11)*.8)*Math.sin(i*.45)*2.4;points.push([p[0]-(n[1]-p[1])*j,p[1]+(n[0]-p[0])*j]);}for(let layer=0;layer<2;layer++){ctx.strokeStyle=layer?'#e9fcff':b.color;ctx.lineWidth=layer?.9:3;ctx.shadowColor=b.color;ctx.shadowBlur=layer?5:13;for(let i=1;i<points.length;i++){ctx.globalAlpha=(1-i/points.length)**.75*(reduced?.23:.75);ctx.beginPath();ctx.moveTo(...points[i-1]);ctx.lineTo(...points[i]);ctx.stroke();}}if(!reduced){ctx.strokeStyle=b.color;ctx.lineWidth=.7;ctx.globalAlpha=.3;const a=points[18],b1=points[25];ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(a[0]+8,a[1]+6);ctx.lineTo(b1[0]+13,b1[1]+4);ctx.stroke();}}}ctx.globalAlpha=1;ctx.shadowBlur=0;
  const card=document.querySelector('#cards button[aria-pressed=true]');if(card&&!reduced&&!inspect){const r=card.getBoundingClientRect(),p=$('hero-anchor').getBoundingClientRect(),a=[r.x+r.width/2,r.y+scrollY-5],b=[p.x+p.width*.42,p.y+p.height*.63+scrollY];const g=ctx.createLinearGradient(...a,...b);g.addColorStop(0,'#9fedff90');g.addColorStop(1,'#7ee9ff08');ctx.strokeStyle=g;ctx.lineWidth=1;ctx.shadowBlur=12;ctx.shadowColor='#4dd5ff';ctx.beginPath();ctx.moveTo(...a);ctx.bezierCurveTo(a[0],a[1]-70,b[0]-60,b[1]+80,...b);ctx.stroke();ctx.shadowBlur=0;}
}

async function init(){
  renderer=new THREE.WebGPURenderer({antialias:true,alpha:false,forceWebGL:new URLSearchParams(location.search).get('backend')==='webgl'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;$('universe').append(renderer.domElement);await renderer.init();
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(45,w/h,.1,120);camera.position.z=12.071;scene.add(new THREE.HemisphereLight(0xa4d6ff,0x0e1730,.7));key=new THREE.DirectionalLight(0xcce9ff,1.6);key.position.set(-4,7,6);rim=new THREE.DirectionalLight(0xb58bff,1.3);rim.position.set(4,2,-4);flash=new THREE.PointLight(0x9adeff,0,25,1.5);scene.add(key,rim,flash);
  const bgTex=await new THREE.TextureLoader().loadAsync('./assets/cosmos-v2.png');bgTex.colorSpace=THREE.SRGBColorSpace;const bgMat=new THREE.MeshBasicNodeMaterial({map:bgTex,color:0x7b91ad});bgMat.toneMapped=false;background=mesh(new THREE.PlaneGeometry(1,1),bgMat);background.position.z=-20;
  [hero,enemy]=await Promise.all([portrait(PLAYER_SHIP),portrait(FLEET[7])]);
  const loader=new GLTFLoader();
  const [heroGLB,enemyGLB,env]=await Promise.all([loader.loadAsync('./assets/tripo-sample-2.glb'),loader.loadAsync('./assets/tripo-sample-1.glb'),new HDRLoader().loadAsync('./assets/studio-light.hdr')]);
  env.mapping=THREE.EquirectangularReflectionMapping;scene.environment=env;scene.environmentIntensity=.55;
  loadedModel=attachModel(hero,heroGLB.scene,true);attachModel(enemy,enemyGLB.scene,false);
  $('inspect-model').disabled=$('side-light').disabled=$('portrait-compare').disabled=false;
  $('model-status').textContent='已接入：我方曙光 + 敌方 8 级突击舰 · 2 个带颜色贴图的完整模型';
  const rockGeo=new THREE.IcosahedronGeometry(1,1),rockMat=new THREE.MeshStandardNodeMaterial({color:0x3b475f,roughness:.8,metalness:.18,flatShading:true});
  for(let i=0;i<26;i++){const r=mesh(rockGeo.clone(),rockMat.clone());r.userData.base=new THREE.Vector3((i%2?-1:1)*(6+Math.random()*9),(Math.random()-.5)*12,-2-Math.random()*10);r.position.copy(r.userData.base);r.scale.set(.1+Math.random()*.35,.1+Math.random()*.2,.1+Math.random()*.25);r.rotation.set(i,i*.6,i*.3);shapes.push(r);}rockGeo.dispose();rockMat.dispose();
  const stars=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.012,0),luminous(0xa2d5ff,.65),250),dummy=new THREE.Object3D();for(let i=0;i<250;i++){dummy.position.set((Math.random()-.5)*44,(Math.random()-.5)*28,-3-Math.random()*12);dummy.scale.setScalar(.5+Math.random());dummy.updateMatrix();stars.setMatrixAt(i,dummy.matrix);}scene.add(stars);
  const scenePass=pass(scene,camera);scenePass.setMRT(mrt({output,emissive:vec4(emissive,output.a)}));
  const sceneColor=scenePass.getTextureNode('output'),emission=scenePass.getTextureNode('emissive');
  // One scene pass includes BOTH scenery and rocks; lens displacement therefore
  // bends the complete rendered world, while DOM text remains legible.
  const coord=uv(),delta=coord.sub(shockCenter).mul(vec2(screenAspect,1)),distance=length(delta),radius=shockAge.mul(.35);
  const wave=sin(distance.mul(80).sub(shockAge.mul(35))).mul(exp(distance.sub(radius).pow(2).mul(-220))).mul(float(1).sub(shockAge).max(0)).mul(shockPower).mul(.012);
  const offset=normalize(delta.add(vec2(.00001))).mul(wave).div(vec2(screenAspect,1));
  const bent=sceneColor.sample(coord.add(offset));pipeline=new THREE.RenderPipeline(renderer);pipeline.outputNode=bent.add(bloom(emission.sample(coord.add(offset)),.55,.35,.25));
  layout();const backend=renderer.backend.isWebGPUBackend?'WebGPU':'WebGL 2 回退';$('renderer-status').textContent=`${backend} · Three.js r${THREE.REVISION} · TSL + RenderPipeline`;
  document.documentElement.dataset.backend=renderer.backend.isWebGPUBackend?'webgpu':'webgl2';
  ready=true;document.documentElement.dataset.sample='ready';renderer.setAnimationLoop(frame);demo('arrival');
}
function frame(now){
  if(disposed)return;const dt=Math.min(.05,(now-last)/1000||.016);last=now;if(document.hidden)return;age+=dt;
  look.x+=(look.tx-look.x)*dt*3;look.y+=(look.ty-look.y)*dt*3;
  const shift=reduced?0:1;camera.position.x=look.x*.06*shift;camera.position.y=-look.y*.04*shift;camera.lookAt(0,0,0);background.position.x=look.x*.06*shift;
  for(const rock of shapes){rock.position.x=rock.userData.base.x-look.x*.14*shift;rock.rotation.y+=dt*.025*shift;}
  for(const [s,sgn] of [[hero,-1],[enemy,1]]){
    s.position.copy(s.userData.base);s.scale.setScalar(s.userData.width);s.rotation.set(0,0,0);s.position.y+=reduced?0:Math.sin(age*.65+sgn)*.026;s.position.x+=Math.max(0,1-(age-s.userData.kick)/.2)*sgn*.045;
    if(s.userData.model)s.userData.model.rotation.set(.28,sgn===1?-.16:.14,sgn*.04);
    s.userData.flames.forEach(f=>{f.scale.x=1+(reduced?0:Math.sin(age*20)*.04)+Math.max(0,1-(age-s.userData.kick)/.4)*.8;});
  }
  const mt=age-modeStart;
  if(mode==='arrival'){const x=reduced?0:Math.max(0,1-mt/1.9)**3;hero.position.x-=x*10;enemy.position.x+=x*10;hero.rotation.z=x*.24;enemy.rotation.z=-x*.18;if(mt>2){mode='idle';notice('星海静默，等待你的指令。');}}
  if(mode==='fall'){enemy.rotation.z=-Math.min(mt,3)*.18;enemy.position.y-=mt*mt*.2;enemy.position.z-=mt*.7;enemy.scale.multiplyScalar(Math.max(.15,1-mt*.14));if(mt>6)enemy.visible=false;}
  if(inspect&&loadedModel&&!portraitOnly){enemy.visible=false;hero.position.copy(hero.userData.base).lerp(enemy.userData.base,.5);hero.position.z=1.3;hero.scale.setScalar(Math.min(w/h*5.6,7));loadedModel.rotation.set(.3,reduced?.6:age*.22,.05);}else{enemy.visible=mode==='fall'?mt<=6:true;}
  const due=pending.filter(e=>e.at<=age);pending=pending.filter(e=>e.at>age);for(const e of due)e.run();
  effects=effects.filter(e=>{const t=(age-e.start)/e.life;if(t>=1){e.object.removeFromParent();disposeObject(e.object);return false;}e.update(t);return true;});
  shockAge.value+=dt;flash.intensity*=Math.exp(-dt*12);lightning();
  try{pipeline.render();}catch(error){renderer.setAnimationLoop(null);$('renderer-status').textContent='渲染失败，请使用 WebGL 2 回退测试链接。';console.error(error);return;}
  frames++;if(now-statTime>2000){$('render-stats').textContent=`${Math.round(frames*1000/(now-statTime||1))} FPS · 当前窗口`;frames=0;statTime=now;}
}
function attachModel(ship,source,isHero){
  const box=new THREE.Box3().setFromObject(source),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),longest=Math.max(size.x,size.y,size.z);if(!Number.isFinite(longest)||longest<=0)throw Error('模型没有可显示的网格');
  source.traverse(o=>{if(!o.isMesh)return;const original=o.material;const materials=Array.isArray(original)?original:[original];const enhanced=materials.map(m=>{const n=new THREE.MeshStandardNodeMaterial({map:m.map,normalMap:m.normalMap,roughnessMap:m.roughnessMap,metalnessMap:m.metalnessMap,roughness:.45,metalness:.28,color:0xffffff});if(m.map){const t=texture(m.map),mask=isHero?t.b.sub(t.r).sub(.2).max(0):t.b.sub(t.g).sub(.2).max(0);n.emissiveNode=t.rgb.mul(mask).mul(1.4);}m.dispose();return n;});o.material=Array.isArray(original)?enhanced:enhanced[0];});
  const container=new THREE.Group();source.position.sub(center);container.add(source);container.scale.setScalar(1/longest);const model=new THREE.Group();model.add(container);ship.add(model);ship.userData.portrait.visible=false;ship.userData.flames.forEach(f=>f.visible=false);ship.userData.model=model;return model;
}
$('portrait-compare').onclick=()=>{window.scrollTo(0,0);layout();portraitOnly=!portraitOnly;inspect=false;ships.forEach(s=>{s.userData.portrait.visible=portraitOnly;if(s.userData.model)s.userData.model.visible=!portraitOnly;s.userData.flames.forEach(f=>f.visible=portraitOnly);});$('portrait-compare').textContent=portraitOnly?'返回真实 3D':'对比 2.5D 原图';$('inspect-model').disabled=$('side-light').disabled=portraitOnly;notice(portraitOnly?'对照模式 · 原始透明图片':'立体模式 · 真实几何与灯光');};
$('model-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;if(file.size>150*1024*1024){$('model-status').textContent='请先导出小于 150 MB 的样板 GLB。';return;}
  $('model-status').textContent='正在加载本机模型…';
  try{
    const data=await file.arrayBuffer(),manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(/^(blob:|data:)/.test(url))return url;throw Error('需要贴图已嵌入的 GLB');});
    const gltf=await new GLTFLoader(manager).parseAsync(data,'');if(disposed){disposeObject(gltf.scene);return;}if(loadedModel){loadedModel.removeFromParent();disposeObject(loadedModel);}
    loadedModel=attachModel(hero,gltf.scene,true);portraitOnly=false;enemy.userData.portrait.visible=false;enemy.userData.model.visible=true;$('portrait-compare').textContent='对比 2.5D 原图';
    if(!scene.environment){const env=await new HDRLoader().loadAsync('./assets/studio-light.hdr');env.mapping=THREE.EquirectangularReflectionMapping;scene.environment=env;scene.environmentIntensity=.8;}
    $('inspect-model').disabled=$('side-light').disabled=false;$('model-status').textContent=`已加载 ${file.name} · 可转向和侧光 · 装甲预切破损尚未制作`;notice('立体飞船已接入。点击「近看 / 转向」检查侧面与背面。');
  }catch(err){$('model-status').textContent=`导入失败：${err.message}`;console.warn('GLB import:',err.message);}
});
$('quick-inspect').onclick=$('inspect-model').onclick=()=>{if(!loadedModel||portraitOnly){notice('先切回真实 3D 模式。');return;}window.scrollTo(0,0);layout();inspect=!inspect;mode='idle';$('quick-inspect').textContent=inspect?'返回对战':'近看飞船';notice(inspect?'近距巡检 · 观察侧面、背面和受光':'返回战术视角');};
let warm=false;$('side-light').onclick=()=>{window.scrollTo(0,0);layout();warm=!warm;key.color.set(warm?0xffb46c:0xcce9ff);key.position.set(warm?5:-4,warm?1:7,warm?1:6);rim.intensity=warm?.9:1.3;notice(warm?'恒星侧光 · 暖色掠射':'星云侧光 · 冷色轮廓');};
addEventListener('pointermove',e=>{look.tx=e.clientX/innerWidth*2-1;look.ty=e.clientY/innerHeight*2-1;document.documentElement.style.setProperty('--look-x',look.tx.toFixed(3));});
addEventListener('resize',layout);addEventListener('scroll',()=>{if(ready)layout();},{passive:true});
addEventListener('pagehide',()=>{disposed=true;renderer?.setAnimationLoop(null);audio.dispose();clearEffects();if(scene){disposeObject(scene);scene.environment?.dispose();}pipeline?.dispose();renderer?.dispose();},{once:true});
init().catch(error=>{$('renderer-status').textContent='初始化失败，可点击 WebGL 2 回退测试。';notice('渲染器未能启动，背景与布局仍可查看。');console.error(error);});

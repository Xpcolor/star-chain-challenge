import * as THREE from 'three';
import {VISUAL_THEME as THEME} from './visual-theme.mjs';

/** Actual foreground geometry + a refracting far-field. No gameplay dependencies. */
export function createSpaceScene(host){
  let dead=false, frame=0, last=0, age=0, lensAge=10, lensPower=0, hidden=false;
  let w=1,h=1, reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pointer={x:0,y:0,tx:0,ty:0};
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,THEME.dpr));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.autoClear=false;
  host.append(renderer.domElement);
  const scene=new THREE.Scene(), background=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(48,1,.1,100);camera.position.z=12;
  const quadCamera=new THREE.Camera();
  const uniforms={map:{value:null},resolution:{value:new THREE.Vector2(1,1)},imageAspect:{value:1672/941},look:{value:new THREE.Vector2()},impact:{value:new THREE.Vector2(.7,.5)},wave:{value:0},power:{value:0}};
  const screenMaterial=new THREE.ShaderMaterial({
    uniforms,depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`varying vec2 vUv; uniform sampler2D map; uniform vec2 resolution,look,impact; uniform float imageAspect,wave,power;
    void main(){
      float aspect=resolution.x/resolution.y;
      vec2 uv=vUv; vec2 d=(vUv-impact)*vec2(aspect,1.);float r=length(d);
      float pulse=sin(r*65.-wave*19.)*exp(-abs(r-wave*.5)*22.)*power*(1.-wave);
      uv+=normalize(d+vec2(.0001))*pulse*.009/vec2(aspect,1.);
      vec2 cover=vec2(min(1.,aspect/imageAspect),min(1.,imageAspect/aspect));
      uv=(uv-.5)*cover*.975+.5+look*.007;
      vec3 color=texture2D(map,uv).rgb;
      float vignette=smoothstep(.3,.78,length((vUv-.5)*vec2(.95,1.)));
      color*=1.-vignette*.24;
      color+=vec3(.10,.28,.4)*max(0.,pulse)*.3;
      gl_FragColor=vec4(color,1.);
      #include <colorspace_fragment>
    }`,
  });
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),screenMaterial);background.add(quad);
  let texture=null, loaded=false;
  new THREE.TextureLoader().load('./assets/cosmos-v2.png', tex=>{
    if(dead){tex.dispose();return;}texture=tex;tex.colorSpace=THREE.SRGBColorSpace;uniforms.map.value=tex;loaded=true;start();
  },undefined,()=>{host.dataset.failed='background';});
  scene.add(new THREE.HemisphereLight(0x87bded,0x101526,1.4));
  const key=new THREE.DirectionalLight(0x97ddff,3.8);key.position.set(-6,4,5);
  const rim=new THREE.DirectionalLight(0xac8dff,4);rim.position.set(5,3,-3);
  const flash=new THREE.PointLight(0x7ceaff,0,35,1.5);scene.add(key,rim,flash);
  let seed=21927;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const rocks=[];
  for(let i=0;i<THEME.rocks;i++){
    const geo=new THREE.IcosahedronGeometry(1,1), pos=geo.attributes.position;
    for(let j=0;j<pos.count;j++){
      const x=pos.getX(j),y=pos.getY(j),z=pos.getZ(j);
      const rough=1+.14*Math.sin(x*18+y*12+z*14+i);
      pos.setXYZ(j,x*rough,y*rough*.72,z*rough*.85);
    }
    geo.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({color:i%3?0x303c50:0x59657a,roughness:.89,metalness:.23,flatShading:true});
    const rock=new THREE.Mesh(geo,material);
    // Edges and gaps between instruments; central duel and rail labels stay open.
    const nx=i<12?(i%2?.965:.035):(.22+random()*.56);
    const ny=i<12?.12+random()*.72:(i%2?.16:.78);
    const z=i<8?3.2: -2-random()*8;
    const scale=(i<8?.16:.07)+random()*.1;
    rock.scale.setScalar(scale);rock.rotation.set(random()*3,random()*3,random()*3);
    rock.userData={nx,ny,z,spin:(random()-.5)*.08,phase:random()*6};
    rocks.push(rock);scene.add(rock);
  }
  const starGeo=new THREE.BufferGeometry(), starPos=new Float32Array(THEME.stars*3);
  for(let i=0;i<THEME.stars;i++){starPos[i*3]=(random()-.5)*60;starPos[i*3+1]=(random()-.5)*30;starPos[i*3+2]=-8-random()*25;}
  starGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));
  const starMaterial=new THREE.PointsMaterial({color:0xa4dfff,size:.027,transparent:true,opacity:.58,depthWrite:false});
  const stars=new THREE.Points(starGeo,starMaterial);scene.add(stars);
  function resize(){
    w=innerWidth;h=innerHeight;renderer.setSize(w,h,false);uniforms.resolution.value.set(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
    for(const rock of rocks){const d=rock.userData;const height=2*Math.tan(48*Math.PI/360)*(12-d.z);rock.position.set((d.nx-.5)*height*w/h,(.5-d.ny)*height,d.z);d.x=rock.position.x;d.y=rock.position.y;}
  }
  function render(now){
    frame=0;if(dead||hidden)return;
    const dt=Math.min(.05,(now-last)/1000||.016);last=now;age+=reduced?0:dt;lensAge+=dt;
    pointer.x+=(pointer.tx-pointer.x)*Math.min(1,dt*6);pointer.y+=(pointer.ty-pointer.y)*Math.min(1,dt*6);
    const px=reduced?0:pointer.x,py=reduced?0:pointer.y;
    uniforms.look.value.set(px,-py);uniforms.wave.value=Math.min(1,lensAge/.58);uniforms.power.value=reduced?0:lensPower;
    camera.position.x=px*.21;camera.position.y=-py*.13;camera.lookAt(0,0,0);
    for(const rock of rocks){const d=rock.userData;rock.position.y=d.y+Math.sin(age*.23+d.phase)*.09;rock.rotation.y+=reduced?0:d.spin*dt;rock.rotation.z+=reduced?0:d.spin*dt*.4;}
    stars.rotation.z=Math.sin(age*.015)*.006;
    flash.intensity=Math.max(0,1-lensAge/.45)*lensPower*18;
    renderer.clear();if(loaded)renderer.render(background,quadCamera);renderer.clearDepth();renderer.render(scene,camera);
    if(loaded)document.documentElement.dataset.spaceRenderer='ready';
    host.dataset.motion=reduced?'reduced':'active';
    if(!reduced||lensAge<1)frame=requestAnimationFrame(render);
  }
  function start(){if(!dead&&!hidden&&!frame){last=performance.now();frame=requestAnimationFrame(render);}}
  function onLost(e){e.preventDefault();hidden=true;if(frame)cancelAnimationFrame(frame);frame=0;document.documentElement.dataset.spaceRenderer='fallback';}
  function onRestored(){hidden=false;resize();start();}
  renderer.domElement.addEventListener('webglcontextlost',onLost);
  renderer.domElement.addEventListener('webglcontextrestored',onRestored);
  const observer=new ResizeObserver(()=>{resize();start();});observer.observe(host);
  resize();start();
  return{
    look(x,y){pointer.tx=x;pointer.ty=y;},
    impact(x,y,power=1){if(reduced)return;uniforms.impact.value.set(x/w,1-y/h);lensAge=0;lensPower=Math.min(2,power);flash.position.set((x/w-.5)*12,(.5-y/h)*8,2);start();},
    reduced(value){reduced=value;start();},
    pause(value){hidden=value;if(value){cancelAnimationFrame(frame);frame=0;}else start();},
    destroy(){dead=true;cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('webglcontextlost',onLost);renderer.domElement.removeEventListener('webglcontextrestored',onRestored);for(const r of rocks){r.geometry.dispose();r.material.dispose();}starGeo.dispose();starMaterial.dispose();quad.geometry.dispose();screenMaterial.dispose();texture?.dispose();renderer.dispose();host.remove();delete document.documentElement.dataset.spaceRenderer;},
  };
}

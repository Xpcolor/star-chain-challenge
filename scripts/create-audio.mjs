// Original procedural sci-fi sound design: reproducible PCM, no external samples/licenses.
import {writeFile,mkdir} from 'node:fs/promises';
const rate=22050,TAU=Math.PI*2;
const entries=[['arrival','跃迁飞入',2.2],['laser','脉冲激光',.48],['cannon','重炮发射',.8],['impact','舰体命中',.6],['shield','护盾涟漪',.85],['repair','维修回复',1.1],['victory','胜利信号',2.4],['defeat','战败警报',1.7],['collapse','失控陨落',2.8],['select','选牌反馈',.085],['confirm','指令确认',.18]];
await mkdir('dist/assets',{recursive:true});
for(const [id,name,duration] of entries){
  const size=Math.ceil(rate*duration),data=new Float64Array(size);let seed=8317,low=0,phase=0;
  for(let i=0;i<size;i++){
    const t=i/rate,u=t/duration;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;low=.91*low+.09*noise;
    const attack=Math.min(1,t/.014),tail=Math.pow(1-u,2);let v=0;
    if(id==='laser'){phase+=TAU*(1900*Math.exp(-t*10)+100)/rate;v=(Math.sin(phase)*.48+noise*.1)*Math.exp(-t*9);}
    if(id==='cannon'){phase+=TAU*(160*Math.exp(-t*7)+35)/rate;v=(Math.sin(phase)*.55+noise*.22+low*2)*Math.exp(-t*5);}
    if(id==='impact'){v=(noise*.5+low*2.8+Math.sin(TAU*63*t)*.3)*Math.exp(-t*9);}
    if(id==='shield'){phase+=TAU*(580-360*u)/rate;v=(Math.sin(phase)+Math.sin(phase*1.498)*.5)*.29*(.5+.5*Math.sin(TAU*18*t))*tail;}
    if(id==='arrival'){phase+=TAU*(45+u*u*360)/rate;const swell=Math.sin(Math.PI*u)**1.2;v=(low*3+noise*.065+Math.sin(phase)*.24)*swell;}
    if(id==='collapse'){const pulse=(Math.sin(t*27)> .8?1:.12);v=(low*3.2+noise*.2*pulse+Math.sin(TAU*(50*t-5*t*t))*.23)*Math.pow(1-u,.8);}
    if(['repair','victory','defeat'].includes(id)){
      const notes=id==='repair'?[523.25,659.25,783.99,1046.5]:id==='victory'?[261.63,329.63,392,523.25,659.25,783.99]:[440,349.23,293.66,220];
      const step=duration/(notes.length+1);
      notes.forEach((f,k)=>{const dt=t-k*step;if(dt>=0){const e=Math.min(1,dt/.018)*Math.exp(-dt*(id==='defeat'?4:3));v+=(Math.sin(TAU*f*dt)+.18*Math.sin(TAU*f*2*dt))*.17*e;}});
      if(id==='defeat')v+=Math.sin(TAU*55*t)*.08*tail;
    }
    if(id==='select')v=Math.sin(TAU*980*t)*Math.exp(-t*70)*.22;
    if(id==='confirm')v=(Math.sin(TAU*660*t)+Math.sin(TAU*990*t)*.4)*Math.exp(-t*23)*.23;
    // Early reflections soften digital tones without a runtime reverb dependency.
    const delayed=i-Math.floor(.065*rate);data[i]=v*attack*tail+(delayed>0?data[delayed]*.17:0);
  }
  const peak=Math.max(...data.map(Math.abs));const out=Buffer.alloc(44+size*2);
  out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(size*2,40);
  for(let i=0;i<size;i++)out.writeInt16LE(Math.round(data[i]/Math.max(peak,1)*.78*32767),44+i*2);
  await writeFile(`dist/assets/audio-${id}.wav`,out);
}
console.log(`Generated ${entries.length} original mono PCM effects at ${rate}Hz.`);

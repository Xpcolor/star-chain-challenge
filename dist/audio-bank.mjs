/** Audio is a disposable consumer of settled events, never a game clock. */
export const AUDIO_BANK=Object.freeze([
  ['arrival','跃迁飞入',2.2],['laser','脉冲激光',.48],['cannon','重炮发射',.8],['impact','舰体命中',.6],['shield','护盾涟漪',.85],['repair','维修回复',1.1],['victory','胜利信号',2.4],['defeat','战败警报',1.7],['collapse','失控陨落',2.8],['select','选牌反馈',.085],['confirm','指令确认',.18]
].map(([id,name,duration])=>Object.freeze({id,name,duration,src:`./assets/audio-${id}.wav`})));
export function createAudioBus({enabled=true,volume=.35}={}) {
  let context=null,gain=null,disposed=false,unlocked=false,generation=0;const buffers=new Map(),pending=new Map(),voices=new Set();
  const load=async entry=>{
    if(buffers.has(entry.id))return buffers.get(entry.id);
    if(!pending.has(entry.id))pending.set(entry.id,(async()=>{const r=await fetch(new URL(entry.src,import.meta.url));if(!r.ok)throw Error('audio unavailable');const b=await context.decodeAudioData(await r.arrayBuffer());if(!disposed)buffers.set(entry.id,b);return b;})().finally(()=>pending.delete(entry.id)));
    return pending.get(entry.id);
  };
  const stop=()=>{generation++;for(const source of voices){try{source.stop();}catch{}source.disconnect();}voices.clear();};
  return {
    get enabled(){return enabled;},get volume(){return volume;},
    async unlock(){
      if(disposed)return false;
      const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AudioContext)return false;
      try{if(!context){context=new AudioContext();gain=context.createGain();gain.gain.value=enabled?volume:0;gain.connect(context.destination);}await context.resume();unlocked=context.state==='running';return unlocked;}catch{return false;}
    },
    async play(id){
      const entry=AUDIO_BANK.find(e=>e.id===id);if(!entry||disposed||!enabled||!unlocked||context?.state!=='running')return false;
      try{const token=generation,b=await load(entry);if(token!==generation||disposed||!enabled||!unlocked)return false;while(voices.size>=8){const first=voices.values().next().value;first.stop();voices.delete(first);}const source=context.createBufferSource();source.buffer=b;source.connect(gain);voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();};source.start();return true;}catch{return false;}
    },
    setEnabled(value){enabled=!!value;if(gain)gain.gain.setTargetAtTime(enabled?volume:0,context.currentTime,.02);if(!enabled)stop();},
    setVolume(value){volume=Math.max(0,Math.min(1,Number(value)||0));if(gain)gain.gain.setTargetAtTime(enabled?volume:0,context.currentTime,.02);},
    stop,
    dispose(){if(disposed)return;disposed=true;stop();buffers.clear();pending.clear();context?.close().catch(()=>{});}
  };
}

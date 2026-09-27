import {createGame,rulesForLevel,selectModule,rollInitiative,legalMoves,observation,playAndClaim,rest,takeCard} from '../dist/engine.mjs';
import {BOT_PROFILES,LEVEL_COUNT,CONFIG_ID} from '../dist/difficulty.mjs';
import {makeRecord,appendEvent,closeRecord,publicSnapshot} from '../dist/records.mjs';

export function fixture({seed=48,actual=LEVEL_COUNT-1,selected=LEVEL_COUNT-1,epoch=0,winner=1,now=Date.now(),id=crypto.randomUUID()}={}){
  const options={...rulesForLevel(selected),seed,level:actual,botProfile:BOT_PROFILES[actual]},g=createGame(options);
  const record=makeRecord(options,{actualLevel:actual,selectedLevel:selected,supportEpoch:epoch,supportEnabled:true,configId:CONFIG_ID},now,id);
  record.initial=publicSnapshot(g);
  const event=(type,data)=>appendEvent(record,type,data,now+record.sequence+1);
  selectModule(g,g.moduleOptions[0]);event('module',{id:g.modules[0],modules:[...g.modules]});
  while(g.phase==='opening'){const {pair}=rollInitiative(g);event('dice',{pair});}
  const active=structuredClone(record);
  while(g.phase!=='over'){
    const actor=g.current;
    const moves=legalMoves(observation(g,actor)).sort((a,b)=>Number(b.lethal)-Number(a.lethal)||b.points-a.points);
    if(actor===winner&&moves.length){const move=moves[0].move;playAndClaim(g,move);event('play',{actor,move,after:publicSnapshot(g),settlement:g.lastAction});}
    else{rest(g,[],null);event('rest',{actor,ids:[],goal:null,after:publicSnapshot(g)});}
    while(g.phase==='refill'){const card=takeCard(g,'deck');event('take',{actor,source:'deck',card,market:structuredClone(g.market)});}
  }
  closeRecord(record,g,'finished',now+record.sequence+1);
  if(g.winner!==winner)throw Error(`Fixture did not produce intended winner for seed ${seed}`);
  return {record,g,active};
}

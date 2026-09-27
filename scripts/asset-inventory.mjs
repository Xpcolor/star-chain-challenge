import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const assets=[];
for(const name of (await readdir('dist/assets')).sort())if(/^(detailed-|ship-|audio-|music-|studio-light|cosmos-v2\.png|player-cinematic-v2\.png|enemy-tier-\d+\.png)/.test(name)&&/\.(png|glb|wav|ogg|mp3|hdr)$/.test(name)){
  const data=await readFile(`dist/assets/${name}`);
  assets.push({path:`dist/assets/${name}`,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),kind:name.startsWith('detailed-')?'textured-fractured-model':name.endsWith('.glb')?'prototype-model':/^(enemy-tier|player-cinematic)/.test(name)?'cinematic-portrait':name.startsWith('cosmos-')?'background':name.endsWith('.png')?'prototype-render':/\.(wav|ogg|mp3)$/.test(name)?'audio':'environment',origin:name==='music-relaxing-ambient.ogg'?'Clavier-Music / Relaxing Ambient Music / owner-selected SPGC recording; provenance in 资产库/背景音乐.json':name.startsWith('detailed-')?'User supplied GLB / Blender pre-fracture / fleet-models.json':name.startsWith('studio-')?'Poly Haven / Greg Zaal / CC0':/^(cosmos|enemy-tier|player-cinematic)/.test(name)?'Built-in ImageGen / StarChain reference-led artwork':'StarChain generated source'});
}
await mkdir('资产库',{recursive:true});
await writeFile('资产库/inventory.json',JSON.stringify({schemaVersion:3,coordinateSystem:'GLB: +X nose, +Y up, X length 6. Detailed GLB: intact hull and six capped debris nodes, original textures embedded. Cinematic PNG: 1536x1024; pixel bounds and mounts in dist/fleet.mjs; logical nose +X before enemy scene rotation.',assets},null,2)+'\n');
console.log(`${assets.length} assets, ${(assets.reduce((s,a)=>s+a.bytes,0)/1e6).toFixed(2)} MB total; game loads only current pair.`);

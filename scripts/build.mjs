import {build} from 'esbuild';
import {mkdir,cp,rm,readdir,writeFile,access} from 'node:fs/promises';
await rm('dist/client',{recursive:true,force:true});await rm('dist/server',{recursive:true,force:true});
await mkdir('dist/client',{recursive:true});await mkdir('dist/server',{recursive:true});
for(const item of await readdir('dist',{withFileTypes:true}))if(item.name==='assets'||item.isFile())await cp(`dist/${item.name}`,`dist/client/${item.name}`,{recursive:true});
await build({entryPoints:['server/worker.mjs'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022'});
await writeFile('dist/server/wrangler.json',JSON.stringify({name:'star-chain-challenge',main:'index.js',compatibility_date:'2026-09-01',assets:{directory:'../client',binding:'ASSETS',run_worker_first:['/api/*']},d1_databases:[{binding:'DB',database_name:'star-chain-db',database_id:'00000000-0000-0000-0000-000000000000'}]},null,2)+'\n');
await rm('dist/.openai',{recursive:true,force:true});
try { await access('.openai/hosting.json'); await mkdir('dist/.openai',{recursive:true});await cp('.openai/hosting.json','dist/.openai/hosting.json');await cp('drizzle','dist/.openai/drizzle',{recursive:true}); } catch(error) { if(error.code!=='ENOENT')throw error; }
console.log('Built game assets and authenticated records API.');

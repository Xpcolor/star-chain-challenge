import {build} from 'esbuild';
import {mkdir,cp,rm,readdir,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const pkg=JSON.parse(await readFile('package.json','utf8'));
let commit=process.env.GIT_COMMIT;try{commit||=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{commit='local';}
const release={version:pkg.version,commit,environment:process.env.DEPLOY_ENV||'development',pr:process.env.PR_NUMBER||null};
await rm('dist/client',{recursive:true,force:true});await rm('dist/server',{recursive:true,force:true});
await mkdir('dist/client',{recursive:true});await mkdir('dist/server',{recursive:true});
for(const item of await readdir('dist',{withFileTypes:true}))if(item.name==='assets'||item.isFile())await cp(`dist/${item.name}`,`dist/client/${item.name}`,{recursive:true});
await build({entryPoints:['server/worker.mjs'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022'});
await writeFile('dist/client/version.mjs',`export const RELEASE=Object.freeze(${JSON.stringify(release)});\n`);
await writeFile('dist/client/_headers','/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  Cache-Control: no-cache\n');
await rm('dist/.openai',{recursive:true,force:true});
console.log('Built game assets and authenticated records API.');

// Trusted deployment controller. Never execute a PR's scripts with credentials.
import {readFile,writeFile,mkdir,readdir,lstat,cp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=process.cwd(),pr=process.env.PR_NUMBER||'',sha=process.env.GIT_COMMIT;
if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('GIT_COMMIT must be the exact verified commit');
if(pr&&!/^[1-9][0-9]{0,6}$/.test(pr))throw Error('Invalid PR number');
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const productionId=config.d1_databases[0].database_id;
const cli=(args)=>execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{encoding:'utf8',stdio:['ignore','pipe','inherit'],env:process.env});
const name=pr?`star-chain-pr-${pr}`:'star-chain-challenge';
let database=config.d1_databases[0];
if(pr){
  const list=()=>JSON.parse(cli(['d1','list','--json']));
  let found=list().find(d=>d.name===name);
  if(process.argv.includes('--cleanup')){
    if(found&&found.uuid!==productionId){console.log(cli(['delete','--name',name,'--force']));console.log(cli(['d1','delete',name,'--skip-confirmation']));}
    process.exit(0);
  }
  if(!found){console.log(cli(['d1','create',name]));found=list().find(d=>d.name===name);}
  if(!found||found.uuid===productionId)throw Error('Preview must use an independent D1 database');
  database={binding:'DB',database_name:name,database_id:found.uuid,migrations_dir:resolve('drizzle')};
}
if(process.env.DEPLOY_ARTIFACT){
  const base=resolve(process.env.DEPLOY_ARTIFACT);
  async function check(dir){for(const entry of await readdir(dir)){const path=resolve(dir,entry),s=await lstat(path);if(s.isSymbolicLink())throw Error('Artifact symlinks forbidden');if(s.isDirectory())await check(path);}}
  await check(base);
  // Only files needed by the deployment; no package scripts or config from PRs.
  await cp(resolve(base,'client'),resolve('dist/client'),{recursive:true});
  await mkdir('dist/server',{recursive:true});await cp(resolve(base,'server/index.js'),resolve('dist/server/index.js'));
  if(pr){
    const migrations=resolve('.deployment/migrations');await mkdir(migrations,{recursive:true});
    for(const f of await readdir(resolve(base,'migrations')))if(/^\d{4}_[a-zA-Z0-9_-]+\.sql$/.test(f))await cp(resolve(base,'migrations',f),resolve(migrations,f));
    database.migrations_dir=migrations;
  }
}
const release={version:config.vars.RELEASE_VERSION,commit:sha,environment:pr?'preview':'production',pr:pr||null};
await writeFile('dist/client/version.mjs',`export const RELEASE=Object.freeze(${JSON.stringify(release)});\n`);
Object.assign(config,{name,main:resolve('dist/server/index.js'),build:undefined,assets:{...config.assets,directory:resolve('dist/client')},d1_databases:[{...database,migrations_dir:resolve(database.migrations_dir||'drizzle')}],vars:{...config.vars,ENVIRONMENT:release.environment,GIT_COMMIT:sha,PR_NUMBER:pr}});
if(pr){
  if(process.env.PREVIEW_ACCESS_AUD){
    config.vars.ACCESS_AUD=process.env.PREVIEW_ACCESS_AUD;
    if(process.env.PREVIEW_ACCESS_ISSUER)config.vars.ACCESS_ISSUER=process.env.PREVIEW_ACCESS_ISSUER;
  }else{
    delete config.vars.ACCESS_AUD;
    delete config.vars.ACCESS_ISSUER;
  }
}
if(!config.vars.ACCESS_ISSUER||!config.vars.ACCESS_AUD)console.warn('Access configuration pending: record API remains locked.');
await mkdir('.deployment',{recursive:true});await writeFile('.deployment/wrangler.json',JSON.stringify(config,null,2));
console.log(cli(['d1','migrations','apply',database.database_name,'--remote','--config','.deployment/wrangler.json']));
const result=cli(['deploy','--no-bundle','--config','.deployment/wrangler.json']);console.log(result);
const url=result.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/)?.[0];
if(!url)throw Error('Deployment returned no workers.dev URL');
await writeFile('.deployment/result.json',JSON.stringify({url,...release,databaseId:database.database_id},null,2));
if(process.env.GITHUB_OUTPUT)await import('node:fs/promises').then(fs=>fs.appendFile(process.env.GITHUB_OUTPUT,`url=${url}\n`));

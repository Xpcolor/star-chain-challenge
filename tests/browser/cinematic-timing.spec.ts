import { test, expect, type Page } from '@playwright/test';

async function dispatch(page:Page,action:string,data={}) {
 return page.evaluate(({action,data})=>{const c=window.starChainClient!,s=c.getSnapshot()!;return c.dispatch({protocol:1,id:crypto.randomUUID(),matchId:s.matchId,action:action as any,data});},{action,data});
}
async function isolated(page:Page) {
 await page.addInitScript(()=>localStorage.setItem('star-chain-demo-v1',JSON.stringify({version:6,unlocked:15,matches:0})));
 await page.route('**/api/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{"error":"isolated animation test"}'}));
}
async function ready(page:Page) {
 await page.goto('/');await page.waitForFunction(()=>document.documentElement.dataset.battle==='ready');
 await expect(page.locator('[data-action=module]').first()).toBeVisible();
}

test('cold loading and same/different level arrival keep all opening panels hidden for two rendered seconds',async({page})=>{
 await isolated(page);
 await page.route('**/*.glb?*',async r=>{await new Promise(resolve=>setTimeout(resolve,700));await r.continue();});
 await page.goto('/');
 await page.waitForFunction(()=>!!window.starChainClient?.getSnapshot());
 await expect(page.locator('.opening-overlay')).toHaveCount(0);
 await page.waitForFunction(()=>document.documentElement.dataset.battle==='ready');
 const inspect=async()=>page.evaluate(()=>{const s=window.starChainBridge!.battleView as any;return{age:s.age-s.arrival,panels:document.querySelectorAll('.opening-overlay,dialog[open]').length,offset:s.ships[0].root.position.x-s.ships[0].base.x}});
 expect((await inspect()).panels).toBe(0);
 await expect(page.locator('[data-action=module]').first()).toBeVisible();expect((await inspect()).age).toBeGreaterThanOrEqual(1.95);
 for(const level of [0,7]){
  expect((await dispatch(page,'confirm-new',{level})).ok).toBe(true);
  await page.waitForTimeout(500);expect((await inspect()).panels).toBe(0);
  await expect(page.locator('[data-action=module]').first()).toBeVisible();
  const result=await inspect();expect(result.age).toBeGreaterThanOrEqual(1.95);expect(Math.abs(result.offset)).toBeLessThan(.08);
 }
});

test('player inspection cannot override entrance or the zero-HP fall',async({page})=>{
 await isolated(page);await ready(page);
 // Enable the real inspection preference using the visible control.
 await page.getByRole('button',{name:'近看飞船',exact:true}).click();
 await page.evaluate(()=>scrollTo(0,0));
 await dispatch(page,'confirm-new',{level:0});await page.waitForTimeout(350);
 const arrival=await page.evaluate(()=>{const s=window.starChainBridge!.battleView as any;return s.ships[0].root.position.x-s.ships[0].base.x;});
 expect(arrival).toBeLessThan(-1);
 await page.screenshot({path:'.local/qa/cinematic-arrival.png'});
 await expect(page.locator('[data-action=module]').first()).toBeVisible();
 await page.getByRole('button',{name:'近看飞船',exact:true}).click();
 await page.evaluate(()=>scrollTo(0,0));
 // Exercise the actual render/fall path without changing rule state or saved records.
 const start=await page.evaluate(()=>{const s=window.starChainBridge!.battleView as any;s.collapse(0);return s.ships[0].base.y;});
 await page.waitForTimeout(1250);
 const fall=await page.evaluate(()=>{const s=window.starChainBridge!.battleView as any;return{y:s.ships[0].root.position.y,t:s.age-s.ships[0].fall,fragments:s.ships[0].fragments.filter((p:any)=>p.visible).length};});
 expect(fall.fragments).toBeGreaterThan(0);expect(fall.y).toBeLessThan(start-.2);
 await page.screenshot({path:'.local/qa/cinematic-inspection-fall.png'});
});

test('four-hit fatal volley finishes its impacts before collapse and terminal readiness waits two seconds',async({page})=>{
 await isolated(page);await ready(page);
 await page.evaluate(()=>{
  const s=window.starChainBridge!.battleView as any,w=window as any;w.cinematic=[];
  for(const method of ['shock','collapse']){const original=s[method];s[method]=function(...args:any[]){w.cinematic.push({method,t:performance.now()});return original.apply(this,args);};}
  document.addEventListener('starchain:terminal-ready',()=>w.cinematic.push({method:'ready',t:performance.now()}),{once:true});
  const event={epoch:s.epoch,seq:900,actor:0,damage:7,rawDamage:7,healing:0,blocked:0,claimed:['a','b','c','d'],chain:0};
  s.sync({...s.state,hp:[18,0],phase:'over',outcome:'player',event});
 });
 await page.waitForFunction(()=>(window as any).cinematic.some((e:any)=>e.method==='ready'));
 const log=await page.evaluate(()=>(window as any).cinematic) as {method:string;t:number}[];
 const fall=log.find(e=>e.method==='collapse')!,readyEvent=log.find(e=>e.method==='ready')!;
 expect(log.filter(e=>e.method==='shock'&&e.t<fall.t)).toHaveLength(4);
 expect(readyEvent.t-fall.t).toBeGreaterThanOrEqual(1950);
});

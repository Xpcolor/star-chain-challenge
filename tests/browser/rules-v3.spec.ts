import {test,expect,type Page} from '@playwright/test';
import {createGame,selectModule,rollInitiative,legalMoves,includeCalibrate} from '../../dist/engine.mjs';
const state=(p:Page)=>p.evaluate(()=>window.starChainClient!.getSnapshot()!) as Promise<any>;
const act=(p:Page,action:string,data={})=>p.evaluate(async({action,data})=>{
 const c=window.starChainClient!,s=c.getSnapshot()!;
 return c.dispatch({protocol:1,id:crypto.randomUUID(),matchId:s.matchId,action:action as any,data});
},{action,data});
function seedFor(kind:string,previousChallenges:string[]){
 const base=Date.now();for(let i=0;i<20000;i++){
  const now=base+i,g=createGame({seed:now>>>0,level:7,choices:true,previousChallenges});selectModule(g,g.moduleOptions[0]);while(g.phase==='opening')rollInitiative(g);
  if(g.first!==0)continue;const types=g.hands[0].map((c:any)=>c.type);
  if(kind==='warp'?types.includes('A')&&types.includes('J')&&types.filter((x:string)=>x==='N').length>=2:types.includes('B')&&g.market.some((c:any)=>c.type==='D'))return now;
 }throw Error('Seed not found');
}
async function boot(p:Page,kind:string){
 await p.addInitScript(()=>{
  localStorage.setItem('star-chain-demo-v1',JSON.stringify({version:6,unlocked:15,matches:0}));
 });
 // This test's storage and API are isolated from the user's profile.
 await p.route('**/api/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{"error":"isolated visual test"}'}));
 await p.goto('/');await p.waitForFunction(()=>document.documentElement.dataset.battle==='ready');
 const now=seedFor(kind,(await state(p)).game.challenge_ids);
 // Fix only the new-match seed call. Freezing Math.random during renderer creation
 // creates duplicate Three UUIDs; freezing Date.now stops the HP odometer ticker.
 const receipt=await p.evaluate(async now=>{
  const realNow=Date.now,realRandom=Math.random,c=window.starChainClient!,s=c.getSnapshot()!;
  Date.now=()=>now;Math.random=()=>{Date.now=realNow;Math.random=realRandom;return 0;};
  try{return await c.dispatch({protocol:1,id:crypto.randomUUID(),matchId:s.matchId,action:'confirm-new',data:{level:7}});}
  finally{Date.now=realNow;Math.random=realRandom;}
 },now);
 expect(receipt.ok).toBe(true);
 await p.waitForFunction(()=>document.documentElement.dataset.modelLevel==='8');
 return now;
}
async function enter(p:Page){
 await expect(p.locator('[data-action=module]').first()).toBeVisible();await p.locator('[data-action=module]').first().click();
 await p.locator('[data-action=roll]').click();await expect(p.locator('[data-action=sector]').first()).toBeEnabled();await p.locator('[data-action=sector]').first().click();
}
test('arrival has a clear two seconds; A order badges, three warp landings and confirmed charging',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await boot(page,'warp');
 await page.waitForTimeout(450);expect((await state(page)).game.arrival_pending).toBe(true);await expect(page.locator('.opening-overlay')).toHaveCount(0);
 await enter(page);const g=(await state(page)).game;
 expect(g.hp).toEqual([24,24]);expect(g.goals).toHaveLength(4);expect(g.repairs[0]).toHaveLength(4);
 const a=g.hand.find((c:any)=>c.type==='A'),nums=g.hand.filter((c:any)=>c.type==='N').slice(0,2),j=g.hand.find((c:any)=>c.type==='J');
 for(const c of [a,...nums])await page.locator(`#cards [data-id="${c.id}"]`).click();
 await expect(page.locator('#cards .card-order')).toHaveText(['1','2']);
 expect(await page.locator('#cards .selected').first().evaluate(e=>getComputedStyle(e,'::after').content)).toBe('none');
 expect(await page.evaluate(()=>(window.starChainBridge!.battleView as any).hud.particles.length)).toBe(0);
 await page.locator(`#cards [data-id="${j.id}"]`).click();await page.locator('[data-action=chain][data-index="0"]').click();
 await expect(page.locator('[data-action=warp-to]')).toHaveText(['落到 15','落到 16','落到 17']);
 await page.locator('[data-action=warp-to][data-value="16"]').click();
 await expect(page.locator('#cards .card-order')).toHaveCount(0);
 await page.locator('[data-action=play]').click();
 expect((await state(page)).game.board[0]).toBe(16);
 expect(await page.evaluate(()=>(window.starChainBridge!.battleView as any).hud.particles.length)).toBeGreaterThan(0);
 await page.waitForTimeout(90);await page.screenshot({path:'.local/qa/v3-confirm-charge.png'});
 expect(errors).toEqual([]);
});
test('B swaps a D into hand and D can be used in this same action; four slots stay readable',async({page})=>{
 await boot(page,'barter');await enter(page);const g=(await state(page)).game;
 const b=g.hand.find((c:any)=>c.type==='B'),give=g.hand.find((c:any)=>c.type==='N'),index=g.market.findIndex((c:any)=>c.type==='D'),taken=g.market[index];
 for(const c of [b,give])await page.locator(`#cards [data-id="${c.id}"]`).click();
 await page.locator(`[data-action=barter-market][data-index="${index}"]`).click();await page.locator('[data-action=transfer]').click();
 const after=(await state(page)).game;expect(after.hp).toEqual(g.hp);expect(after.board).toEqual(g.board);expect(after.phase).toBe('action');expect(after.current_player).toBe('human');expect(after.hand).toHaveLength(5);
 await page.locator(`#cards [data-id="${taken.id}"]`).click();await page.locator('[data-action=chain][data-index="0"]').click();
 await page.locator('[data-action=dock-to][data-value="20"]').click();await page.locator('[data-action=play]').click();expect((await state(page)).game.board[0]).toBe(20);
 await expect.poll(async()=>(await state(page)).game.animation).toBe(false);
 for(const [width,height] of [[1920,1080],[1774,887],[1280,720],[390,844]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(100);
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,panels:Array.from(document.querySelectorAll('.instrument')).map(p=>{
   const r=p.getBoundingClientRect(),entries=Array.from(p.querySelectorAll('article')).map(e=>{const q=e.getBoundingClientRect();return{top:q.top,bottom:q.bottom,overflow:e.scrollHeight>e.clientHeight+2,text:e.textContent,children:Array.from(e.children).map(c=>({height:c.getBoundingClientRect().height,top:c.getBoundingClientRect().top,bottom:c.getBoundingClientRect().bottom}))}});return{height:r.height,entries};
  })}));expect(layout.overflow).toBe(false);expect(Math.abs(layout.panels[0].height-layout.panels[1].height)).toBeLessThan(2);
  if(layout.panels.some(p=>p.entries.some(e=>e.overflow)))console.log(JSON.stringify({width,layout},null,2));
  for(const panel of layout.panels){expect(panel.entries).toHaveLength(4);for(let i=0;i<4;i++){expect(panel.entries[i].overflow,`${width} entry ${i}`).toBe(false);if(i)expect(panel.entries[i].top).toBeGreaterThan(panel.entries[i-1].bottom-1);}}
  await page.screenshot({path:`.local/qa/v3-layout-${width}.png`,fullPage:width<700});
 }
});

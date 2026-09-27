import {test,expect} from '@playwright/test';
import {createGame,selectModule,rollInitiative} from '../../dist/engine.mjs';
import {RELEASE} from '../../dist/version.mjs';

test('actual A +8 -8 preview, landing, confirmation and damage match the final board',async({page})=>{
  page.setDefaultTimeout(15000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('star-chain-demo-v1',JSON.stringify({version:6,unlocked:15,matches:0})));
  await page.route('**/api/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{"error":"isolated rule test"}'}));
  await page.goto('/');await page.waitForFunction(()=>document.documentElement.dataset.battle==='ready');
  const previousChallenges=await page.evaluate(()=>window.starChainClient!.getSnapshot()!.game.challenge_ids);
  let seed=0;
  for(let candidate=1;candidate<20000;candidate++){
    const g=createGame({seed:candidate,level:7,choices:true,previousChallenges});
    selectModule(g,g.moduleOptions[0]);while(g.phase==='opening')rollInitiative(g);
    if(g.first===0&&g.goals.includes('L8')&&g.hands[0].some((c:any)=>c.type==='A')&&g.hands[0].filter((c:any)=>c.value===8).length>=2){seed=candidate;break;}
  }
  expect(seed).toBeGreaterThan(0);
  const receipt=await page.evaluate(async seed=>{
    const c=window.starChainClient!,s=c.getSnapshot()!,now=Date.now,random=Math.random;
    Date.now=()=>seed;Math.random=()=>{Date.now=now;Math.random=random;return 0;};
    try{return await c.dispatch({protocol:1,id:crypto.randomUUID(),matchId:s.matchId,action:'confirm-new',data:{level:7}});}
    finally{Date.now=now;Math.random=random;}
  },seed);
  expect(receipt.ok).toBe(true);
  await expect(page.locator('[data-action=module]').first()).toBeVisible();await page.locator('[data-action=module]').first().click();
  await page.locator('[data-action=roll]').click();
  await expect(page.locator('[data-action=sector]').first()).toBeEnabled();await page.locator('[data-action=sector]').first().click();
  const before=await page.evaluate(()=>window.starChainClient!.getSnapshot()!.game);
  expect(before.rules_version).toBe('flight-records-4');expect(before.board).toEqual([4,10,16]);
  const cards=[before.hand.find(c=>c.type==='A')!,...before.hand.filter(c=>c.value===8)];
  for(const card of cards)await page.locator(`#cards [data-id="${card.id}"]`).click();
  await page.locator('[data-action=chain][data-index="1"]').click();
  for(const [width,height] of [[1920,1080],[1774,887],[1280,720],[390,844]]){
    await page.setViewportSize({width,height});
    await page.locator('[data-action=op][data-step="1"][data-value="1"]').click();
    await expect(page.locator('#operation-region .move-error')).toContainText('0–20');
    await page.locator('[data-action=op][data-step="1"][data-value="-1"]').click();
    await expect(page.locator('#operation-region .move-error')).toHaveCount(0);
  }
  await page.setViewportSize({width:1920,height:1080});
  await page.locator('[data-action=op][data-step="0"][data-value="1"]').click();
  await page.locator('[data-action=op][data-step="1"][data-value="-1"]').click();
  const preview=await page.evaluate(()=>window.starChainClient!.getSnapshot()!);
  expect(preview.game.automatic_goal_claims).toContain('L8');
  expect(preview.ui.landing).toEqual({chain:1,after:10});
  await expect(page.locator('#operation-region .move-error')).toHaveCount(0);
  await expect(page.locator('.landing-marker[data-landing="10"]')).toBeVisible();
  await expect(page.locator('[data-action=play]')).toBeEnabled();
  await expect(page.locator('h1')).toContainText(`V${RELEASE.version}`);
  await page.screenshot({path:`.local/qa/accel-return-v${RELEASE.version}-preview.png`});
  await page.locator('[data-action=play]').click();
  await expect.poll(()=>page.evaluate(()=>window.starChainClient!.getSnapshot()!.game.animation)).toBe(false);
  const after=await page.evaluate(()=>window.starChainClient!.getSnapshot()!.game);
  expect(after.board).toEqual([4,10,16]);
  expect(after.hp[1]).toBe(before.hp[1]-preview.game.automatic_damage);
  expect(after.hp[0]).toBe(before.hp[0]+preview.game.automatic_healing);
  expect(after.phase).toBe('refill');
  for(const card of cards)expect(after.hand.some(c=>c.id===card.id)).toBe(false);
  await page.waitForTimeout(500);
  expect((await page.evaluate(()=>window.starChainClient!.getSnapshot()!.game)).hp).toEqual(after.hp);
  await page.screenshot({path:`.local/qa/accel-return-v${RELEASE.version}-settled.png`});
  console.log(JSON.stringify({seed,rules:after.rules_version,formula:'10 + 8 - 8 = 10',claimed:preview.game.automatic_goal_claims,baseDamage:preview.game.automatic_bonuses?.base_damage,damage:preview.game.automatic_damage,beforeHP:before.hp,afterHP:after.hp}));
  expect(errors).toEqual([]);
});

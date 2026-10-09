import {test,expect} from '@playwright/test';
// Exercise real dashboard controls using a fake game and fake worker. Never starts Pac-Man.
test('synthetic dashboard session resets games, pauses pending moves and requires explicit resume',async({page})=> {
  await page.route('**/engine/index.html',route=>route.fulfill({contentType:'text/html',body:`<script>
  let frames=0,steps=0,seed=1;window.syntheticSeeds=[];
  const observe=()=>({grid:new Uint8Array(1008).fill(1),scalars:new Float32Array(64)});
  const status=()=>({phase:'playing',frames,playFrames:frames,decisions:steps,score:steps*10,level:1,lives:3,deaths:0,clears:0,stalled:0,seed,gameOver:steps>=5,timeout:false,player:{x:100,y:100},ai:false,invincible:false});
  window.PacLab={init(){},observe,status,render(){},reset(s){window.syntheticSeeds.push(s);seed=s;frames=0;steps=0;return observe();},step(){frames+=4;steps++;return {observation:observe(),reward:0.99,terminal:steps>=5,trainable:true,death:false,cleared:false,frames:4,info:status()};}};
  </script>`}));
  await page.route('**/src/learner.worker.ts*',route=>route.fulfill({contentType:'application/javascript',body:`
    let decisions=0;const progress=()=>({decisions,updates:decisions?1:0,epsilon:1,replay:decisions,loss:null});
    self.onmessage=async({data:{id,type,payload}})=>{
      let result;
      if(type==='init')result={progress:progress(),dashboard:null,savedAt:null};
      if(type==='action'){await new Promise(r=>setTimeout(r,30));result=0;}
      if(type==='remember'){decisions++;result=progress();}
      if(type==='save')result=new Date().toISOString();
      self.postMessage({id,result});
    };`}));
  await page.goto('/');await expect(page.locator('#start')).toBeEnabled();
  const gameFrame=page.frames().find(f=>f.url().includes('/engine/index'))!;
  const status=()=>gameFrame.evaluate(()=>(window as any).PacLab.status());
  expect((await status()).frames).toBe(0);
  await page.locator('#start').click();await expect.poll(()=>page.locator('#games').textContent()).not.toBe('0');
  await page.locator('#pause').click();await expect(page.getByRole('status')).toContainText('Paused. Your learning is saved.');
  const stopped=await status();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  expect(await status()).toEqual(stopped);
  await page.locator('#start').click();
  await expect(page.locator('#session-label')).toHaveText('TRAINING');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.getByRole('status')).toContainText('Paused. Your learning is saved.');
  const hiddenStopped=await status();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});
  expect(await status()).toEqual(hiddenStopped);await expect(page.locator('#session-label')).toHaveText('PAUSED');
  const updates=await page.locator('#updates').textContent(),games=await page.locator('#games').textContent();
  await page.selectOption('#speed','max');await page.locator('#evaluate').click();
  await expect(page.getByRole('status')).toContainText('Evaluation complete',{timeout:15000});
  await expect(page.locator('#evaluation')).toBeVisible();await expect(page.locator('#evaluation')).toContainText('20 matched seeds');
  expect(await page.locator('#updates').textContent()).toBe(updates);expect(await page.locator('#games').textContent()).toBe(games);
  const seeds=await gameFrame.evaluate(()=>(window as any).syntheticSeeds.filter((n:number)=>n>=100001));
  expect(seeds).toEqual(Array.from({length:40},(_,i)=>100001+Math.floor(i/2)));
  await expect(page.locator('#session-label')).toHaveText('READY');
});

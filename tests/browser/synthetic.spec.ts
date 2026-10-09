import {test,expect} from '@playwright/test';
test('browser worker learns only from synthetic data and round-trips IndexedDB',async({page})=> {
  await page.goto('/');await expect(page.locator('#start')).toBeEnabled();
  const result=await page.evaluate(()=>new Promise<any>((resolve,reject)=> {
    const worker=new Worker('/tests/browser/synthetic.worker.ts',{type:'module'});
    worker.onmessage=event=>{worker.terminate();resolve(event.data);};worker.onerror=event=>{worker.terminate();reject(new Error(event.message));};worker.postMessage({});
  }));
  console.log('Synthetic batch verification:',result);
  expect(result.error).toBeUndefined();expect(result.updates).toBe(1);expect(Number.isFinite(result.loss)).toBe(true);expect(result.restoredAction).toBe(result.action);expect(result.restoredUpdates).toBe(1);
  // The actual dashboard agent and maze remain untouched.
  await expect(page.locator('#updates')).toHaveText('0');
  expect(await page.frames().find(f=>f.url().includes('/engine/index'))!.evaluate(()=>(window as any).PacLab.status().frames)).toBe(0);
});

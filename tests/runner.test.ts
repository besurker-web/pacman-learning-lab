import { it,expect } from 'vitest';
import { Runner } from '../src/runner';
it('does nothing before an explicit start and cancels a pending inference on pause',async()=> {
  let inferenceDone:()=>void=()=>{};let moves=0;
  const inference=new Promise<void>(resolve=>inferenceDone=resolve);
  const runner=new Runner(async live=>{await inference;if(live())moves++;return 4;},error=>{throw error;});
  expect(moves).toBe(0);expect(runner.running).toBe(false);
  runner.start();const paused=runner.pause();inferenceDone();await paused;
  expect(moves).toBe(0);expect(runner.running).toBe(false);
});
it('waits for an in-flight operation before acknowledging pause',async()=> {
  let finish:()=>void=()=>{};let completed=false;
  const work=new Promise<void>(resolve=>finish=resolve);
  const runner=new Runner(async()=>{await work;completed=true;return 4;},error=>{throw error;});
  runner.start();let acknowledged=false;const pause=runner.pause().then(()=>acknowledged=true);
  expect(acknowledged).toBe(false);finish();await pause;expect(completed).toBe(true);expect(acknowledged).toBe(true);
});
it('keeps frame advancement independent of requested speed',async()=> {
  for(const speed of ['1','5','max']) {
    let frames=0;const runner=new Runner(async()=>{frames+=4;runner.running=false;return 4;},error=>{throw error;});
    runner.speed=speed;runner.start();await runner.pause();expect(frames).toBe(4);
  }
});

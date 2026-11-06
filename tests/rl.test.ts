import * as tf from '../src/tensorflow';
import { beforeAll,describe,it,expect } from 'vitest';
import { Agent,Replay,doubleTarget,epsilonAt,CONFIG } from '../src/rl';
import { capture,restore,exportJSON,importJSON } from '../src/checkpoint';
import type { Observation,Transition,Dashboard } from '../src/types';
beforeAll(async()=>{await tf.setBackend('cpu');await tf.ready();});
const observation=():Observation=>({grid:new Uint8Array(1008).fill(1),scalars:new Float32Array(64)});
const transition=():Transition=>({state:observation(),action:1,reward:2,next:observation(),terminal:true});
describe('Synthetic learning checks only; no game or real training session',()=> {
  it('decays exploration with a fixed floor',()=>{expect(epsilonAt(0)).toBe(1);expect(epsilonAt(50000)).toBeCloseTo(.525);expect(epsilonAt(100000)).toBe(.05);expect(epsilonAt(900000)).toBe(.05);});
  it('selects with online, evaluates with target, and never bootstraps a death',()=> {
    expect(doubleTarget(2,false,[1,4,2,3],[10,20,90,0])).toBeCloseTo(2+.99*20);
    expect(doubleTarget(-10,true,[1,4,2,3],[10,20,90,0])).toBe(-10);
  });
  it('bounds and samples replay without duplicate entries',()=> {
    const replay=new Replay(3);for(let i=0;i<6;i++)replay.add({...transition(),reward:i});
    expect(replay.size).toBe(3);expect(replay.sample(3).map(t=>t.reward).sort()).toEqual([3,4,5]);expect(()=>replay.sample(4)).toThrow();
  });
  it('explores and increments experiences without early optimizer updates',()=> {
    const a=new Agent();try{expect(a.action(observation(),true,()=>.8)).toBe(3);a.remember(transition());expect(a.progress()).toMatchObject({decisions:1,updates:0,replay:1});}finally{a.dispose();}
  });
  it('changes online weights, leaves target fixed, then synchronizes on schedule',()=> {
    const a=new Agent();
    try {
      const index=a.online.getWeights().length-1;
      const before=Array.from(a.online.getWeights()[index].dataSync());
      a.trainBatch([transition(),transition()]);
      expect(a.updates).toBe(1);expect(a.loss).not.toBeNull();
      expect(Array.from(a.online.getWeights()[index].dataSync())).not.toEqual(before);
      expect(Array.from(a.target.getWeights()[index].dataSync())).toEqual(before);
      a.updates=CONFIG.syncEvery-1;a.trainBatch([transition()]);
      expect(Array.from(a.target.getWeights()[index].dataSync())).toEqual(Array.from(a.online.getWeights()[index].dataSync()));
    }finally{a.dispose();}
  });
  it('round-trips weights, target, counters, and metrics with empty replay after restore',async()=> {
    const a=new Agent();let b:Agent|undefined;
    const dashboard:Dashboard={games:0,deaths:0,timeouts:0,best:0,history:[],speed:'1',nextSeed:1,evaluation:null};
    try {
      a.decisions=2345;a.updates=12;
      const cp=importJSON(exportJSON(await capture(a,dashboard)));b=await restore(cp);
      expect(b.progress()).toMatchObject({decisions:2345,updates:12,replay:0});
      for(let i=0;i<a.online.getWeights().length;i++)expect(Array.from(b.online.getWeights()[i].dataSync())).toEqual(Array.from(a.online.getWeights()[i].dataSync()));
      expect(b.action(observation(),false)).toBe(a.action(observation(),false));
      expect(()=>importJSON('{"version":999}')).toThrow('compatible');
    }finally{a.dispose();b?.dispose();}
  });
  it('rejects attacker-controlled weight metadata before TensorFlow decodes it',async()=> {
    const a=new Agent();
    const dashboard:Dashboard={games:0,deaths:0,timeouts:0,best:0,history:[],speed:'1',nextSeed:1,evaluation:null};
    try {
      const cp=await capture(a,dashboard);
      cp.online.weightSpecs![0]={...cp.online.weightSpecs![0],shape:[Number.MAX_SAFE_INTEGER],dtype:'string'};
      await expect(restore(cp)).rejects.toThrow('Incompatible model weights');
    } finally {a.dispose();}
  });
  it('releases temporary tensors across repeated inference and updates',()=> {
    const a=new Agent();try{a.trainBatch([transition()]);const baseline=tf.memory().numTensors;for(let i=0;i<4;i++){a.action(observation(),false);a.trainBatch([transition()]);}expect(tf.memory().numTensors).toBe(baseline);}finally{a.dispose();}
  });
});

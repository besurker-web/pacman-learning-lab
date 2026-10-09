// This worker is only loaded by Playwright, never by the delivered dashboard.
import {initializeBackend} from '../../src/backend';
import {Agent,CONFIG} from '../../src/rl';
import {capture,storage,restore} from '../../src/checkpoint';
import type {Dashboard} from '../../src/types';
self.onmessage=async()=> {
  try {
    const backend=await initializeBackend(),agent=new Agent();
    const state={grid:new Uint8Array(1008).fill(1),scalars:new Float32Array(64)};
    const item={state,action:1,reward:2,next:state,terminal:true};
    const started=performance.now();agent.trainBatch(Array.from({length:CONFIG.batch},()=>item));
    const duration=performance.now()-started;
    const dashboard:Dashboard={games:0,deaths:0,timeouts:0,best:0,history:[],speed:'1',nextSeed:1,evaluation:null};
    const cp=await capture(agent,dashboard);await storage('write',cp);const loaded=await storage('read');
    const restored=await restore(loaded!);
    const result={backend,duration,loss:agent.loss,updates:agent.updates,action:agent.action(state,false),restoredAction:restored.action(state,false),restoredUpdates:restored.updates};
    await storage('delete');agent.dispose();restored.dispose();self.postMessage(result);
  }catch(error){self.postMessage({error:String(error)});}
};

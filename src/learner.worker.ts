import { initializeBackend } from './backend';
import { Agent } from './rl';
import { capture, storage, restore, exportJSON, importJSON } from './checkpoint';
let agent:Agent;
let queue=Promise.resolve();
self.onmessage=event=> {
  const {id,type,payload}=event.data;
  queue=queue.then(async()=> {
    try {
      let result:unknown;
      if(type==='init') {
        const backend=await initializeBackend();
        const checkpoint=await storage('read');
        agent=checkpoint?await restore(checkpoint):new Agent();
        result={progress:agent.progress(),dashboard:checkpoint?.dashboard??null,savedAt:checkpoint?.savedAt??null,backend};
      } else if(type==='action') result=agent.action(payload.state,payload.explore);
      else if(type==='remember') result=agent.remember(payload);
      else if(type==='save') {const cp=await capture(agent,payload);await storage('write',cp);result=cp.savedAt;}
      else if(type==='export') result=exportJSON(await capture(agent,payload));
      else if(type==='import') {
        const cp=importJSON(payload);const next=await restore(cp);
        try{await storage('write',cp);}catch(error){next.dispose();throw error;}
        agent.dispose();agent=next;result={progress:agent.progress(),dashboard:cp.dashboard,savedAt:cp.savedAt};
      } else if(type==='reset') {await storage('delete');agent?.dispose();agent=new Agent();result=agent.progress();}
      else if(type==='progress') result=agent.progress();
      else throw new Error('Unknown worker command');
      self.postMessage({id,result});
    } catch(error){self.postMessage({id,error:error instanceof Error?error.message:String(error)});}
  });
};

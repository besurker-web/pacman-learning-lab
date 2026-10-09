import * as tf from './tensorflow';
import type { Observation, Transition, Progress } from './types';
export const CONFIG = { capacity:10000, batch:32, warmup:1000, gamma:0.99, rate:0.0003, updateEvery:4, syncEvery:1000 };
export const epsilonAt = (decisions:number) => decisions>=100000?0.05:1-0.95*Math.max(0,decisions)/100000;
export function doubleTarget(reward:number, terminal:boolean, online:number[], target:number[]) {
  const action = online.indexOf(Math.max(...online));
  return reward + (terminal ? 0 : CONFIG.gamma*target[action]);
}
export class Replay {
  private entries:Transition[] = [];
  private cursor = 0;
  constructor(readonly capacity=CONFIG.capacity) {}
  get size() { return this.entries.length; }
  add(t:Transition) { this.entries[this.cursor]=t; this.cursor=(this.cursor+1)%this.capacity; }
  sample(count:number, random=Math.random) {
    if (count>this.size) throw new Error('Not enough replay experiences');
    const selected=new Set<number>();
    while(selected.size<count) selected.add(Math.floor(random()*this.size));
    return [...selected].map(i=>this.entries[i]);
  }
}
export function model() {
  const grid=tf.input({shape:[36,28,10]});
  const extra=tf.input({shape:[64]});
  const c1=tf.layers.conv2d({filters:16,kernelSize:3,strides:2,activation:'relu',padding:'same'}).apply(grid) as tf.SymbolicTensor;
  const c2=tf.layers.conv2d({filters:32,kernelSize:3,strides:2,activation:'relu',padding:'same'}).apply(c1) as tf.SymbolicTensor;
  const flat=tf.layers.flatten().apply(c2) as tf.SymbolicTensor;
  const joined=tf.layers.concatenate().apply([flat,extra]) as tf.SymbolicTensor;
  const hidden=tf.layers.dense({units:128,activation:'relu'}).apply(joined) as tf.SymbolicTensor;
  const output=tf.layers.dense({units:4}).apply(hidden) as tf.SymbolicTensor;
  return tf.model({inputs:[grid,extra],outputs:output});
}
export function tensors(observations:Observation[]): [tf.Tensor4D,tf.Tensor2D] {
  const grid=new Float32Array(observations.length*36*28*10);
  const scalars=new Float32Array(observations.length*64);
  observations.forEach((o,b)=> {
    const offset=b*36*28*10;
    o.grid.forEach((value,i)=>grid[offset+i*10+value]=1);
    for(let actor=0;actor<5;actor++) {
      const x=Math.floor(o.scalars[actor*8]*28), y=Math.floor(o.scalars[actor*8+1]*36);
      if(x>=0&&x<28&&y>=0&&y<36) grid[offset+(y*28+x)*10+4+actor]=1;
    }
    if(o.scalars[49]) {
      const x=Math.floor(o.scalars[50]*28), y=Math.floor(o.scalars[51]*36);
      if(x>=0&&x<28&&y>=0&&y<36) grid[offset+(y*28+x)*10+9]=1;
    }
    scalars.set(o.scalars,b*64);
  });
  return [tf.tensor4d(grid,[observations.length,36,28,10]),tf.tensor2d(scalars,[observations.length,64])];
}
export class Agent {
  online=model();
  target=model();
  replay=new Replay();
  optimizer=tf.train.adam(CONFIG.rate);
  decisions=0; updates=0; loss:number|null=null;
  constructor(){this.sync();}
  sync(){ this.target.setWeights(this.online.getWeights()); }
  progress():Progress {return {decisions:this.decisions,updates:this.updates,epsilon:epsilonAt(this.decisions),replay:this.replay.size,loss:this.loss};}
  action(state:Observation,explore:boolean,random=Math.random) {
    if(explore && random()<epsilonAt(this.decisions)) return Math.floor(random()*4);
    return tf.tidy(()=> {
      const q=this.online.predict(tensors([state])) as tf.Tensor;
      return q.argMax(-1).dataSync()[0];
    });
  }
  remember(transition:Transition) {
    this.replay.add(transition); this.decisions++;
    if(this.replay.size>=CONFIG.warmup && this.decisions%CONFIG.updateEvery===0) this.trainBatch(this.replay.sample(CONFIG.batch));
    return this.progress();
  }
  trainBatch(batch:Transition[]) {
    // Compute bootstrap outside the gradient tape. Double DQN selects using online,
    // then evaluates that selected action using target; terminal transitions never bootstrap.
    const targets=tf.tidy(()=> {
      const next=tensors(batch.map(t=>t.next));
      const online=this.online.predict(next) as tf.Tensor2D;
      const target=this.target.predict(next) as tf.Tensor2D;
      const selected=tf.oneHot(online.argMax(1),4);
      const bootstrap=target.mul(selected).sum(1);
      return tf.tensor1d(batch.map(t=>t.reward)).add(bootstrap.mul(tf.tensor1d(batch.map(t=>t.terminal?0:CONFIG.gamma))));
    });
    try {
      const loss=tf.tidy(()=>this.optimizer.minimize(()=> {
        const predicted=this.online.apply(tensors(batch.map(t=>t.state)),{training:true}) as tf.Tensor2D;
        const chosen=predicted.mul(tf.oneHot(tf.tensor1d(batch.map(t=>t.action),'int32'),4)).sum(1);
        return tf.losses.huberLoss(targets,chosen) as tf.Scalar;
      },true,this.online.trainableWeights.map(w=>(w as unknown as {val:tf.Variable}).val))!);
      if(!loss) throw new Error('No learning loss was produced');
      this.loss=loss.dataSync()[0]; loss.dispose();
      if(!Number.isFinite(this.loss)) throw new Error('Learning stopped: non-finite loss. Restore a backup or reset learning.');
      this.updates++;
      if(this.updates%CONFIG.syncEvery===0) this.sync();
    } finally { targets.dispose(); }
  }
  dispose(){this.online.dispose();this.target.dispose();this.optimizer.dispose();}
}

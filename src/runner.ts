// One simulation owner. A pause invalidates outstanding inference before it can step.
export class Runner {
  running=false;
  speed='1';
  private flight:Promise<void>=Promise.resolve();
  private generation=0;
  constructor(private tick:(live:()=>boolean)=>Promise<number>,private fail:(error:unknown)=>void){}
  start(){
    if(this.running)return;
    this.running=true;const generation=++this.generation;
    const live=()=>this.running&&generation===this.generation;
    this.flight=(async()=> {
      try {
        while(live()) {
          const started=performance.now();
          const frames=await this.tick(live);
          if(!live())break;
          const duration=this.speed==='max'?0:frames*1000/60/Number(this.speed);
          await new Promise(resolve=>setTimeout(resolve,Math.max(0,duration-(performance.now()-started))));
        }
      } catch(error){this.running=false;this.fail(error);}
    })();
  }
  async pause(){this.running=false;this.generation++;await this.flight;}
}

import './style.css';
import { Runner } from './runner';
import type { Dashboard, Episode, Evaluation, Game, Observation, Progress } from './types';

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
  <header class="masthead"><a class="brand" href="/" aria-label="Learning Lab home"><span class="pac-logo" aria-hidden="true"></span>Learning Lab<span class="brand-divider">/</span><span class="brand-game">PAC-MAN</span></a><span class="local-label"><span></span>ON YOUR DEVICE</span></header>
  <main>
    <section class="intro"><div><p class="eyebrow">AN EXPERIMENT IN REINFORCEMENT LEARNING</p><h1>Every loss is a lesson.</h1><p class="lede">An untrained agent. A familiar maze. Watch it learn one attempt at a time.</p></div><div class="session-state"><span id="state-dot"></span><span id="session-label">PREPARING</span></div></section>
    <div class="workspace">
      <section class="arcade" aria-label="Game and training controls">
        <div class="arcade-top"><span>THE MAZE</span><span id="game-phase">WAITING FOR YOU</span></div>
        <div class="game-wrap"><iframe id="game" src="/engine/index.html" title="Pac-Man game canvas" tabindex="-1"></iframe><div id="idle-note">No moves yet. You make the first call.</div></div>
        <div class="game-strip"><span>SCORE <strong id="score">0</strong></span><span>LEVEL <strong id="level">1</strong></span><span>LIVES <strong id="lives">3</strong></span><span>REWARD <strong id="reward">0.00</strong></span></div>
        <div class="controls"><button id="start" class="primary" disabled><span aria-hidden="true">▶</span> Start Training</button><button id="pause" class="secondary" disabled>Pause</button><label class="speed-label" for="speed">SPEED<select id="speed"><option value="1">1× · Watch</option><option value="5">5× · Faster</option><option value="max">Maximum</option></select></label></div>
        <p id="status" role="status">Preparing the game and local learning worker…</p>
      </section>
      <aside class="insights" aria-label="Learning progress">
        <div class="section-heading"><h2>Learning progress</h2><span id="model-label">UNTRAINED</span></div>
        <div class="metrics"><div><span>Games completed</span><strong id="games">0</strong></div><div><span>Best score</span><strong id="best">0</strong></div><div><span>Lives lost</span><strong id="deaths">0</strong></div><div><span>Average · last 50</span><strong id="average">—</strong></div></div>
        <div class="chart-heading"><h3>Score over time</h3><span>LAST 50 GAMES</span></div><div class="chart-wrap"><canvas id="chart" aria-label="Completed game scores and their rolling average" role="img"></canvas><div id="chart-empty"><span class="empty-mark">↗</span><p>A learning curve starts<br>with a first attempt.</p></div></div>
        <div class="chart-legend"><span><i></i>Game score</span><span><i></i>Rolling average</span></div>
        <div class="exploration"><div><h3>Exploration</h3><strong id="epsilon">100%</strong></div><div class="track"><div id="epsilon-bar"></div></div><p id="explore-note">Random moves first. Experience comes next.</p></div>
        <dl class="training-details"><div><dt>Learning updates</dt><dd id="updates">0</dd></div><div><dt>Experience buffer</dt><dd id="buffer">0 / 10,000</dd></div><div><dt>Stalled games</dt><dd id="timeouts">0</dd></div><div><dt>Learning loss</dt><dd id="loss">—</dd></div></dl>
        <p class="save-state" id="saved">No saved progress yet</p>
      </aside>
    </div>
    <section class="lower-grid">
      <div class="how"><p class="eyebrow">HOW IT LEARNS</p><h2>Try. Remember. Try again.</h2><p>The agent sees walls, pellets, and ghosts. It tries a direction, remembers the result, and updates a neural network to choose better next time.</p><div class="reward-key"><span><b>+</b> Score points</span><span><b>−</b> Lose a life</span><span><b>+</b> Clear the maze</span></div><p class="small-print">Double DQN · local learning worker · no pretrained model<br>Progress takes practice. Improvement is measured, never assumed.</p></div>
      <div class="tools"><p class="eyebrow">YOUR EXPERIMENT</p><h2>Keep it. Test it. Start fresh.</h2><div class="tool-buttons"><button id="watch" disabled>Watch Learned Agent <span>↗</span></button><button id="evaluate" disabled>Evaluate against random <span>↗</span></button></div><p class="tool-caption">Evaluation plays 20 matched seeds per agent without learning. It runs only when you choose it.</p><div id="evaluation" hidden></div><div class="backup-buttons"><button id="export" disabled>Export backup</button><button id="import" disabled>Import backup</button><button id="reset" class="danger" disabled>Reset Learning</button></div><input id="backup-file" type="file" accept=".json,application/json" hidden><p class="small-print">Saved in this browser. Export a backup before clearing browser data.</p></div>
    </section>
    <div id="error" role="alert" hidden></div>
  </main>
  <footer><span>Built to learn, one maze at a time.</span><span>Game by <a href="https://github.com/masonicGIT/pacman" target="_blank" rel="noreferrer">Shaun Williams & contributors</a> · <a href="/engine/LICENSE" target="_blank">GPL-3.0</a></span></footer>
  <dialog id="reset-dialog"><h2>Start from zero?</h2><p>This deletes the saved model, learning history, and evaluation results. Export a backup first if you want to keep them.</p><div><button id="cancel-reset">Keep learning</button><button id="confirm-reset" class="danger">Delete and reset</button></div></dialog>`;

const freshDashboard=():Dashboard=>({games:0,deaths:0,timeouts:0,best:0,history:[],speed:'1',nextSeed:1,evaluation:null});
let dashboard=freshDashboard();
let progress:Progress={decisions:0,updates:0,epsilon:1,replay:0,loss:null};
let game:Game, observation:Observation, initialized=false, busy=true, mode:'train'|'watch'|'evaluate'='train';
let paused=false, episodeReward=0, savedAt:string|null=null, lastRender=0, sessionHasGame=false, failed=false, workerCrashed=false;
let evalIndex=0, evalResults:{learned:Episode[];random:Episode[]}={learned:[],random:[]};
let randomState=1;
const worker=new Worker(new URL('./learner.worker.ts',import.meta.url),{type:'module'});
const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
let sequence=0;
function rpc<T=any>(type:string,payload?:unknown):Promise<T> {
  return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,type,payload});});
}
worker.onmessage=event=>{const call=pending.get(event.data.id);if(!call)return;pending.delete(event.data.id);event.data.error?call.reject(new Error(event.data.error)):call.resolve(event.data.result);};
worker.onerror=event=>{workerCrashed=true;const error=new Error(`Learning worker stopped: ${event.message}. Reload the page to restore the last checkpoint.`);for(const call of pending.values())call.reject(error);pending.clear();showError(error);};
function showError(error:unknown) {
  runner.running=false;failed=true;paused=true;busy=false;
  $('error').hidden=false;$('error').textContent=`${error instanceof Error?error.message:String(error)} No further play or learning will run. Export a backup if available, then reload to retry or use Reset Learning.`;
  const reload=document.createElement('button');reload.textContent='Reload dashboard';reload.style.marginLeft='12px';reload.onclick=()=>location.reload();$('error').append(reload);
  $('status').textContent='Paused because an error needs attention.';paint();
}
function clearError(){failed=false;$('error').hidden=true;}
const format=(n:number)=>Math.round(n).toLocaleString();
function paint() {
  const info=game?.status();
  $('score').textContent=format(info?.score??0);$('level').textContent=String(info?.level??1);$('lives').textContent=String(info?.lives??3);$('reward').textContent=episodeReward.toFixed(2);
  $('games').textContent=format(dashboard.games);$('best').textContent=format(dashboard.best);
  $('deaths').textContent=format(dashboard.deaths);
  const recent=dashboard.history.slice(-50);
  $('average').textContent=recent.length?format(recent.reduce((sum,g)=>sum+g.score,0)/recent.length):'—';
  $('epsilon').textContent=`${(progress.epsilon*100).toFixed(1)}%`;$('epsilon-bar').style.width=`${progress.epsilon*100}%`;
  $('explore-note').textContent=progress.decisions===0?'Random moves first. Experience comes next.':`${format(progress.decisions)} decisions made. ${(100-progress.epsilon*100).toFixed(1)}% of training moves use the network.`;
  $('updates').textContent=format(progress.updates);$('buffer').textContent=`${format(progress.replay)} / 10,000`;$('timeouts').textContent=format(dashboard.timeouts);$('loss').textContent=progress.loss===null?'—':progress.loss.toFixed(4);
  $('model-label').textContent=progress.updates?'LEARNING':'UNTRAINED';
  $('session-label').textContent=!initialized?'PREPARING':busy?'SAVING':failed?'NEEDS ATTENTION':runner.running?(mode==='train'?'TRAINING':mode==='watch'?'WATCHING':'EVALUATING'):paused?'PAUSED':'READY';
  $('state-dot').classList.toggle('active',runner.running);
  $('game-phase').textContent=runner.running?(mode==='evaluate'?`EVALUATING ${Math.floor(evalIndex/2)+1} / 20 · ${evalIndex%2?'RANDOM':'LEARNED'}`:info?.phase.toUpperCase()??'PLAYING'):paused?'PAUSED':'WAITING FOR YOU';
  $('idle-note').hidden=sessionHasGame;
  const disabled=!initialized||busy||runner.running;
  ($('start') as HTMLButtonElement).disabled=disabled||failed;
  $('start').innerHTML=paused?'▶ Resume':'<span aria-hidden="true">▶</span> Start Training';
  ($('pause') as HTMLButtonElement).disabled=!runner.running||busy;
  for(const id of ['watch','evaluate'])($<HTMLButtonElement>(id)).disabled=disabled||failed||progress.updates===0;
  for(const id of ['export','import','reset'])$<HTMLButtonElement>(id).disabled=disabled||workerCrashed;
  if(game&&!workerCrashed&&!busy&&!runner.running)$<HTMLButtonElement>('reset').disabled=false;
  $<HTMLSelectElement>('speed').disabled=busy;
  $('saved').textContent=savedAt?`Saved locally · ${new Date(savedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:'No saved progress yet';
  drawChart();
}
function drawChart() {
  const canvas=$<HTMLCanvasElement>('chart'),ctx=canvas.getContext('2d')!;
  const ratio=window.devicePixelRatio||1,w=canvas.clientWidth,h=canvas.clientHeight;
  canvas.width=w*ratio;canvas.height=h*ratio;ctx.scale(ratio,ratio);ctx.clearRect(0,0,w,h);
  const history=dashboard.history.slice(-50);$('chart-empty').hidden=history.length>0;
  ctx.strokeStyle='#e1e4dc';ctx.lineWidth=1;
  for(let y=12;y<h-10;y+=(h-22)/3){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  if(!history.length)return;
  const max=Math.max(...history.map(g=>g.score),1)*1.1;
  const line=(values:number[],color:string,dashed:boolean)=>{ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash(dashed?[4,4]:[]);ctx.beginPath();values.forEach((v,i)=>{const x=4+i*(w-8)/Math.max(1,values.length-1),y=h-10-v/max*(h-22);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();if(values.length===1){ctx.beginPath();ctx.arc(4,h-10-values[0]/max*(h-22),3,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}ctx.setLineDash([]);};
  line(history.map(g=>g.score),'#94a57d',false);
  const start=dashboard.history.length-history.length;
  line(history.map((_,i)=>{const segment=dashboard.history.slice(Math.max(0,start+i-49),start+i+1);return segment.reduce((s,g)=>s+g.score,0)/segment.length;}),'#203e2c',true);
}
async function save(){savedAt=await rpc<string>('save',dashboard);paint();}
function newGame(seed:number){observation=game.reset(seed);episodeReward=0;sessionHasGame=true;game.render();}
function randomAction(){randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState>>>30;}
function episode():Episode {const s=game.status();return {score:s.score,deaths:s.deaths,reward:episodeReward,seconds:s.playFrames/60,clears:s.clears,timeout:s.timeout};}
function showEvaluation() {
  const e=dashboard.evaluation;if(!e){$('evaluation').hidden=true;return;}
  $('evaluation').hidden=false;
  $('evaluation').innerHTML=`<table><caption>Mean over ${e.games} matched seeds · 20-minute game cap · no learning</caption><thead><tr><th>Agent</th><th>Score</th><th>Survival</th><th>Clears</th></tr></thead><tbody><tr><td>Learned</td><td>${format(e.learned.score)}</td><td>${e.learned.seconds.toFixed(1)}s</td><td>${e.learned.clears.toFixed(2)}</td></tr><tr><td>Random</td><td>${format(e.random.score)}</td><td>${e.random.seconds.toFixed(1)}s</td><td>${e.random.clears.toFixed(2)}</td></tr></tbody></table>`;
}
async function completed() {
  const result=episode();
  if(mode==='train') {
    dashboard.games++;dashboard.timeouts+=result.timeout?1:0;dashboard.best=Math.max(dashboard.best,result.score);
    dashboard.history.push(result);dashboard.history=dashboard.history.slice(-500);dashboard.nextSeed++;
    // Clear the active episode before painting so deaths are not counted twice.
    sessionHasGame=false;await save();
    newGame(dashboard.nextSeed);
  } else if(mode==='watch') newGame((game.status().seed+1)>>>0);
  else {
    evalResults[evalIndex%2?'random':'learned'].push(result);evalIndex++;
    if(evalIndex===40) {
      const mean=(items:Episode[])=>({score:items.reduce((s,e)=>s+e.score,0)/20,seconds:items.reduce((s,e)=>s+e.seconds,0)/20,clears:items.reduce((s,e)=>s+e.clears,0)/20});
      dashboard.evaluation={learned:mean(evalResults.learned),random:mean(evalResults.random),games:20} satisfies Evaluation;
      runner.running=false;paused=false;mode='train';sessionHasGame=false;await save();showEvaluation();
      observation=game.reset(dashboard.nextSeed);game.render();$('status').textContent='Evaluation complete. Results are saved; training remains stopped.';
    } else {const seed=100001+Math.floor(evalIndex/2);randomState=seed;newGame(seed);}
  }
}
const runner=new Runner(async live=> {
  const before=game.status();
  const action=before.phase==='playing'?(mode==='evaluate'&&evalIndex%2?randomAction():await rpc<number>('action',{state:observation,explore:mode==='train'})):0;
  if(!live())return 0;
  const previous=observation,result=game.step(action);observation=result.observation;episodeReward+=result.reward;
  if(mode==='train'&&result.trainable){dashboard.deaths+=result.death?1:0;dashboard.best=Math.max(dashboard.best,result.info.score);progress=await rpc('remember',{state:previous,action,reward:result.reward,next:observation,terminal:result.terminal});}
  // Evaluation has a 20-minute simulation cap per game; results explicitly include capped games.
  if(result.info.gameOver||(mode==='evaluate'&&result.info.frames>=72000))await completed();
  if(performance.now()-lastRender>32||!live()){game.render();paint();lastRender=performance.now();}
  return result.frames;
},showError);
async function pause() {
  if(!runner.running)return;
  busy=true;paused=true;$('status').textContent='Pausing after the current learning operation…';
  const completion=runner.pause();paint();await completion;
  try{await save();$('status').textContent='Paused. Your learning is saved. Press Resume when you’re ready.';}
  catch(error){showError(error);}finally{busy=false;game.render();paint();}
}
function start(selected:'train'|'watch'|'evaluate') {
  if(!initialized||busy||failed||runner.running)return;
  if(!paused||selected!==mode) {
    mode=selected;
    if(mode==='evaluate'){evalIndex=0;evalResults={learned:[],random:[]};randomState=100001;newGame(100001);}
    else newGame(dashboard.nextSeed);
  }
  paused=false;runner.speed=dashboard.speed;runner.start();
  $('status').textContent=mode==='train'?'Training. Each attempt adds experience; Pause saves your progress.':mode==='watch'?'Watching the learned agent. Exploration and learning are off.':'Evaluating 20 matched seeds per agent. No learning; each game is capped at 20 simulated minutes.';
  paint();
}
$('start').onclick=()=>start(paused?mode:'train');$('pause').onclick=()=>void pause();$('watch').onclick=()=>start('watch');$('evaluate').onclick=()=>start('evaluate');
$<HTMLSelectElement>('speed').onchange=event=>{dashboard.speed=(event.target as HTMLSelectElement).value;runner.speed=dashboard.speed;};
document.addEventListener('visibilitychange',()=>{if(document.hidden)void pause();});
window.addEventListener('pagehide',()=>{void pause();});
window.addEventListener('resize',drawChart);
$('reset').onclick=()=>$<HTMLDialogElement>('reset-dialog').showModal();$('cancel-reset').onclick=()=>$<HTMLDialogElement>('reset-dialog').close();
$('confirm-reset').onclick=async()=> {
  $<HTMLDialogElement>('reset-dialog').close();busy=true;paint();
  try{progress=await rpc('reset');initialized=true;dashboard=freshDashboard();savedAt=null;mode='train';paused=false;sessionHasGame=false;episodeReward=0;observation=game.reset(1);game.render();$<HTMLSelectElement>('speed').value='1';clearError();showEvaluation();$('status').textContent='Ready — press Start Training';}
  catch(error){showError(error);}finally{busy=false;paint();}
};
$('export').onclick=async()=> {
  busy=true;paint();
  try {const text=await rpc<string>('export',dashboard);const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`pacman-learning-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  catch(error){showError(error);}finally{busy=false;paint();}
};
$('import').onclick=()=>$<HTMLInputElement>('backup-file').click();
$<HTMLInputElement>('backup-file').onchange=async event=> {
  const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;busy=true;paint();
  try {
    if(file.size>30_000_000)throw new Error('Backup exceeds the 30 MB limit.');
    const loaded=await rpc('import',await file.text());progress=loaded.progress;dashboard=loaded.dashboard;savedAt=loaded.savedAt;
    paused=false;sessionHasGame=false;episodeReward=0;mode='train';observation=game.reset(dashboard.nextSeed);game.render();$<HTMLSelectElement>('speed').value=dashboard.speed;clearError();showEvaluation();
    $('status').textContent='Backup restored. Ready — press Start Training. The experience buffer will refill before learning resumes.';
  }catch(error){showError(error);}finally{input.value='';busy=false;paint();}
};
async function boot(){
  try {
    const iframe=$<HTMLIFrameElement>('game');
    game=await new Promise<Game>((resolve,reject)=> {
      const deadline=Date.now()+15000;
      const check=()=>{const api=iframe.contentWindow?.PacLab;if(api){resolve(api);return;}if(Date.now()>deadline){reject(new Error('Game canvas did not load. Reload to retry.'));return;}setTimeout(check,25);};check();
    });
    observation=game.observe();
    const loaded=await rpc('init');progress=loaded.progress;savedAt=loaded.savedAt;
    if(loaded.dashboard)dashboard=loaded.dashboard;
    $<HTMLSelectElement>('speed').value=dashboard.speed;runner.speed=dashboard.speed;
    initialized=true;busy=false;showEvaluation();paint();
    $('status').textContent=savedAt?'Saved progress loaded. Ready — press Start Training. Your replay buffer starts empty.':'Ready — press Start Training';
  }catch(error){showError(error);}
}
void boot();

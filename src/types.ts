export interface Observation { grid: Uint8Array; scalars: Float32Array }
export interface GameStatus { phase: string; frames: number; playFrames:number; decisions: number; score: number; level: number; lives: number; deaths: number; clears: number; stalled: number; seed: number; gameOver: boolean; timeout: boolean; player: {x:number;y:number}; ai:boolean; invincible:boolean }
export interface StepResult { observation: Observation; reward: number; terminal: boolean; trainable: boolean; death: boolean; cleared: boolean; frames: number; info: GameStatus }
export interface Game { init():void; reset(seed:number):Observation; observe():Observation; step(action:number):StepResult; render():void; status():GameStatus }
export interface Transition { state:Observation; action:number; reward:number; next:Observation; terminal:boolean }
export interface Progress { decisions:number; updates:number; epsilon:number; replay:number; loss:number|null }
export interface Episode { score:number; deaths:number; reward:number; seconds:number; clears:number; timeout:boolean }
export interface Evaluation { learned:{score:number;seconds:number;clears:number}; random:{score:number;seconds:number;clears:number}; games:number }
export interface Dashboard { games:number; deaths:number; timeouts:number; best:number; history:Episode[]; speed:string; nextSeed:number; evaluation:Evaluation|null }
declare global { interface Window { PacLab:Game; } }

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe,it,expect } from 'vitest';
import type { Game } from '../src/types';
function engine() {
  const sandbox={__PACLAB_HEADLESS__:true,console,Uint8Array,Float32Array,setTimeout,clearTimeout,window:{},localStorage:{}};
  const context=vm.createContext(sandbox);
  vm.runInContext(readFileSync('public/engine/pacman.js','utf8'),context);
  const game=(context as any).PacLab as Game & {fixture(name:string):unknown};
  game.init();return game;
}
describe('Original Pac-Man adapter, isolated game checks (no learner)',()=> {
  it('initializes idle with no simulation, no autoplay and no cheats',()=> {
    const g=engine();expect(g.status()).toMatchObject({frames:0,decisions:0,score:0,lives:3,ai:false,invincible:false,phase:'ready'});
    g.render();g.observe();expect(g.status().frames).toBe(0);
  });
  it('emits finite game state with a complete maze and actor features',()=> {
    const g=engine(),o=g.observe();expect(o.grid.length).toBe(1008);expect(o.scalars.length).toBe(64);expect([...o.scalars].every(Number.isFinite)).toBe(true);
    expect([...o.grid].filter(v=>v===2).length).toBeGreaterThan(200);expect([...o.grid].filter(v=>v===3)).toHaveLength(4);
  });
  it('reproduces seeded frightened movement and ignores render frequency',()=> {
    const a=engine(),b=engine();a.reset(982);b.reset(982);a.fixture('play');b.fixture('play');a.fixture('energize');b.fixture('energize');
    for(let i=0;i<80;i++){a.step(i%4);b.step(i%4);if(i%3===0)b.render();}
    expect(a.status()).toEqual(b.status());expect(a.observe()).toEqual(b.observe());
  });
  it('moves through corridors and gives the pellet reward',()=> {
    const g=engine();g.fixture('pellet');const start=g.status().player;const result=g.step(3);
    expect(result.info.player.x).toBeLessThan(start.x);expect(result.info.score).toBeGreaterThanOrEqual(10);expect(result.reward).toBeCloseTo(result.info.score/10-.01);
  });
  it('walls stop movement without allowing a player into wall tiles',()=> {
    const g=engine();g.fixture('play');for(let i=0;i<40;i++){const r=g.step(0);const o=r.observation,s=r.info;const tile=Math.floor(s.player.y/8)*28+Math.floor(s.player.x/8);expect(o.grid[tile]).not.toBe(0);}
  });
  it('a collision kills while frightened ghosts award points',()=> {
    const g=engine();g.fixture('collision');expect(g.status().phase).toBe('dead');
    g.reset(1);g.fixture('frightened');expect(g.status().phase).toBe('playing');expect(g.status().score).toBe(200);
  });
  it('marks death terminal and applies the loss penalty exactly once',()=> {
    const g=engine();g.fixture('death-next');const r=g.step(0);expect(r).toMatchObject({terminal:true,death:true,trainable:true});expect(r.reward).toBeCloseTo(r.info.score/10-10.01);expect(r.info.deaths).toBe(1);
    const next=g.step(0);expect(next).toMatchObject({terminal:false,death:false,trainable:false,reward:0});
  });
  it('continues remaining lives and stops at game over until explicitly reset',()=> {
    const g=engine();g.fixture('collision');for(let i=0;i<61;i++)g.step(0);expect(g.status().lives).toBe(2);
    g.fixture('last-life');g.fixture('collision');while(!g.status().gameOver)g.step(0);
    expect(g.status().phase).toBe('over');expect(()=>g.step(0)).toThrow('Reset');g.reset(2);expect(g.status()).toMatchObject({lives:3,score:0,seed:2,frames:0});
  });
  it('counts a maze clear once, awards the bonus, and progresses to the next level',()=> {
    const g=engine();g.fixture('clear');const r=g.step(0);expect(r.cleared).toBe(true);expect(r.reward).toBeGreaterThanOrEqual(49.99);expect(r.info.clears).toBe(1);
    for(let i=0;i<80;i++)g.step(0);expect(g.status().level).toBe(2);expect(g.status().clears).toBe(1);
  });
  it('records a stalled game as timeout, never a death',()=> {
    const g=engine();g.fixture('timeout');const r=g.step(0);expect(r.terminal).toBe(true);expect(r.info).toMatchObject({timeout:true,gameOver:true,deaths:0});
  });
  it('rejects invalid actions',()=>{const g=engine();expect(()=>g.step(4)).toThrow('Invalid');});
});

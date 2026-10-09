import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
const base = new URL('../', import.meta.url);
const names = ['inherit','random','game','direction','Map','colors','mapgen','atlas','renderers','hud','galagaStars','Button','Menu','inGameMenu','sprites','Actor','Ghost','Player','actors','targets','ghostCommander','ghostReleaser','elroyTimer','energizer','fruit','states','cutscenes','maps','vcr'];
let code = `// Copyright 2012 Shaun Williams; original game GPL-3.0-only.\n// Adapted for Pac-Man Learning Lab. See LICENSE and THIRD_PARTY.md.\n(function(){\nvar i;\nvar Math = Object.create(globalThis.Math);\nvar silent = function(){};\nvar audio = new Proxy({}, {get: function(){return new Proxy(silent,{get:function(){return silent;}});}});\nvar executive = {setUpdatesPerSecond:silent,getFramePeriod:function(){return 1000/60;},isPaused:function(){return false;},getFps:function(){return 60;}};\n`;
for (const name of names) {
  let source = await readFile(new URL(`third_party/pacman/src/${name}.js`, base), 'utf8');
  if (name === 'energizer') source = source.replace('save: save,', 'stats: function(){return [count || 0, getDuration(), pointsFramesLeft || 0];},\n        save: save,');
  if (name === 'ghostCommander') source = source.replace('save: save,', 'stats: function(){return [frame || 0, command || 0];},\n        save: save,');
  if (name === 'ghostReleaser') source = source.replace('save: save,', 'stats: function(){return [framesSinceLastDot || 0, mode || 0, globalCount || 0, ghostCounts[1] || 0, ghostCounts[2] || 0, ghostCounts[3] || 0];},\n        save: save,');
  // Audio is intentionally disabled; no wall-clock callbacks in the simulation.
  if (name === 'fruit') source = source.replace('setTimeout(ghosts[0].playSounds, 500);', '');
  code += `\n// upstream: src/${name}.js\n${source}\n`;
}
code += await readFile(new URL('../src/engine-adapter.js', import.meta.url), 'utf8');
code += '\n})();\n';
await mkdir(new URL('public/engine/', base), { recursive: true });
await writeFile(new URL('public/engine/pacman.js', base), code);
await copyFile(new URL('third_party/pacman/font/ARCADE_R.TTF', base), new URL('public/engine/ARCADE_R.TTF', base));
await copyFile(new URL('third_party/pacman/LICENSE', base), new URL('public/engine/LICENSE', base));

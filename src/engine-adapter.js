// This file is appended INSIDE the upstream game's closure by build-engine.mjs.
// No scheduler, keyboard input, attract mode, or automatic game execution is included.
var labFrames = 0, labPlayFrames = 0, labDecisions = 0, labDeaths = 0, labClears = 0, labStall = 0;
var labTimeout = false, labSeed = 1, labRng = 1, labInitialized = false;
Math.random = function() {
    labRng = (labRng + 0x6D2B79F5) | 0;
    var t = labRng;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
// Dashboard owns persistence and controls; upstream menus and cutscenes are unused.
saveHighScores = function() {};
highScores = highScores.map(function(){return 0;});
triggerCutsceneAtEndLevel = function() { return false; };
var labPhase = function() {
    if (labTimeout) return 'timeout';
    if (state === playState) return 'playing';
    if (state === deadState) return 'dead';
    if (state === finishState) return 'cleared';
    if (state === overState) return 'over';
    return 'ready';
};
var labStatus = function() {
    return { phase: labPhase(), frames: labFrames, playFrames:labPlayFrames, decisions: labDecisions, score: getScore(), level: level,
      lives: state === overState ? 0 : extraLives + (state === deadState ? 0 : 1),
      deaths: labDeaths, clears: labClears, stalled: labStall, seed: labSeed,
      gameOver: labTimeout || state === overState, timeout: labTimeout,
      player: {x:pacman.pixel.x,y:pacman.pixel.y}, ai:pacman.ai, invincible:pacman.invincible };
};
var labObserve = function() {
    var grid = new Uint8Array(28*36);
    for (var n=0; n<grid.length; n++) {
        var c = map.currentTiles[n];
        grid[n] = c === '.' ? 2 : c === 'o' ? 3 : c === ' ' ? 1 : 0;
    }
    var scalars = new Float32Array(64);
    [pacman].concat(ghosts).forEach(function(a, n) {
        var offset = n*8;
        scalars[offset] = a.pixel.x / (28*8);
        scalars[offset+1] = a.pixel.y / (36*8);
        scalars[offset+2+(a.dirEnum || 0)] = 1;
        scalars[offset+6] = a.scared ? 1 : 0;
        scalars[offset+7] = (a.mode || 0)/6;
    });
    var es = energizer.stats(), cs = ghostCommander.stats(), rs = ghostReleaser.stats();
    scalars.set([level/256, extraLives/5, map.dotsEaten/map.numDots, energizer.isActive()?1:0,
        es[0]/360, es[1]/360, es[2]/60, cs[0]/72000, cs[1], fruit.isPresent()?1:0,
        fruit.pixel.x/(28*8), fruit.pixel.y/(36*8), (fruit.framesLeft||0)/540,
        rs[0]/240, rs[1], rs[2]/244, rs[3]/244, rs[4]/244, rs[5]/244, labStall/1000], 40);
    return {grid:grid, scalars:scalars};
};
var labRender = function() {
    if (!labInitialized || globalThis.__PACLAB_HEADLESS__) return;
    renderer.beginFrame();
    state.draw();
    renderer.endFrame();
};
var labReset = function(seed) {
    labSeed = seed >>> 0;
    labRng = labSeed;
    labFrames = labPlayFrames = labDecisions = labDeaths = labClears = labStall = 0;
    labTimeout = false;
    gameMode = GAME_PACMAN;
    practiceMode = false;
    turboMode = false;
    newGameState.setStartLevel(1);
    switchState(newGameState);
    // Initialize the ready screen without advancing a simulation frame.
    extraLives = 2;
    state = readyNewState;
    renderer.drawMap();
    pacman.ai = pacman.invincible = false;
    return labObserve();
};
var labStep = function(action) {
    if (!Number.isInteger(action) || action<0 || action>3) throw new Error('Invalid direction');
    if (labTimeout || state === overState) throw new Error('Reset is required after game over');
    var playing = state === playState;
    var score = getScore(), death = false, cleared = false, advanced = 0;
    pacman.setInputDir([DIR_UP,DIR_RIGHT,DIR_DOWN,DIR_LEFT][action]);
    for (var n=0;n<4;n++) {
        var before = state;
        state.update();
        if (before === playState) labPlayFrames++;
        labFrames++; advanced++;
        if (before === playState && state === deadState) { death = true; labDeaths++; break; }
        if (before === playState && state === finishState) { cleared = true; labClears++; break; }
        if (state === overState || (!playing && state === playState)) break;
    }
    var delta = getScore()-score;
    if (playing) {
        labDecisions++;
        labStall = delta>0 || death || cleared ? 0 : labStall+1;
        if (labStall >= 1000) labTimeout = true;
    }
    var info = labStatus();
    return { observation:labObserve(), reward:playing ? delta/10-(death?10:0)-0.01+(cleared?50:0) : 0,
        terminal:death||labTimeout, trainable:playing, death:death, cleared:cleared, frames:advanced, info:info };
};
globalThis.PacLab = {
    init: function() {
        if (labInitialized) return;
        if (globalThis.__PACLAB_HEADLESS__) renderer = new Proxy({}, {get:function(){return function(){};}});
        else { initRenderer(); atlas.create(); }
        labInitialized = true;
        labReset(1);
        labRender();
        if (!globalThis.__PACLAB_HEADLESS__) window.addEventListener('resize',function(){setTimeout(labRender,120);});
    },
    reset:labReset, observe:labObserve, step:labStep, render:labRender, status:labStatus
};
// Test-only fixtures exist only in a Node VM explicitly marked headless.
if (globalThis.__PACLAB_HEADLESS__) globalThis.PacLab.fixture = function(kind) {
    if (kind === 'play') switchState(playState);
    if (kind === 'collision' || kind === 'frightened' || kind === 'death-next') {
        switchState(playState);
        ghosts[0].setPos(pacman.pixel.x,pacman.pixel.y);
        ghosts[0].mode = GHOST_OUTSIDE;
        if (kind === 'frightened') energizer.activate();
        if (kind !== 'death-next') return playState.isPacmanCollide();
    }
    if (kind === 'last-life') extraLives = 0;
    if (kind === 'clear') { switchState(playState); map.dotsEaten = map.numDots; }
    if (kind === 'timeout') { switchState(playState); labStall = 999; }
    if (kind === 'energize') energizer.activate();
    if (kind === 'pellet') { switchState(playState); map.currentTiles[map.posToIndex(pacman.tile.x,pacman.tile.y)]='.'; }
};

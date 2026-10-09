# Pac-Man Learning Lab

A local Pac-Man experiment using Double DQN reinforcement learning. The model starts with random weights. The game does **not** run until you click **Start Training**.

## Open the app

On Windows, double-click **Start Learning Lab.cmd**. It builds the app when needed, starts a localhost server and opens the dashboard. Opening the page does not start a game, run evaluation, or update the neural network.

For development (Node.js 22.12+ or 24 recommended):

```powershell
npm.cmd install
npm.cmd run dev
```

Open http://localhost:5173. Keep this same address to use the same browser storage.

## Controls

- **Start Training:** starts normal-speed gameplay from an untrained network, or the loaded checkpoint. It explores, remembers transitions, and learns after collecting 1,000 experiences.
- **Pause / Resume:** pauses game advancement; any already-running optimizer operation finishes before the pause is acknowledged and saved. Pending inference cannot issue a move after pausing.
- **Speed:** 1× follows the game's 60 Hz simulation with one decision every four frames. 5× and Maximum accelerate that same simulation. Actual speed depends on hardware and learning cost.
- **Watch Learned Agent:** plays greedily, with no exploration or weight updates. Available after at least one optimizer update. Starting a different mode begins a new game; learned weights are retained.
- **Evaluate against random:** plays 20 paired environment seeds, once per policy, without modifying the model or training history. Reports mean score, active survival time, and levels cleared. Each game is capped at 20 simulated minutes or 1,000 scoreless decisions. This can take a while at 1×; use Maximum if desired.
- **Export / Import backup:** moves a single JSON checkpoint containing both networks, counters, settings, and statistics. Import leaves the dashboard idle.
- **Reset Learning:** confirms before deleting progress and returning to random weights.

Switching away from the tab automatically pauses; returning does not resume. Reloading restores weights and recorded statistics but begins idle with a new game and an empty replay buffer. Adam optimizer moments also restart. There is no background service doing learning after the tab closes. Use Pause before closing to finish saving; abrupt browser termination may lose changes since the last checkpoint. Saved checkpoints commit atomically to IndexedDB after completed training games and on Pause. Export backups before clearing browser data.

## Learning design

The original game's mechanics and ghost logic come from masonicGIT/pacman. The adapter exposes `reset(seed)`, `observe()`, `step(action)`, `render()`, and `status()`. Directions are up, right, down, left. Rendering never advances simulation, and random ghost turns use a per-game seeded RNG.

Observations contain a packed 28×36 maze plus 64 scalar features: actor positions and directions, ghost modes, frightened state and timers, level, lives, fruit position and lifetime, pellet counts, ghost-release counters, and stall progress. The network receives ten spatial channels plus the scalar features. It sees current state, not future routes or a scripted move recommendation.

The model has two convolutional layers (16 and 32 filters, stride 2), a 128-unit dense layer and four Q-value outputs. Double DQN selects the next action using the online network and evaluates it using the target network. A terminal life-loss or timeout does not bootstrap. Non-playing ready/death/level animations are not added to replay.

| Setting | Value |
| --- | --- |
| Replay capacity / batch | 10,000 / 32 |
| Warmup | 1,000 transitions, including after reload |
| Discount / Adam rate | 0.99 / 0.0003 |
| Update cadence | Every four decisions |
| Target synchronization | Every 1,000 optimizer updates |
| Exploration | 100% → 5% over 100,000 decisions |
| Loss | Huber |
| Reward | Score delta ÷ 10, −10 per death, −0.01 per action, +50 per cleared level |

TensorFlow.js runs in a dedicated Web Worker, preferring WebGL when supported and falling back to CPU. Gameplay and rendering remain on the main thread. There is no remote inference, analytics, API key or pretrained model. All runtime assets are bundled locally.

The score graph and statistics show actual recorded data only. Improvement and mastery are not guaranteed. The first real training run is left to the user.

## Verification

```powershell
npm.cmd test
npm.cmd run test:browser
npm.cmd run build
```

Browser tests use installed Google Chrome. They check the idle app and backups; additional control tests use a fake game and fake worker. Neural-network tests use synthetic transitions only, including a separate browser worker which checks real gradients and IndexedDB restoration. Game unit tests use isolated headless fixtures, never a learning agent. No test clicks Start on the real Pac-Man training environment.

## Source and license

GPL-3.0-only. Original game copyright Shaun Williams, with contributions credited by the upstream project. See [THIRD_PARTY.md](THIRD_PARTY.md) and [LICENSE](LICENSE).

`scripts/build-engine.mjs` combines the original sources with our adapter. It omits original startup, input and animation scheduling, silences sound, and disables cutscenes. It adds read-only timer access and removes an audio-only wall-clock callback. Original maze movement, frightened timing, ghost release and scoring are preserved. This is a browser recreation, not a ROM emulator.

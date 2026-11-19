# Lost Storm RL

Trains our own model to play The Lost Storm through the headless simulation. The game stays in TypeScript (`sim/`); this folder is the Python trainer (PyTorch) that drives it.

## How it fits together

```
Python (rl/)                         Node (tools/rl/serve.ts, one process per worker)
  PPO / imitation  <-- binary frames over stdin/stdout -->  pool of arenas (sim/rl/pool.ts)
  Policy network                                             observe -> numbers (sim/rl/observe.ts)
                                                             action  -> commands (sim/rl/act.ts)
                                                             stepWorld, reward (sim/rl/reward.ts)
```

- **Arena** (`sim/rl/arena.ts`): the Hall of Time with its own monsters cleared, a bench hero with a random level (1-12), weapon and skill bar, and five waves of random packs. Every episode jitters skill damage, cooldowns, mana costs and monster life, damage and speed by up to 20%, so the model learns to read numbers instead of memorising them.
- **Decisions**: the model acts every 4 sim ticks (7.5 times a second). Each action is four choices: move (stay or one of 8 directions), skill (none or one of 6 slots), target (one of the 8 nearest foes), use (none, one of 2 flasks, or pick up the nearest thing on the ground the pickup rule wants and the bag can hold).
- **Pickup rule**: each arena rolls a lowest rarity worth taking (from "take everything" up to "take nothing but gold"). The hero sees the rule and its free bag space, and every loot token carries its rarity, its gold amount, whether the rule wants it and whether it fits. After each wave a few items of random rarity fall near the hero, so the model learns to take what the rule asks for and walk past the rest. A player's own loot filter will feed the same input.
- **Reward**: damage dealt as a share of the foe's life, +0.5 a kill, +2 a wave, +3 for clearing all waves, +0.1 for picking up gold with no foe within 6 m, and +0.1 x (1 + its rarity share) for an item the rule wants; damage taken as a share of the hero's life x2, -3 for dying, and a small cost per decision. After the last wave the arena stays open up to 5 s, or until nothing the rule wants is left, so there is time to loot.
- **Dodging**: the hero reads, for standing still and each of the 8 move directions, whether a blow winding up, a delayed strike, a hazard or burning ground will catch it there (`sim/rl/danger.ts`, the same check the scripted bot dodges by). It also reads its own last two decisions (each head as a one-hot), the damage it took and dealt in the last second, how long since it was last hit and whether that hit came from something out of view, and up to four foes it saw in the last 5 s that dropped out of its view, at their last seen spot (`sim/rl/recall.ts`). Entity slots are sorted by distance, so raw past snapshots would not line up; these features are worked out in the sim instead.

## The contract, and why game updates do not throw training away

`sim/rl/contract.ts` is the versioned contract between the game and the model: every input the model sees and every action it can take. Its fingerprint is pinned in `sim/rl/contract.test.ts`.

- Skills, monsters, projectiles and areas are described by their numbers (reach, area, damage, cooldown, delivery type, behaviour), never by their id. A buff or a nerf changes the numbers the model already reads. A new skill looks like a skill with numbers it has not tried yet. Keep training from the last checkpoint.
- The model reads the hero, each skill slot and each nearby thing as separate tokens through a small transformer. It picks a skill by scoring the slot's own token and a target by scoring the foe's token, so nothing is tied to a slot position or a monster name.
- The situation (`arena`, `duel`, `quest`, `roam`) and an objective direction are inputs from the start, so one model can learn every mode. `rival` (another player) and `objective` are already entity kinds.
- Each block has spare columns. A new feature can take a spare column without changing the shape.
- Changing the layout (a new delivery type, more slots) changes the fingerprint and fails the test. Raise `RL.version`, update the pinned fingerprint, and widen saved policies so their weights carry over.

## Setup

```bash
cd rl
uv sync
```

## Train

```bash
uv run python -m lost_storm_rl.train imitate --run arena-v1
uv run python -m lost_storm_rl.train ppo --run arena-v1 --start runs/arena-v1/imitate.pt --updates 300
uv run python -m lost_storm_rl.train eval --run arena-v1 --policy runs/arena-v1/latest.pt --episodes 32
```

- `imitate` records the scripted bot (`sim/bot.ts`) playing arenas and trains the policy to copy it, so PPO starts from something that already fights.
- `ppo` improves it by playing. Each update prints the win rate, deaths, mean return and waves cleared, and appends a row to `runs/<run>/log.csv`. Checkpoints go to `runs/<run>/policy-uNNNNN.pt` and `runs/<run>/latest.pt`.
- `eval` plays greedy episodes with a checkpoint and keeps every one as a replay.
- Replays are JSON files in `runs/<run>/replays/` and `runs/<run>/eval/`: the arena seed plus the action list. The sim is deterministic, so a replay plays the same fight again (`replayArena` in `sim/rl/replay.ts`).
- Watch a replay in the real game: run `npm run dev` and open `http://localhost:5193/play/?replay=/rl/runs/<run>/eval/<file>.json`. Add `&speed=2` (0.25 to 8) to play it faster. The watch mode exists only in the dev server; it saves nothing and takes no input, and a caption in the top-left corner names the replay, the wave and the outcome.

Everything under `runs/` is ignored by git.

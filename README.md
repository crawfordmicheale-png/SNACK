# Verdant Hollow

A browser-based top-down action RPG in the spirit of *The Legend of Zelda: A Link to
the Past* — screen-by-screen exploration, sword-and-shield combat, a dungeon with
keys and a boss — wrapped around a modern inventory and a persistent mastery system.

No game engine, no runtime dependencies, and no art assets: every tile, sprite,
icon and sound is generated procedurally in the browser at boot. The production
bundle is a single ~57 KB gzipped JavaScript file.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle into dist/
npm run verify   # build, serve, and run the browser smoke test
```

## Controls

| Key | Action |
| --- | --- |
| `WASD` / arrows | Move |
| `J` or `Space` | Swing sword — hold to charge a spin once Spin Cut is learned |
| `K` | Use the item in quick slot 1 |
| `1`–`4` | Use quick slots |
| `L` | Raise shield (blocks arrows, rocks and seeds you are facing) |
| `Shift` | Dash (requires the Pegasus Dash mastery) |
| `E` | Talk, read, open chests, unlock doors |
| `Tab` / `I` | Satchel |
| `U` | Mastery |
| `M` | Map |
| `Esc` | Pause / close |
| `N` | Mute |

The satchel is also fully mouse-driven: drag items between slots, onto equipment,
or onto the quick bar.

## The game

**Verdant Hollow** is a 4×3 screen overworld — village, woods, a river ford,
cliffs, barrows and a lake — leading north to **The Hollow Root**, a twelve-chamber
dungeon holding two small keys, a bow, a mini-boss and Thornmaw.

Five interiors (cottages, a smith, a herbalist, a bomb cave) hang off the
overworld. Every screen is hand-authored as an ASCII grid in
[`src/world/maps/`](src/world/maps); the legend lives in
[`tiledefs.ts`](src/world/tiledefs.ts).

### Combat

Enemies are small state machines rather than damage sponges, and each one asks a
different question:

- **Gel** hops in committed bursts — it is only dangerous mid-leap.
- **Octorok** lines itself up with you before spitting, so break the line.
- **Keese** rests, then swoops erratically and bounces off walls.
- **Stalfos** carries its shield on the side it is walking toward; hits from that
  face are deflected, so you have to get around it.
- **Thornling** is rooted and fires a three-seed fan — it controls space instead
  of chasing.
- **The Warden** alternates a plated advance with a telegraphed lunge, and is
  wide open for a beat after it commits.
- **Thornmaw** clamps shut except during its vulnerable phase; swinging at the
  shell only rings off it.

### Modern inventory

- 40-slot grid satchel with drag-and-drop, plus full keyboard navigation.
- Five equipment slots (weapon, shield, armor, two charms).
- Four quick slots bound to `1`–`4`, auto-assigned when you pick up something usable.
- Rarity tiers from common to legendary, with rolled prefix/suffix affixes —
  a *Keen Knight's Blade of the Fox* is a genuinely different item from a plain one.
- Tooltips compare against what you have equipped, with per-stat deltas.
- Sort by type, rarity, power or name; filter by category.

### Meta progression

Progression lives on the save file and is never reset — dying costs a quarter of
your rupees and nothing else. Every level grants a mastery mote, spent on five
sequential tracks:

| Track | What it buys |
| --- | --- |
| **Blade** | Damage, crits, the spin attack, and a full-health sword beam |
| **Archery** | Arrow and bomb damage, and piercing shots |
| **Vitality** | Permanent heart containers and damage reduction |
| **Arcane** | Magic capacity and regeneration |
| **Wayfaring** | Move speed, the dash, a loot magnet, luck, and map reveal |

Heart containers also come from Pieces of Heart (four to a container) and from
the boss. Everything is stored in one versioned `localStorage` slot; the game
autosaves every 25 seconds, on room rest, and on unload.

## Architecture

```
src/
  engine/     game loop, input, RNG, audio synthesis, dual-canvas presentation
  art/        procedural palette, tileset, actor sprites, item icons, effects
  world/      tile definitions, ASCII maps, global tile grid, room streaming
  game/       entities, player controller, enemies, boss, items, mastery, scene
  ui/         HUD, pause menu tabs, dialogue, shop, map, end screens
  save/       versioned localStorage persistence
  dev/        world reachability audit (used by the smoke test)
```

Two rendering layers sit on top of each other. The **game layer** is a fixed
320×208 buffer scaled by an integer factor with smoothing off, so sprites stay
pixel-crisp. The **UI layer** matches the display resolution, so inventory text
and menu chrome render sharply instead of being upscaled — pixel art where it
belongs, readable type where that matters.

The simulation runs on a fixed 1/60 s timestep so physics and animation timings
are deterministic regardless of frame rate.

### Audio

All sound is synthesised from oscillators and noise buffers at call time
([`engine/audio.ts`](src/engine/audio.ts)). Four looping songs — overworld,
village, dungeon and boss — are scheduled note-by-note against the AudioContext
clock, so music timing never depends on the render loop.

## Testing

`scripts/smoke.mjs` drives the built game in headless Chromium: it starts a new
save, opens every menu tab, navigates the hero across three screens by reading
back its live position, hunts and kills an enemy, and descends into the dungeon.
It fails on any console error, any map-validation warning, or any missed
behavioural assertion, and writes screenshots to `scripts/shots/`.

It also runs a **world reachability audit** ([`src/dev/audit.ts`](src/dev/audit.ts)):
a flood fill across every map, walking through doors, stairs, bombable walls and
locked doors, which asserts that every room, chest, NPC and transition can
actually be reached. Hand-authored ASCII maps are easy to get subtly wrong — this
caught a walled-in dungeon stairway and a cave exit that landed inside a cliff.

```bash
npm run verify
```

## Known limitations

- One save slot, and no way to rebind keys from inside the game.
- Touch devices are not supported; the game needs a keyboard.
- The dungeon map screen shows chest and boss markers for rooms you have
  visited, but there is no separate collectible dungeon map item in play yet.

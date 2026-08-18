# Verdant Hollow

A browser-based top-down action RPG in the spirit of *The Legend of Zelda: A Link to
the Past* — screen-by-screen exploration, sword-and-shield combat, two dungeons
with keys and bosses — wrapped around a modern inventory and a persistent mastery system.

No game engine, no runtime dependencies, and no art assets: every tile, sprite,
icon and sound is generated procedurally in the browser at boot. The production
bundle is a single ~60 KB gzipped JavaScript file.

**[Play it](https://crawfordmicheale-png.github.io/SNACK/)** — deployed from
`main` on every push, but only once the full test suite has passed. It works on
a phone; turn it sideways.

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

### On a phone or tablet

On-screen controls appear automatically on touch devices — a floating thumbstick
on the left, and sword / item / shield / interact buttons on the right, with a
BAG button for the satchel.

The stick is analog and materialises wherever your thumb lands rather than
sitting in one fixed spot. Everything is multi-touch, so you can move and swing
at the same time.

Where the controls sit depends on orientation: in **landscape** they occupy the
letterboxing either side of the picture, so nothing overlaps the game — this is
the better way to play, and the game says so once in portrait. In **portrait**
the picture is fitted above the controls instead.

Menus are driven by direct touch: tap a tab, tap an item to equip it, drag items
between slots, tap CLOSE to leave. Tapping anywhere advances dialogue, and the
quick slots along the bottom of the HUD are tap targets in their own right.

## The game

**Verdant Hollow** is a 4×4 screen overworld — village, woods, a river ford,
cliffs, barrows, a lake, a mill and a drowned marsh — leading north to
**The Hollow Root** and south-east to **The Drowned Bell**.

Five interiors hang off the village, plus a mill cottage and a bomb cave.
Every screen is hand-authored as an ASCII grid in
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
- **Wisp** is only solid when it gathers to strike. Swinging at the smear of
  light does nothing.
- **Crab** keeps its shell toward you while it sidesteps, then snaps. Hit it
  after it commits.
- **The Warden** alternates a plated advance with a telegraphed lunge, and is
  wide open for a beat after it commits.
- **The Bellwight** vanishes and reappears in a ring of motes; cut it while it
  hangs, ringing.
- **Thornmaw** clamps shut except during its vulnerable phase; swinging at the
  shell only rings off it.
- **Tideheart** is a drowned bell. Wait for the ring, then cut the clapper.

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
the bosses. Side favours for the herbalist, the smith and Tilly pay in ether,
a signet ring, and another heart piece. Everything is stored in one versioned
`localStorage` slot; the game autosaves every 25 seconds, on room rest, and on
unload.

The Hollow Root holds two small keys, a bow, a dungeon map, a compass, the
Warden and Thornmaw. The Drowned Bell, under the Sunken Steps, holds the
lantern, a second map and compass, the Bellwight and Tideheart.

## Architecture

```
src/
  engine/     game loop, input, RNG, audio synthesis, presentation, touch controls
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
([`engine/audio.ts`](src/engine/audio.ts)). Looping songs — overworld,
village, dungeon, drowned and boss — are scheduled note-by-note against the AudioContext
clock, so music timing never depends on the render loop.

## Deployment

`.github/workflows/pages.yml` publishes `dist/` to GitHub Pages on every push to
`main`. The deploy is gated on `npm run verify`, so a build that fails to typecheck
or a game that stops being playable never reaches the public URL.

The Vite build uses a relative `base`, so the bundle works unmodified from the
`/SNACK/` subpath Pages serves it under.

## Testing

`scripts/smoke.mjs` drives the built game in headless Chromium: it starts a new
save, opens every menu tab, navigates the hero across three screens by reading
back its live position, hunts and kills an enemy, and descends into the dungeon.
It fails on any console error, any map-validation warning, or any missed
behavioural assertion, and writes screenshots to `scripts/shots/`.

`scripts/touch-smoke.mjs` does the same for mobile, in an emulated phone in both
orientations, using **only** synthetic touches on the on-screen controls — no
keyboard events at all. It asserts that the thumbstick moves the hero, the sword
button swings, BAG opens the satchel and CLOSE shuts it, and that the picture
never collapses or slides under the control band.

It also runs a **world reachability audit** ([`src/dev/audit.ts`](src/dev/audit.ts)):
a flood fill across every map, walking through doors, stairs, bombable walls and
locked doors, which asserts that every room, chest, NPC and transition can
actually be reached. Hand-authored ASCII maps are easy to get subtly wrong — this
caught a walled-in dungeon stairway and a cave exit that landed inside a cliff.

```bash
npm run verify        # build, then both suites
npm run smoke         # desktop only
npm run smoke:touch   # mobile only
```

## Known limitations

- One save slot, and no way to rebind keys from inside the game.
- In portrait the picture is small — a 20x13 screen is always width-bound on a
  tall phone. Landscape is the intended way to play on mobile.

# Emberhold: Village Wars

A first-person shooter where every wall, roof tile and beam is an individual brick you can shoot, hammer or blow apart —
and where the village being defended (or levelled) is one somebody actually built.

Runs in the browser with WebGL 2. No build step, no external assets: all textures, models and audio are generated at boot.
CrazyGames SDK v3 is integrated.

## Play locally

Any static file server works (ES modules need `http://`, not `file://`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`. Outside CrazyGames the SDK is skipped automatically: saves go to `localStorage` and no ads are requested.

## Upload to CrazyGames

Zip the repository contents so that `index.html` is at the root of the archive (`index.html`, `style.css`, `src/`, `lib/`) and upload it
as an HTML5 game in the CrazyGames developer portal. Total size is about 2.5 MB. Use the portal's QA tool to check the SDK events below.

## Game modes

| Mode | What you do |
| --- | --- |
| **Campaign** | Ten story missions against Warlord Varro's Ashen Legion: defend your home, free captured masons, burn supply depots, a sniper hunt, a storm siege, a night vault heist, a launcher demolition run, a fortress assault, a last stand on *your own* village, and the citadel boss fight. Three stars per mission. |
| **Raid** | Attack rival villages for gold, materials and trophies. ★ 50 % razed · ★ Ember Heart shattered · ★ 80 % razed. Paste a friend's village code to raid the village they built. |
| **Defend** | Endless waves of raiders, breakers and sappers assault your village. Your guards, towers, turrets and mines fight with you. |
| **Build** | Fly or walk around your plot. Drop whole buildings (homes, economy, defences, decor) or lay individual bricks, beams, tiles and glass. Upgrade the Ember Hall to raise every limit. |

Progression: XP levels, trophy leagues, 8 weapons with five upgrade tiers, resource production that keeps running while you are away,
daily tribute, daily quests and achievements.

## Controls

| Key | Action |
| --- | --- |
| WASD / Shift / C or Ctrl / Space | Move / sprint / crouch (slide while sprinting) / jump and mantle |
| LMB / RMB | Fire / aim down sights |
| R, G, V | Reload, frag grenade, sledgehammer |
| 1 2 3, mouse wheel, Q | Switch weapon |
| F (hold) | End raid / retire from defence |
| Esc | Pause |
| **Build:** LMB / RMB / R / wheel / 1-5 / Z / F / Tab | Place / remove / rotate / next item / category / undo / walk-fly / free cursor |

## CrazyGames SDK integration (`src/sdk.js`)

| SDK call | Where |
| --- | --- |
| `SDK.init()` | Boot, before anything else. Falls back cleanly if the script is blocked or the environment is `disabled`. |
| `game.loadingStart / loadingStop` | Around asset generation and shader warm-up. |
| `game.gameplayStart / gameplayStop` | Mission start, resume, build mode ↔ pause, death, results, menus. |
| `game.happytime` | Every mission win. |
| `ad.requestAd('midgame')` | Leaving the results screen. Audio is muted and the simulation frozen while an ad is open. |
| `ad.requestAd('rewarded')` | Opt-in only: revive, double spoils, supply caravan. Rewards are granted only on `adFinished`. |
| `data.getItem / setItem` | Cloud save of the whole profile (falls back to `localStorage`). |
| `user.getUser`, auth listener | Player name in the top bar. |
| `game.settings.muteAudio` + settings listener | Respects the portal mute toggle. |
| `game.getInviteParam('v')` | A village code passed in an invite link opens a "raid a friend" prompt. |

## Honest notes

* **"Other people's villages"** — there is no game server. Rival villages on the raid list are procedurally generated clans
  scaled to your level, and the raids on your village while you are away are simulated from your defence rating.
  Real player-versus-player works through **village share codes**: copy yours, send it to a friend, and they raid the exact
  village you built. A server-backed matchmaking list would be the next step.
* **Graphics** — physically based shading, HDR + filmic tone mapping, bloom, soft shadows, procedural PBR brick/stone/wood
  surfaces, volumetric-style fog and a dynamic sky. It is not photorealistic in the way a console game with scanned assets is;
  everything is generated from code so the whole game stays a ~2.5 MB download.
* **Desktop only** — keyboard and mouse with pointer lock. There are no touch controls.

## Code map

```
index.html, style.css   page shell and UI styles
lib/                    three.js r187 (MIT) + post-processing addons
src/main.js             boot, main loop, state machine
src/world.js            brick grid, instanced rendering, surface shader, damage, structural collapse, debris
src/blueprints.js       building generators, village generator, share codes
src/terrain.js          ground, grass, trees, rocks, lake
src/render.js           renderer, sky, time-of-day presets, post-processing
src/player.js combat.js weapons.js   controller, ballistics, weapons and view models
src/actors.js nav.js    soldiers, turrets, mines, AI and pathfinding
src/modes.js story.js   mission engine and the campaign
src/build.js            village builder
src/game.js             profile, economy, quests, rewards
src/hud.js ui.js        HUD and menus
src/audio.js fx.js      synthesized audio, particles and weather
src/sdk.js              CrazyGames SDK wrapper
```

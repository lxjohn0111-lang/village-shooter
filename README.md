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
| **Campaign** | Ten days of war against Warlord Varro. It opens mid-action: Hollowmere is burning and you lead the villagers out. Chapters mix escorts, shell barrages, collapsing buildings, alarms with countdowns, counterattacks, Marek's last stand and a final escape from a falling citadel. After every chapter there is an evening at the hearth with one of the survivors (Marek, Wren, Tobias, Ilka), a reply to choose, and the village grows by a building. Bonds of 3 hearts unlock a perk per companion. |
| **Town Siege 4v4** | A whole town packed onto the map, mirrored so neither side is favoured, with a team Ember Shrine at each end. Shatter theirs, or reach 40 kills, or lead when 8 minutes run out. Respawns every 5 s. |
| **Build & Battle 1v1** | Both commanders get 60 seconds and 3000 build points to fortify their half (walls, towers, turrets, mines, bunkers, single bricks). Then both sides fight with two bots each until a shrine falls. Turrets, tower marksmen and mines you built defend for you. |
| **Defend** | Endless waves attack the village you built. |
| **Build** | Lay out your village brick by brick. |

## Multiplayer server

Matchmaking and relay live in `server/` (Node 18+, one dependency):

```bash
cd server
npm install
npm start
```

It listens on `PORT` (default 8787) and serves a health check at `/`. Players queue per mode; a match starts as soon as it is full, or 20 seconds after the first player queued, and bots take the empty slots. The lowest-numbered player in a match hosts the bots; if they leave, the next player takes over.

Point the game at it in one of these ways (first match wins): `?server=wss://your-host` in the page URL, `localStorage.emberhold_server`, `window.EMBER_SERVER`, or `DEFAULT_SERVER` in `src/net.js`. Without a reachable server every multiplayer match is played offline against bots after a 3-second search.

Any Node host works (Fly.io, Render, Railway, a VPS). Browsers on HTTPS pages need `wss://`, so put it behind TLS.

## Controls

| Key | Action |
| --- | --- |
| WASD / Shift / C or Ctrl / Space | Move / sprint / crouch (slide while sprinting) / jump and mantle |
| Tab | Scoreboard (multiplayer) |
| LMB / RMB | Fire / aim down sights (scoped: hold Shift to steady your breath) |
| Q / E | Lean left / right out of cover |
| R | Reload (with a round still chambered it is a faster tactical reload and you keep the +1) |
| G | Frag grenade — hold to cook, release to throw |
| V | Quick melee strike with the weapon butt |
| 1 2 3, mouse wheel | Switch weapon (3 is the sledgehammer) |
| F (hold) | End raid / retire from defence |
| Esc | Pause |
| **Build:** LMB / RMB / R / wheel / 1-5 / Z / F / Tab | Place / remove / rotate / next item / category / undo / walk-fly / free cursor |

## Combat model

* **Bullets are projectiles**: they have muzzle velocity, travel time and drop, punch through glass, planks and plaster, skip off stone and steel, and are drawn as tracers along their real path.
* **Recoil** follows a learnable per-weapon spray pattern; when you stop firing the aim settles most of the way back.
* **Enemies** look for cover (low walls, window sills, corners to lean round), pop up to fire in bursts, run dry and reload, call out what they are doing, and keep their heads down when rounds crack past them. Only a few may fire at you at once.
* **Helmets** on officers and heavies absorb a headshot and get knocked off; marksmen telegraph their shot.
* **Deaths are physical**: a 15-point verlet ragdoll takes over from the exact pose the soldier was in, driven by where and how hard the killing hit landed. Weapons are dropped (walk over them for ammunition), explosions throw bodies.

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

* **Multiplayer needs the server above.** Without it (or inside a sandbox that blocks WebSockets) matches run against bots only.
  Hits are decided by whoever fires and bots run on the host's machine, so there is no anti-cheat; it is built for friendly play.
* **Graphics** — physically based shading, HDR + filmic tone mapping, bloom, soft shadows, procedural PBR brick/stone/wood
  surfaces, volumetric-style fog and a dynamic sky. It is not photorealistic in the way a console game with scanned assets is;
  everything is generated from code so the whole game stays a ~2.5 MB download.
* **Phones and tablets** get touch controls: a floating move stick on the left, drag anywhere on the right to look (with light aim assist), and buttons for fire, aim, jump, crouch, reload, grenade, melee and weapon swap. Build mode has its own place / remove / rotate / fly buttons. Landscape only.

## Code map

```
index.html, style.css   page shell and UI styles
lib/                    three.js r187 (MIT) + post-processing addons
src/main.js             boot, main loop, state machine
src/world.js            brick grid, instanced rendering, surface shader, damage, structural collapse, debris
src/blueprints.js       building generators, village generator, share codes
src/terrain.js          ground, grass, trees, rocks, lake
src/render.js           renderer, sky, time-of-day presets, post-processing
src/player.js combat.js weapons.js   controller, projectile ballistics, weapon handling
src/geo.js guns.js models.js         geometry toolkit, detailed weapon and soldier models
src/actors.js ragdoll.js nav.js      skeletal animation + IK, AI, ragdoll deaths, pathfinding
src/modes.js story.js   mission engine, scripted set pieces and the campaign
src/pvp.js net.js       multiplayer modes and the network client
src/touch.js            touch controls
server/                 matchmaking + relay server
src/build.js            village builder
src/game.js             profile, economy, quests, rewards
src/hud.js ui.js        HUD and menus
src/audio.js fx.js      synthesized audio, particles and weather
src/sdk.js              CrazyGames SDK wrapper
```

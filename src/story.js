// Campaign: ten missions following the war against Warlord Varro's Ashen Legion.
import { GX } from './util.js';
import { genVillage, starterVillage, footprint } from './blueprints.js';

const C = GX >> 1;
const m = (v) => Math.round((C + v * 4) / 2) * 2;      // metres from centre -> cell coordinate
function add(v, t, x, z, r = 0, l = 1) { const fp = footprint(t, r); v.b.push({ t, x: m(x) - (fp[0] >> 1), z: m(z) - (fp[1] >> 1), r, l }); return v; }
// drop records that overlap a rectangle (metres) so set-pieces can be placed
function clearArea(v, x0, z0, x1, z1) { v.b = v.b.filter((b) => { const fp = footprint(b.t, b.r); const bx0 = (b.x - C) / 4, bz0 = (b.z - C) / 4, bx1 = bx0 + fp[0] / 4, bz1 = bz0 + fp[1] / 4; return b.t === 'hall' || bx1 < x0 || bx0 > x1 || bz1 < z0 || bz0 > z1; }); return v; }

export const PROLOGUE = [
  'The world did not end in fire. It ended in cold.',
  'When the long winter came, the old engineers left us one last gift: the Ember Hearts — stones that burn without fuel, enough to keep a village alive.',
  'Where there is warmth, there are people. Where there are people, someone comes to take it.',
  'Warlord Kael Varro and his Ashen Legion have been ripping the Hearts out of village after village to feed the furnace of his citadel.',
  'Tonight they have come for Hollowmere. For yours.',
];

export const STORY = [
  {
    id: 's1', title: 'Ashes of Hollowmere', sub: 'Chapter 1 — The Raid', env: 'dusk', kind: 'defend', primary: 'rifle',
    brief: 'Legion scouts have found Hollowmere. Old Marek is barring the hall. Grab your rifle, hold the square, and keep them off the Ember Heart until the last of them breaks.',
    village: () => { const v = starterVillage(); return v; },
    allies: 2, level: 1, spawn: { x: 0, z: 14, yaw: Math.PI },
    waves: [[['scout', 3]], [['scout', 2], ['guard', 3]], [['guard', 4], ['scout', 3], ['brute', 1]]],
    stages: [[{ type: 'waves', n: 3, text: 'Repel the Legion raiding parties' }, { type: 'protect', text: 'Keep the Ember Heart intact' }]],
    bonus: [{ type: 'coreHealth', pct: 85, text: 'Heart above 85%' }, { type: 'headshots', n: 5, text: 'Land 5 headshots' }],
    dialog: [
      { at: 'start', who: 'OLD MAREK', text: 'They are at the tree line! WASD to move, hold RIGHT MOUSE to aim down your sights. Make every round count, ranger.' },
      { at: 4, who: 'WREN', text: 'Wren here, on the ridge. Tap R to reload, G throws a grenade, and your sledge is on 3 if they get close.' },
      { at: 'wave2', who: 'WREN', text: 'More coming from the east. They will go straight for the Heart — do not let them reach the hall.' },
      { at: 'wave3', who: 'OLD MAREK', text: 'A Breaker! That brute will knock my walls down brick by brick. Drop him before he reaches the door!' },
      { at: 'win', who: 'OLD MAREK', text: 'They are running. But they will be back with more. We cannot just sit here and wait for it.' },
    ],
    reward: { gold: 600, wood: 500, stone: 500, iron: 60, ember: 3, xp: 400 },
  },
  {
    id: 's2', title: 'First Light', sub: 'Chapter 2 — The Masons', env: 'dawn', kind: 'assault', primary: 'rifle',
    brief: 'The Legion took three of our masons when they fled. Wren tracked them to a palisade outpost in the fog. Break the cages — shoot the bars or swing your sledge — and bring our builders home.',
    village: () => { const v = genVillage(2201, 3, { legion: true }); clearArea(v, -9, 6, 9, 13); add(v, 'cage', -7, 9); add(v, 'cage', 7, 9); clearArea(v, -12, -16, -6, -10); add(v, 'cage', -9, -13); return v; },
    level: 2, legion: true, extra: [['guard', 4], ['scout', 2]],
    stages: [[{ type: 'rescue', n: 3, text: 'Free the captured masons' }]],
    bonus: [{ type: 'headshots', n: 6, text: 'Land 6 headshots' }, { type: 'time', sec: 300, text: 'Finish in under 5:00' }],
    dialog: [
      { at: 'start', who: 'WREN', text: 'Fog is on our side. Three cages inside the palisade. Iron bars — your sledge will open them faster than bullets.' },
      { at: 'alert', who: 'WREN', text: 'They have seen you! Watch the tower — marksmen take a second to line up their shot. You will see the glint.' },
      { at: 'rescue1', who: 'MASON', text: 'Bless you, ranger! I will make for the trees!' },
      { at: 'win', who: 'OLD MAREK', text: 'All three, alive. With masons we can build real walls. Open the BUILD menu — Hollowmere is yours to shape now.' },
    ],
    reward: { gold: 900, wood: 700, stone: 900, iron: 100, ember: 3, xp: 550 }, unlockText: 'Village building unlocked — design your own defences.',
  },
  {
    id: 's3', title: 'The Quarry Road', sub: 'Chapter 3 — Starve the Furnace', env: 'noon', kind: 'assault', primary: 'rifle',
    brief: 'Varro\'s columns move on full bellies. A Legion supply camp sits on the quarry road, stacked with crates and blackpowder. Burn all four depots. Powder kegs are red — shoot one and stand well back.',
    village: () => { const v = genVillage(3307, 5, { legion: true }); return v; },
    level: 4, legion: true, extra: [['guard', 5], ['heavy', 1]],
    stages: [[{ type: 'raze', kinds: ['depot'], n: 4, text: 'Destroy the supply depots' }], [{ type: 'extract', text: 'Get clear — return to the tree line' }]],
    bonus: [{ type: 'time', sec: 330, text: 'Finish in under 5:30' }, { type: 'explosiveKills', n: 4, text: '4 kills with explosions' }],
    dialog: [
      { at: 'start', who: 'WREN', text: 'Four depots under canvas. Every keg you light takes the roof, the crates and half the guards with it.' },
      { at: 'raze2', who: 'WREN', text: 'Two down! The whole camp is awake now — a heavy gunner is moving up. Use the walls, he will chew through them.' },
      { at: 'stage1', who: 'OLD MAREK', text: 'That is the lot. Get out of there before the column arrives!' },
      { at: 'win', who: 'WREN', text: 'They will be eating boot leather for a month. Varro will have noticed us now.' },
    ],
    reward: { gold: 1400, wood: 900, stone: 900, iron: 220, ember: 4, xp: 750 },
  },
  {
    id: 's4', title: 'Long Watch', sub: 'Chapter 4 — Officers First', env: 'golden', kind: 'assault', primary: 'sniper',
    brief: 'A Legion garrison holds Thornwick, and its officers are the only thing keeping conscripts on the walls. Wren is lending you her Longbow. Remove the marksmen and the Hall Guards — the rest will scatter.',
    village: () => genVillage(4410, 8, { legion: false }),
    level: 6, legion: true, look: 'legion', extra: [['elite', 3], ['guard', 3]],
    stages: [[{ type: 'killType', kinds: ['sentry'], text: 'Eliminate the tower marksmen' }, { type: 'killType', kinds: ['elite'], text: 'Eliminate the Legion officers' }]],
    bonus: [{ type: 'headshots', n: 8, text: 'Land 8 headshots' }, { type: 'nodamage', hp: 120, text: 'Take less than 120 damage' }],
    dialog: [
      { at: 'start', who: 'WREN', text: 'Hold RIGHT MOUSE for the scope. The .338 goes clean through a stone block — if they hide behind a wall, shoot the wall.' },
      { at: 'alert', who: 'WREN', text: 'They are searching for you. Move after every shot and they will never find the range.' },
      { at: 'win', who: 'WREN', text: 'Conscripts are throwing down their rifles. Thornwick is free. Keep the Longbow — you have earned it.' },
    ],
    reward: { gold: 1800, wood: 900, stone: 1200, iron: 300, ember: 5, xp: 950 }, grant: 'sniper', unlockText: 'Longbow .338 added to your armory.',
  },
  {
    id: 's5', title: 'Stormbreak', sub: 'Chapter 5 — The Alliance', env: 'storm', kind: 'defend', primary: null,
    brief: 'Thornwick has sworn to stand with us — so Varro means to make an example of it. A full assault column is coming through the storm with Breakers and Sappers. Fight beside the garrison and hold the Heart.',
    village: () => genVillage(4410, 8, {}),
    allies: 6, level: 7, spawn: { x: 0, z: 13, yaw: Math.PI },
    waves: [[['guard', 5], ['scout', 3]], [['guard', 4], ['brute', 2], ['sapper', 2]], [['guard', 5], ['heavy', 1], ['sapper', 3], ['scout', 3]], [['brute', 3], ['heavy', 2], ['guard', 6], ['sapper', 2]]],
    stages: [[{ type: 'waves', n: 4, text: 'Break the Legion assault' }, { type: 'protect', text: 'Defend Thornwick\'s Ember Heart' }]],
    bonus: [{ type: 'coreHealth', pct: 70, text: 'Heart above 70%' }, { type: 'kills', n: 30, text: 'Personally kill 30 attackers' }],
    dialog: [
      { at: 'start', who: 'WREN', text: 'Lightning will show you their lines. Sappers carry satchel charges — if you hear the beeping, that wall is about to leave.' },
      { at: 'wave2', who: 'OLD MAREK', text: 'Sappers on the north wall! Shoot the ones with the satchels first!' },
      { at: 'wave4', who: 'WREN', text: 'This is everything they have left. Hold. HOLD!' },
      { at: 'win', who: 'OLD MAREK', text: 'Two villages, one wall. Word of this will travel faster than Varro can march.' },
    ],
    reward: { gold: 2600, wood: 1600, stone: 1600, iron: 420, ember: 6, xp: 1300 },
  },
  {
    id: 's6', title: 'The Vault of Kings', sub: 'Chapter 6 — War Chest', env: 'night', kind: 'assault', primary: null,
    brief: 'An army needs paying. The Legion keeps its plunder in the vaults at Greymoor — stone a metre thick, iron-barred doors. Break in, take twenty bars, and be gone before the garrison musters.',
    village: () => { const v = genVillage(6612, 11, {}); return v; },
    level: 9, legion: true, extra: [['guard', 4], ['elite', 2]],
    stages: [[{ type: 'loot', n: 20, text: 'Seize 20 gold bars from the vaults' }], [{ type: 'extract', text: 'Escape to the tree line' }]],
    bonus: [{ type: 'time', sec: 420, text: 'Finish in under 7:00' }, { type: 'loot', n: 30, text: 'Take 30 bars' }],
    dialog: [
      { at: 'start', who: 'WREN', text: 'Night raid. The lanterns will give their positions away. Vault walls are thick — go through the door, or bring something that goes bang.' },
      { at: 'loot5', who: 'OLD MAREK', text: 'Shoot the bars off the stacks and they are ours. Keep going!' },
      { at: 'stage1', who: 'WREN', text: 'That is enough to arm three villages. Run!' },
      { at: 'win', who: 'OLD MAREK', text: 'Ha! Varro\'s own gold will buy the powder that brings him down.' },
    ],
    reward: { gold: 4500, wood: 1200, stone: 1200, iron: 500, ember: 7, xp: 1600 },
  },
  {
    id: 's7', title: 'Blackpowder', sub: 'Chapter 7 — The Magazine', env: 'overcast', kind: 'assault', primary: 'launcher',
    brief: 'Every Legion siege gun is fed from one magazine at Cinder Ford. The masons have rebuilt an old grenade launcher for you. Level the bunkers and the depots — and try not to be standing next to them.',
    village: () => { const v = genVillage(7719, 12, { legion: true }); clearArea(v, -22, -22, -10, -12); add(v, 'bunker', -16, -17, 0); clearArea(v, 10, -22, 22, -12); add(v, 'bunker', 16, -17, 0); for (const [x, z] of [[-14, 12], [14, 12], [-18, -6], [18, -6], [0, -22]]) { clearArea(v, x - 2, z - 2, x + 2, z + 2); add(v, 'powder', x, z); } return v; },
    level: 11, legion: true, extra: [['guard', 5], ['heavy', 2], ['elite', 2]],
    stages: [[{ type: 'raze', kinds: ['bunker'], n: 2, text: 'Destroy the magazine bunkers' }, { type: 'raze', kinds: ['depot'], n: 3, text: 'Destroy the powder depots' }]],
    bonus: [{ type: 'explosiveKills', n: 10, text: '10 kills with explosions' }, { type: 'time', sec: 420, text: 'Finish in under 7:00' }],
    dialog: [
      { at: 'start', who: 'OLD MAREK', text: 'The Thumper lobs in an arc — aim high and let it drop behind their walls. Concrete takes more than one.' },
      { at: 'raze1', who: 'WREN', text: 'Did you feel that from there?! One bunker gone. The kegs inside do half the work for you.' },
      { at: 'win', who: 'WREN', text: 'Their siege guns are just expensive pipes now. There is only the citadel left between us and Varro.' },
    ],
    reward: { gold: 5200, wood: 1800, stone: 2200, iron: 800, ember: 8, xp: 2000 }, grant: 'launcher', unlockText: 'Thumper GL added to your armory.',
  },
  {
    id: 's8', title: 'Siegebreaker', sub: 'Chapter 8 — The Iron Gate', env: 'golden', kind: 'assault', primary: 'rocket',
    brief: 'Fort Vaskar guards the pass to the citadel: bastion towers, clockwork turrets, and a gatehouse nobody has ever forced. Nobody had a Ramrod. Silence the turrets, break the gate, and shatter the Heart they stole from Ashby.',
    village: () => genVillage(8823, 15, { legion: true }),
    level: 14, legion: true, extra: [['guard', 6], ['heavy', 2], ['elite', 3]],
    stages: [[{ type: 'killType', kinds: ['turret'], text: 'Destroy the sentry turrets' }, { type: 'raze', kinds: ['gate'], n: 1, text: 'Breach the gatehouse' }], [{ type: 'core', text: 'Shatter the stolen Ember Heart' }]],
    bonus: [{ type: 'time', sec: 540, text: 'Finish in under 9:00' }, { type: 'raze', kinds: ['bastion'], n: 2, text: 'Bring down 2 bastion towers' }],
    dialog: [
      { at: 'start', who: 'WREN', text: 'Rockets are few — use them on turrets and the gate. Rifle rounds for men, rockets for masonry.' },
      { at: 'stage1', who: 'OLD MAREK', text: 'The gate is down! The Heart is in the keep. It will not come quietly — get clear when it starts to scream.' },
      { at: 'win', who: 'WREN', text: 'Vaskar has fallen. The pass is open. I can see the glow of the citadel from here.' },
    ],
    reward: { gold: 7500, wood: 2400, stone: 3000, iron: 1200, ember: 10, xp: 2600 }, grant: 'rocket', unlockText: 'Ramrod RPG added to your armory.',
  },
  {
    id: 's9', title: 'The Longest Night', sub: 'Chapter 9 — Hollowmere Stands', env: 'night', kind: 'defend', primary: null, usePlayerVillage: true,
    brief: 'Varro has emptied his barracks. Everything he has left is marching on Hollowmere tonight — on the village YOU built. Six waves. Your walls, your towers, your guards. Make him regret every brick.',
    village: null, allies: 0, level: 15, spawn: { x: 0, z: 13, yaw: Math.PI },
    waves: [[['guard', 6], ['scout', 4]], [['guard', 5], ['brute', 3], ['sapper', 2]], [['heavy', 2], ['guard', 6], ['sapper', 3]], [['brute', 4], ['scout', 6], ['elite', 2]], [['heavy', 3], ['sapper', 4], ['guard', 6], ['elite', 2]], [['brute', 4], ['heavy', 3], ['elite', 4], ['sapper', 3], ['guard', 5]]],
    stages: [[{ type: 'waves', n: 6, text: 'Survive the night' }, { type: 'protect', text: 'Keep your Ember Heart burning' }]],
    bonus: [{ type: 'coreHealth', pct: 60, text: 'Heart above 60%' }, { type: 'kills', n: 45, text: 'Personally kill 45 attackers' }],
    dialog: [
      { at: 'start', who: 'OLD MAREK', text: 'This is our home and our walls. Whatever you built, ranger — tonight we find out if it was enough.' },
      { at: 'wave3', who: 'WREN', text: 'Heavy gunners in the line. They will shred timber — fall back to stone if you have it.' },
      { at: 'wave6', who: 'WREN', text: 'Last wave. I count his personal guard among them. He has nothing behind this.' },
      { at: 'win', who: 'OLD MAREK', text: 'Dawn. And the Heart still burns. Now, ranger... now it is our turn to knock on his door.' },
    ],
    reward: { gold: 9000, wood: 3500, stone: 3500, iron: 1500, ember: 12, xp: 3200 },
  },
  {
    id: 's10', title: "Vulture's Nest", sub: 'Chapter 10 — The Citadel', env: 'ashen', kind: 'assault', primary: null,
    brief: 'The Ashen Citadel. A dozen stolen Hearts feed the Black Heart at its core, and Kael Varro stands guard over it himself in plate no rifle has cracked. End the Legion. End him. Let the Hearts go home.',
    village: () => genVillage(10101, 19, { legion: true, hall: 5 }),
    level: 18, legion: true, boss: true, extra: [['guard', 6], ['heavy', 3], ['elite', 4]],
    stages: [[{ type: 'killType', kinds: ['turret'], text: 'Destroy the citadel turrets' }], [{ type: 'boss', text: 'Kill Warlord Varro' }], [{ type: 'core', text: 'Shatter the Black Heart' }]],
    bonus: [{ type: 'time', sec: 660, text: 'Finish in under 11:00' }, { type: 'headshots', n: 15, text: 'Land 15 headshots' }],
    dialog: [
      { at: 'start', who: 'WREN', text: 'Every village between here and the sea is watching that glow. Go and put it out.' },
      { at: 'stage1', who: 'VARRO', text: 'So. The mason\'s dog has come to my door. You broke my walls, ranger. Come — see what a wall is really made of.' },
      { at: 'bosshalf', who: 'VARRO', text: 'GUARDS! To me! I will bury you under your own rubble!' },
      { at: 'stage2', who: 'OLD MAREK', text: 'He is down! The Black Heart — break it, and every stone he stole goes cold in his vaults and warm in ours!' },
      { at: 'win', who: 'WREN', text: 'It is over. The Legion is ash. Go home, ranger... there are villages out there still raiding each other. Somebody ought to show them how it is done.' },
    ],
    reward: { gold: 20000, wood: 6000, stone: 6000, iron: 3000, ember: 30, xp: 6000 }, unlockText: 'Campaign complete — the title of Emberwarden is yours.',
  },
];

// Campaign: the war against Warlord Varro, told in ten days. Every chapter is followed by an evening at the hearth
// (a short scene with one of the survivors and a choice) and the village grows by one building.
import { GX } from './util.js';
import { genVillage, starterVillage, footprint } from './blueprints.js';

const C = GX >> 1;
const m = (v) => Math.round((C + v * 4) / 2) * 2;      // metres from centre -> cell coordinate
function add(v, t, x, z, r = 0, l = 1) { const fp = footprint(t, r); v.b.push({ t, x: m(x) - (fp[0] >> 1), z: m(z) - (fp[1] >> 1), r, l }); return v; }
function clearArea(v, x0, z0, x1, z1) { v.b = v.b.filter((b) => { const fp = footprint(b.t, b.r); const bx0 = (b.x - C) / 4, bz0 = (b.z - C) / 4, bx1 = bx0 + fp[0] / 4, bz1 = bz0 + fp[1] / 4; return b.t === 'hall' || bx1 < x0 || bx0 > x1 || bz1 < z0 || bz0 > z1; }); return v; }

// the people you fight beside
export const CAST = {
  marek: { name: 'Marek', role: 'Village chief', color: '#e08a3a', perk: '+10% gold from missions' },
  wren: { name: 'Wren', role: 'Scout', color: '#7ac46a', perk: 'Steadier scope' },
  tobias: { name: 'Tobias', role: 'Mason', color: '#c9a86a', perk: 'Buildings cost 10% less' },
  ilka: { name: 'Ilka', role: 'Field medic', color: '#e0607a', perk: '+20 max health' },
};
export const BOND_PERK = 3;      // bond level at which a companion's perk switches on

export const STORY = [
  {
    id: 's1', title: 'Run', sub: 'Day 1', env: 'dusk', kind: 'assault', primary: 'rifle', short: 'Hollowmere is burning. Get the villagers out.',
    village: () => genVillage(1101, 5, { open: true }), level: 2, legion: true, burning: 9,
    spawn: { x: -9, z: 9, yaw: 0.25 }, exit: { x: -4, z: -42, r: 6 },
    named: [{ name: 'MAREK', key: 'marek', type: 'elite', x: -7, z: 11, follow: true }],
    civilians: [{ x: -11, z: 10, name: 'ILKA' }, { x: -10, z: 12 }, { x: -12, z: 8 }, { x: -8, z: 13 }],
    stages: [[{ type: 'escort', n: 3, text: 'Lead the villagers to the forest' }], [{ type: 'survive', sec: 28, text: 'Hold the tree line' }]],
    bonus: [{ type: 'escortAll', text: 'Save everyone' }, { type: 'headshots', n: 4, text: '4 headshots' }],
    dialog: [
      { at: 'start', who: 'MAREK', text: 'THEY\'RE COMING! THEY\'RE COMING! Everyone to the north woods — RUN!' },
      { at: 3.5, who: 'MAREK', text: 'Ranger! Take the children through the square. I\'ll be right behind you!' },
      { at: 'stage1', who: 'ILKA', text: 'We made it to the trees… Grandfather, they\'re still coming!' },
      { at: 'win', who: 'MAREK', text: 'Hollowmere is gone. But we are not. Not while we breathe.' },
    ],
    events: [
      { at: 0.4, do: 'bark', name: 'MAREK', text: 'THEY\'RE COMING!' },
      { at: 2, do: 'reinforce', units: [['scout', 3]], side: 'south' },
      { at: 7, do: 'barrage', n: 3, near: 'ahead' },
      { at: 13, do: 'collapse', near: 'ahead' },
      { at: 16, do: 'reinforce', units: [['guard', 3], ['scout', 2]], side: 'south' },
      { every: 11, from: 20, until: 'stage1', do: 'barrage', n: 2, near: 'ahead' },
      { at: 'stage1', do: 'reinforce', units: [['guard', 4], ['brute', 1]], side: 'south' },
      { at: 'stage1', do: 'barrage', n: 3, near: 'player' },
    ],
    day: { n: 1, grow: 'house', growText: 'The survivors raised their first house', who: 'marek', line: 'You carried my granddaughter out of that fire. I won\'t forget it.', choices: [{ text: 'Anyone would have.', bond: 1, reward: { gold: 200 } }, { text: 'Then let\'s make them pay.', bond: 1, reward: { iron: 60 } }] },
    reward: { gold: 600, wood: 500, stone: 500, iron: 60, ember: 3, xp: 400 },
  },
  {
    id: 's2', title: 'First Light', sub: 'Day 2', env: 'dawn', kind: 'assault', primary: 'rifle', short: 'Free the captured masons and get them out.',
    village: () => { const v = genVillage(2201, 3, { legion: true }); clearArea(v, -9, 6, 9, 13); add(v, 'cage', -7, 9); add(v, 'cage', 7, 9); clearArea(v, -12, -16, -6, -10); add(v, 'cage', -9, -13); return v; },
    level: 2, legion: true, extra: [['guard', 4], ['scout', 2]], exit: { x: 0, z: 46, r: 6 },
    named: [{ name: 'WREN', key: 'wren', type: 'sentry', x: 7, z: 45, hold: true }],
    stages: [[{ type: 'rescue', n: 3, text: 'Break open the cages' }], [{ type: 'escort', n: 2, text: 'Get the masons to the trees' }]],
    bonus: [{ type: 'headshots', n: 6, text: '6 headshots' }, { type: 'time', sec: 300, text: 'Under 5:00' }],
    dialog: [
      { at: 'start', who: 'WREN', text: 'I\'ve got you covered from the ridge. Three cages — your sledge opens iron faster than bullets.' },
      { at: 'rescue1', who: 'TOBIAS', text: 'You came for us? You actually came!' },
      { at: 'stage1', who: 'WREN', text: 'They\'re ringing the bell! Move, before the whole garrison wakes up!' },
      { at: 'win', who: 'TOBIAS', text: 'Give me stone and a week, and I\'ll build you walls they can\'t break.' },
    ],
    events: [{ at: 'stage1', do: 'reinforce', units: [['guard', 4], ['scout', 3]], side: 'any' }, { at: 'stage1', do: 'timer', sec: 100, text: 'Escape before the garrison arrives' }],
    day: { n: 2, grow: 'stonehouse', growText: 'Tobias built a stone house', who: 'tobias', line: 'I\'ve never built anything that mattered before. Now everything does.', choices: [{ text: 'Build it to last.', bond: 1, reward: { stone: 400 } }, { text: 'Build it fast.', bond: 1, reward: { wood: 400 } }] },
    reward: { gold: 900, wood: 700, stone: 900, iron: 100, ember: 3, xp: 550 }, unlockText: 'Village building unlocked',
  },
  {
    id: 's3', title: 'The Quarry Road', sub: 'Day 3', env: 'noon', kind: 'assault', primary: 'rifle', short: 'Burn their supplies before the column arrives.',
    village: () => genVillage(3307, 5, { legion: true }), level: 4, legion: true, extra: [['guard', 5], ['heavy', 1]],
    stages: [[{ type: 'raze', kinds: ['depot'], n: 4, text: 'Destroy the supply depots' }, { type: 'timer', sec: 210, text: 'Before the column arrives' }], [{ type: 'extract', text: 'Get back to the tree line' }]],
    bonus: [{ type: 'time', sec: 240, text: 'Under 4:00' }, { type: 'explosiveKills', n: 4, text: '4 blast kills' }],
    dialog: [
      { at: 'start', who: 'WREN', text: 'Red kegs. Shoot one and stand well back.' },
      { at: 'raze2', who: 'WREN', text: 'Dust on the road — their column is early! Finish it!' },
      { at: 'stage1', who: 'MAREK', text: 'That\'s all of them. Now get out of there!' },
    ],
    events: [{ at: 'raze2', do: 'reinforce', units: [['guard', 4], ['heavy', 1], ['scout', 2]], side: 'north' }, { at: 'stage1', do: 'barrage', n: 4, near: 'player' }],
    day: { n: 3, grow: 'quarry', growText: 'A quarry yard opened', who: 'wren', line: 'You don\'t talk much. I like that. Most people talk right before they die.', choices: [{ text: '…', bond: 1, reward: { iron: 120 } }, { text: 'You\'re cheerful.', bond: 1, reward: { gold: 300 } }] },
    reward: { gold: 1400, wood: 900, stone: 900, iron: 220, ember: 4, xp: 750 },
  },
  {
    id: 's4', title: 'Long Watch', sub: 'Day 4', env: 'golden', kind: 'assault', primary: 'sniper', short: 'Take out their marksmen and officers. Wren spots for you.',
    village: () => genVillage(4410, 8, {}), level: 6, legion: true, extra: [['elite', 3], ['guard', 3]],
    named: [{ name: 'WREN', key: 'wren', type: 'sentry', x: -6, z: 46, hold: true }],
    stages: [[{ type: 'killType', kinds: ['sentry'], text: 'Kill the tower marksmen' }, { type: 'killType', kinds: ['elite'], text: 'Kill the officers' }]],
    bonus: [{ type: 'headshots', n: 8, text: '8 headshots' }, { type: 'nodamage', hp: 120, text: 'Take < 120 damage' }],
    dialog: [
      { at: 'start', who: 'WREN', text: 'Hold your breath with Shift. The .338 goes through a stone block — if they hide, shoot the wall.' },
      { at: 'alert', who: 'WREN', text: 'Mortar! They\'ve found us — keep moving!' },
      { at: 'win', who: 'WREN', text: 'Not bad, ranger. Keep the rifle. I\'ve got a spare.' },
    ],
    events: [{ every: 13, from: 'alert', until: 'win', do: 'barrage', n: 2, near: 'player' }],
    day: { n: 4, grow: 'tower', growText: 'A watchtower now guards the road', who: 'wren', line: 'My brother was a marksman. Varro took him at Ashby. I count every officer for him.', choices: [{ text: 'We\'ll count them together.', bond: 1, reward: { ember: 1 } }, { text: 'Revenge won\'t bring him back.', bond: 0, reward: { gold: 400 } }] },
    reward: { gold: 1800, wood: 900, stone: 1200, iron: 300, ember: 5, xp: 950 }, grant: 'sniper', unlockText: 'Longbow .338 unlocked',
  },
  {
    id: 's5', title: 'Stormbreak', sub: 'Day 5', env: 'storm', kind: 'defend', primary: null, short: 'Hold Thornwick through the storm.',
    village: () => genVillage(4410, 8, {}), allies: 4, level: 7, spawn: { x: 0, z: 13, yaw: Math.PI },
    named: [{ name: 'MAREK', key: 'marek', type: 'elite', x: 3, z: 12 }, { name: 'WREN', key: 'wren', type: 'sentry', x: -4, z: 4, hold: true }],
    waves: [[['guard', 5], ['scout', 3]], [['guard', 4], ['brute', 2], ['sapper', 2]], [['guard', 5], ['heavy', 1], ['sapper', 3], ['scout', 3]], [['brute', 3], ['heavy', 2], ['guard', 6], ['sapper', 2]]],
    stages: [[{ type: 'waves', n: 4, text: 'Break the assault' }, { type: 'protect', text: 'Protect the Ember Heart' }]],
    bonus: [{ type: 'coreHealth', pct: 70, text: 'Heart above 70%' }, { type: 'kills', n: 30, text: '30 kills' }],
    dialog: [
      { at: 'start', who: 'MAREK', text: 'Sappers carry satchels. When you hear beeping, that wall is leaving.' },
      { at: 'wave3', who: 'WREN', text: 'The east wall — it\'s coming down! Fall back!' },
      { at: 'wave4', who: 'MAREK', text: 'Last of them. Hold. HOLD!' },
      { at: 'win', who: 'MAREK', text: 'Two villages, one wall. Varro will hear of this.' },
    ],
    events: [{ at: 'wave3', do: 'collapse', type: ['wall', 'palisade', 'tower'], near: 'player' }],
    day: { n: 5, grow: 'forge', growText: 'A forge was lit', hall: true, who: 'ilka', line: 'I patched up eleven people tonight. Grandfather won\'t let me look at his arm.', choices: [{ text: 'I\'ll talk to him.', bond: 1, reward: { gold: 300 }, also: 'marek' }, { text: 'You saved eleven. Rest.', bond: 1, reward: { ember: 1 } }] },
    reward: { gold: 2600, wood: 1600, stone: 1600, iron: 420, ember: 6, xp: 1300 },
  },
  {
    id: 's6', title: 'The Vault of Kings', sub: 'Day 6', env: 'night', kind: 'assault', primary: null, short: 'Night heist. If the alarm goes off, you have 100 seconds.',
    village: () => genVillage(6612, 11, {}), level: 9, legion: true, extra: [['guard', 4], ['elite', 2]],
    stages: [[{ type: 'loot', n: 20, text: 'Steal 20 gold bars' }], [{ type: 'extract', text: 'Escape to the tree line' }]],
    bonus: [{ type: 'quiet', text: 'Never raise the alarm' }, { type: 'loot', n: 30, text: 'Take 30 bars' }],
    dialog: [
      { at: 'start', who: 'WREN', text: 'Stay out of the lantern light. Vault walls are thick — use the door, or something loud.' },
      { at: 'alert', who: 'MAREK', text: 'The alarm! Their garrison will be there in under two minutes!' },
      { at: 'stage1', who: 'WREN', text: 'That\'s enough to arm three villages. Run!' },
    ],
    events: [{ at: 'alert', do: 'timer', sec: 100, text: 'Garrison arrives' }, { at: 'stage1', do: 'reinforce', units: [['guard', 5], ['elite', 1]], side: 'any' }],
    day: { n: 6, grow: 'market', growText: 'Traders came to the new market', who: 'tobias', line: 'With that gold I can cast iron bars for every window. Nobody burns us out again.', choices: [{ text: 'Do it.', bond: 1, reward: { iron: 300 } }, { text: 'Feed people first.', bond: 1, reward: { gold: 600 }, also: 'ilka' }] },
    reward: { gold: 4500, wood: 1200, stone: 1200, iron: 500, ember: 7, xp: 1600 },
  },
  {
    id: 's7', title: 'Blackpowder', sub: 'Day 7', env: 'overcast', kind: 'assault', primary: 'launcher', short: 'Blow up their powder magazine. Everything chains.',
    village: () => { const v = genVillage(7719, 12, { legion: true }); clearArea(v, -22, -22, -10, -12); add(v, 'bunker', -16, -17, 0); clearArea(v, 10, -22, 22, -12); add(v, 'bunker', 16, -17, 0); for (const [x, z] of [[-14, 12], [14, 12], [-18, -6], [18, -6], [0, -22]]) { clearArea(v, x - 2, z - 2, x + 2, z + 2); add(v, 'powder', x, z); } return v; },
    level: 11, legion: true, extra: [['guard', 5], ['heavy', 2], ['elite', 2]],
    stages: [[{ type: 'raze', kinds: ['bunker'], n: 2, text: 'Destroy the bunkers' }, { type: 'raze', kinds: ['depot'], n: 3, text: 'Destroy the powder depots' }]],
    bonus: [{ type: 'explosiveKills', n: 10, text: '10 blast kills' }, { type: 'time', sec: 420, text: 'Under 7:00' }],
    dialog: [
      { at: 'start', who: 'TOBIAS', text: 'I rebuilt the Thumper myself. Aim high — it arcs over walls.' },
      { at: 'raze1', who: 'WREN', text: 'The whole east side just went up! Their mortars have your range — move!' },
      { at: 'win', who: 'WREN', text: 'Their siege guns are just pipes now. Only the pass is left.' },
    ],
    events: [{ at: 'raze1', do: 'collapse', near: 'player', n: 2 }, { every: 12, from: 'raze1', until: 'win', do: 'barrage', n: 2, near: 'player' }],
    day: { n: 7, grow: 'barracks', growText: 'Volunteers filled new barracks', who: 'marek', line: 'Thirty volunteers today. Children, some of them. I hate that we need them.', choices: [{ text: 'Then let\'s end it fast.', bond: 1, reward: { iron: 400 } }, { text: 'Train them well.', bond: 1, reward: { gold: 800 } }] },
    reward: { gold: 5200, wood: 1800, stone: 2200, iron: 800, ember: 8, xp: 2000 }, grant: 'launcher', unlockText: 'Thumper GL unlocked',
  },
  {
    id: 's8', title: 'Siegebreaker', sub: 'Day 8', env: 'golden', kind: 'assault', primary: 'rocket', short: 'Break the iron gate, shatter the stolen Heart, survive the counterattack.',
    village: () => genVillage(8823, 15, { legion: true }), level: 14, legion: true, extra: [['guard', 6], ['heavy', 2], ['elite', 3]],
    stages: [[{ type: 'killType', kinds: ['turret'], text: 'Destroy the turrets' }, { type: 'raze', kinds: ['gate'], n: 1, text: 'Breach the gate' }], [{ type: 'core', text: 'Shatter the stolen Heart' }], [{ type: 'survive', sec: 40, text: 'Survive the counterattack' }]],
    bonus: [{ type: 'time', sec: 540, text: 'Under 9:00' }, { type: 'raze', kinds: ['bastion'], n: 2, text: 'Topple 2 bastions' }],
    dialog: [
      { at: 'start', who: 'WREN', text: 'Rockets for masonry, bullets for people. Don\'t mix them up.' },
      { at: 'stage1', who: 'MAREK', text: 'The gate is down! The Heart is in the keep!' },
      { at: 'stage2', who: 'WREN', text: 'Counterattack from the pass! Find cover and hold!' },
      { at: 'win', who: 'MAREK', text: 'The pass is open. I can see the citadel glowing from here.' },
    ],
    events: [{ at: 'stage2', do: 'reinforce', units: [['guard', 6], ['brute', 2], ['heavy', 1]], side: 'north' }, { at: 'stage2', do: 'barrage', n: 4, near: 'player' }],
    day: { n: 8, grow: 'tudor', growText: 'A manor for the families of the fallen', who: 'ilka', line: 'Grandfather coughs blood when he thinks nobody sees. Please… keep him out of the next fight.', choices: [{ text: 'I promise.', bond: 1, reward: { ember: 1 } }, { text: 'He won\'t listen to me.', bond: 1, reward: { gold: 600 }, also: 'marek' }] },
    reward: { gold: 7500, wood: 2400, stone: 3000, iron: 1200, ember: 10, xp: 2600 }, grant: 'rocket', unlockText: 'Ramrod RPG unlocked',
  },
  {
    id: 's9', title: 'The Longest Night', sub: 'Day 9', env: 'night', kind: 'defend', primary: null, usePlayerVillage: true, short: 'Varro attacks the village you built. Six waves.',
    village: null, allies: 0, level: 15, spawn: { x: 0, z: 13, yaw: Math.PI },
    named: [{ name: 'MAREK', key: 'marek', type: 'elite', x: 2, z: 12 }, { name: 'WREN', key: 'wren', type: 'sentry', x: -3, z: 6, hold: true }],
    waves: [[['guard', 6], ['scout', 4]], [['guard', 5], ['brute', 3], ['sapper', 2]], [['heavy', 2], ['guard', 6], ['sapper', 3]], [['brute', 4], ['scout', 6], ['elite', 2]], [['heavy', 3], ['sapper', 4], ['guard', 6], ['elite', 2]], [['brute', 4], ['heavy', 3], ['elite', 4], ['sapper', 3], ['guard', 5]]],
    stages: [[{ type: 'waves', n: 6, text: 'Survive the night' }, { type: 'protect', text: 'Keep the Heart burning' }]],
    bonus: [{ type: 'coreHealth', pct: 60, text: 'Heart above 60%' }, { type: 'kills', n: 45, text: '45 kills' }],
    dialog: [
      { at: 'start', who: 'MAREK', text: 'Our walls. Our home. Whatever you built, ranger — tonight we see if it was enough.' },
      { at: 'wave6', who: 'MAREK', text: 'This is the last of them. I\'ll take the gate. Don\'t argue with an old man.' },
      { at: 'marekdown', who: 'WREN', text: 'MAREK! Marek\'s down at the gate!' },
      { at: 'win', who: 'ILKA', text: 'He held the gate until the very end. He always said he would.' },
    ],
    events: [{ at: 'wave6', do: 'killAlly', name: 'MAREK', after: 28, key: 'marekdown' }],
    day: { n: 9, grow: 'bastion', growText: 'A bastion was raised over Marek\'s grave', hall: true, who: 'ilka', line: 'He left you his banner. He said you\'d know what to do with it.', choices: [{ text: 'Finish what he started.', bond: 1, reward: { ember: 2 } }, { text: 'Lead them, Ilka. I\'ll fight.', bond: 1, reward: { gold: 1000 } }] },
    reward: { gold: 9000, wood: 3500, stone: 3500, iron: 1500, ember: 12, xp: 3200 },
  },
  {
    id: 's10', title: "Vulture's Nest", sub: 'Day 10', env: 'ashen', kind: 'assault', primary: null, short: 'Kill Varro. Break the Black Heart. Get out before the citadel falls.',
    village: () => genVillage(10101, 19, { legion: true, hall: 5 }), level: 18, legion: true, boss: true, extra: [['guard', 6], ['heavy', 3], ['elite', 4]],
    named: [{ name: 'WREN', key: 'wren', type: 'sentry', x: 6, z: 46, hold: true }],
    stages: [[{ type: 'killType', kinds: ['turret'], text: 'Destroy the citadel turrets' }], [{ type: 'boss', text: 'Kill Warlord Varro' }], [{ type: 'core', text: 'Shatter the Black Heart' }], [{ type: 'extract', text: 'Get out before it collapses' }, { type: 'timer', sec: 50, text: 'Citadel collapsing' }]],
    bonus: [{ type: 'time', sec: 720, text: 'Under 12:00' }, { type: 'headshots', n: 15, text: '15 headshots' }],
    dialog: [
      { at: 'start', who: 'WREN', text: 'For Marek. For my brother. For everyone. Let\'s go.' },
      { at: 'stage1', who: 'VARRO', text: 'The mason\'s dog. Come then — see what a wall is really made of.' },
      { at: 'bosshalf', who: 'VARRO', text: 'GUARDS! Bury this rat under his own rubble!' },
      { at: 'stage2', who: 'WREN', text: 'Varro\'s down! The Black Heart — break it!' },
      { at: 'stage3', who: 'WREN', text: 'The whole citadel is coming apart! RUN!' },
      { at: 'win', who: 'ILKA', text: 'It\'s over. Come home, ranger. Hollowmere is waiting.' },
    ],
    events: [{ at: 'stage3', do: 'collapse', near: 'player', n: 2 }, { every: 5, from: 'stage3', until: 'win', do: 'barrage', n: 2, near: 'player' }, { at: 'stage3', do: 'env', name: 'ashen' }],
    day: { n: 10, grow: 'banner', growText: 'Marek\'s banner flies over Hollowmere', who: 'wren', line: 'So. What now? There are still villages out there raiding each other.', choices: [{ text: 'Then we show them how.', bond: 1, reward: { ember: 3 } }, { text: 'Now we rest.', bond: 1, reward: { gold: 2000 } }] },
    reward: { gold: 20000, wood: 6000, stone: 6000, iron: 3000, ember: 30, xp: 6000 }, unlockText: 'Campaign complete',
  },
];

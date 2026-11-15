// Destructible building materials. `pat` selects the procedural surface in the piece shader.
// hp is for a standard 2-cell brick; larger pieces scale up. `res`/`cpc` = build cost per cell.
export const M = {
  BRICK: 0, STONE: 1, WOOD: 2, TIMBER: 3, TILE: 4, PLASTER: 5, METAL: 6, GLASS: 7, THATCH: 8,
  GOLD: 9, CONCRETE: 10, SANDBAG: 11, CRATE: 12, POWDER: 13, EMBER: 14, SLATE: 15, COBBLE: 16,
  CLOTH: 17, DARKBRICK: 18, HAY: 19, RUST: 20, MOSS: 21,
};

export const MATS = [
  { key: 'brick', name: 'Clay Brick', color: 0x9a4a35, vary: 0.34, rough: 0.9, metal: 0, pat: 0, hp: 70, snd: 'stone', res: 'stone', cpc: 0.5 },
  { key: 'stone', name: 'Ashlar Stone', color: 0x8d8a82, vary: 0.22, rough: 0.88, metal: 0, pat: 1, hp: 120, snd: 'stone', res: 'stone', cpc: 0.4 },
  { key: 'wood', name: 'Oak Plank', color: 0x9b7448, vary: 0.25, rough: 0.78, metal: 0, pat: 2, hp: 34, snd: 'wood', res: 'wood', cpc: 0.4 },
  { key: 'timber', name: 'Dark Timber', color: 0x6a4a30, vary: 0.26, rough: 0.82, metal: 0, pat: 2, hp: 55, snd: 'wood', res: 'wood', cpc: 0.6 },
  { key: 'tile', name: 'Terracotta Tile', color: 0xa5502f, vary: 0.3, rough: 0.72, metal: 0, pat: 3, hp: 26, snd: 'tile', res: 'stone', cpc: 0.3 },
  { key: 'plaster', name: 'Lime Plaster', color: 0xd9d0bb, vary: 0.08, rough: 0.95, metal: 0, pat: 4, hp: 36, snd: 'stone', res: 'stone', cpc: 0.25 },
  { key: 'metal', name: 'Wrought Iron', color: 0x4d5054, vary: 0.1, rough: 0.42, metal: 1, pat: 5, hp: 260, snd: 'metal', res: 'iron', cpc: 0.6 },
  { key: 'glass', name: 'Glass Pane', color: 0xbfd9e2, vary: 0.02, rough: 0.05, metal: 0, pat: 0, hp: 6, snd: 'glass', res: 'stone', cpc: 0.3 },
  { key: 'thatch', name: 'Thatch', color: 0xb49a55, vary: 0.25, rough: 1.0, metal: 0, pat: 6, hp: 16, snd: 'soft', res: 'wood', cpc: 0.2 },
  { key: 'gold', name: 'Gold Bar', color: 0xf2bd3a, vary: 0.06, rough: 0.24, metal: 1, pat: 7, hp: 40, snd: 'metal', res: 'gold', cpc: 20 },
  { key: 'concrete', name: 'Concrete', color: 0x9b9b96, vary: 0.08, rough: 0.86, metal: 0, pat: 8, hp: 210, snd: 'stone', res: 'stone', cpc: 0.8 },
  { key: 'sandbag', name: 'Sandbag', color: 0x9a8a63, vary: 0.2, rough: 1.0, metal: 0, pat: 9, hp: 95, snd: 'soft', res: 'wood', cpc: 0.25 },
  { key: 'crate', name: 'Supply Crate', color: 0x8a6a3c, vary: 0.2, rough: 0.8, metal: 0, pat: 10, hp: 22, snd: 'wood', res: 'wood', cpc: 0.3 },
  { key: 'powder', name: 'Blackpowder Keg', color: 0x8c1d14, vary: 0.06, rough: 0.55, metal: 0.2, pat: 11, hp: 9, snd: 'metal', res: 'iron', cpc: 1.5 },
  { key: 'ember', name: 'Ember Stone', color: 0xff7a1a, vary: 0.15, rough: 0.5, metal: 0, pat: 12, hp: 300, snd: 'glass', res: 'gold', cpc: 99 },
  { key: 'slate', name: 'Slate Tile', color: 0x4a5560, vary: 0.25, rough: 0.6, metal: 0, pat: 3, hp: 32, snd: 'tile', res: 'stone', cpc: 0.35 },
  { key: 'cobble', name: 'Field Stone', color: 0x77736a, vary: 0.4, rough: 0.94, metal: 0, pat: 1, hp: 100, snd: 'stone', res: 'stone', cpc: 0.35 },
  { key: 'cloth', name: 'Banner Cloth', color: 0xb02a2a, vary: 0.05, rough: 0.9, metal: 0, pat: 13, hp: 8, snd: 'soft', res: 'wood', cpc: 0.2 },
  { key: 'darkbrick', name: 'Ashen Brick', color: 0x4a4444, vary: 0.25, rough: 0.9, metal: 0, pat: 0, hp: 95, snd: 'stone', res: 'stone', cpc: 0.6 },
  { key: 'hay', name: 'Hay Bale', color: 0xc9a94f, vary: 0.15, rough: 1.0, metal: 0, pat: 6, hp: 14, snd: 'soft', res: 'wood', cpc: 0.15 },
  { key: 'rust', name: 'Rusted Plate', color: 0x7a4a30, vary: 0.3, rough: 0.7, metal: 0.7, pat: 5, hp: 200, snd: 'metal', res: 'iron', cpc: 0.5 },
  { key: 'moss', name: 'Mossy Stone', color: 0x6c7558, vary: 0.3, rough: 0.95, metal: 0, pat: 1, hp: 110, snd: 'stone', res: 'stone', cpc: 0.35 },
];
MATS.forEach((m, i) => { m.id = i; });

// piece flags
export const F_TILT = 7;        // bits 0-2: 0 none, 1..4 tilt dir (+x,+z,-x,-z)
export const F_LOOT = 8;
export const F_EXPLOSIVE = 16;
export const F_CORE = 32;
export const F_FREE = 64;       // hand-placed by the player in build mode

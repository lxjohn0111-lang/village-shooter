// Builds the CrazyGames upload: crazygames-upload/ (index.html, game.js, style.css, licenses.txt) and crazygames-upload.zip.
// All game code and three.js are bundled and minified into one game.js; the only external script is the CrazyGames SDK.
//   npm install && npm run build:crazygames
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'crazygames-upload');

// the source imports "three" and "three/addons/…" through an import map; point those at the vendored copy in lib/
const vendoredThree = {
  name: 'vendored-three',
  setup(b) {
    b.onResolve({ filter: /^three(\/addons\/.*)?$/ }, (args) => ({
      path: args.path === 'three' ? path.join(root, 'lib/three.module.js') : path.join(root, 'lib/addons', args.path.slice('three/addons/'.length)),
    }));
  },
};

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
await build({
  entryPoints: [path.join(root, 'src/main.js')], bundle: true, format: 'esm', minify: true, target: 'es2020',
  outfile: path.join(out, 'game.js'), legalComments: 'none', plugins: [vendoredThree], logLevel: 'warning',
});

// page: same as the dev index.html, minus the import map, loading the bundle instead of src/main.js
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace('<script type="module" src="src/main.js"></script>', '<script type="module" src="game.js"></script>');
if (!html.includes('sdk.crazygames.com/crazygames-sdk-v3.js')) throw new Error('index.html must load the CrazyGames SDK');
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.copyFileSync(path.join(root, 'style.css'), path.join(out, 'style.css'));
fs.writeFileSync(path.join(out, 'licenses.txt'), 'This game bundles three.js (https://threejs.org):\n\n' + fs.readFileSync(path.join(root, 'lib/THREE-LICENSE'), 'utf8'));

// zip (stored with deflate) without external tools
const files = fs.readdirSync(out).sort();
const zipPath = path.join(root, 'crazygames-upload.zip');
const parts = [], central = []; let offset = 0;
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
for (const name of files) {
  const data = fs.readFileSync(path.join(out, name)), comp = zlib.deflateRawSync(data, { level: 9 }), crc = crc32(data), nb = Buffer.from(name);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(0, 10);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26); lh.writeUInt16LE(0, 28);
  parts.push(lh, nb, comp);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(0, 12);
  ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(offset, 42);
  central.push(ch, nb); offset += 30 + nb.length + comp.length;
}
const cd = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.writeFileSync(zipPath, Buffer.concat([...parts, cd, end]));

for (const f of files) console.log(f.padEnd(14), (fs.statSync(path.join(out, f)).size / 1024).toFixed(0).padStart(6), 'KB');
console.log('zip'.padEnd(14), (fs.statSync(zipPath).size / 1024).toFixed(0).padStart(6), 'KB  ->', path.relative(root, zipPath));

// Renderer, sky, lighting, time-of-day presets and the post-processing chain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G, clamp, damp } from './util.js';

export const ENVS = {
  noon: { elev: 52, azim: 35, sun: 0xfff1dc, sunI: 3.6, zenith: 0x2a66c0, horizon: 0xb4d0ea, ground: 0x6a6a58, skyI: 1.0, fog: 0xb9cfe4, fogD: 0.0032, hemi: 0.5, cloud: 0.45, cloudCol: 0xffffff, stars: 0, exposure: 0.78, bloom: 0.22, tint: [1, 1, 1], sat: 1.06, amb: 'day' },
  golden: { elev: 13, azim: 248, sun: 0xffb56e, sunI: 3.3, zenith: 0x3565a6, horizon: 0xf3c595, ground: 0x6b5b48, skyI: 0.85, fog: 0xdcc0a4, fogD: 0.0024, hemi: 0.42, cloud: 0.55, cloudCol: 0xffd6ad, stars: 0, exposure: 0.92, bloom: 0.38, tint: [1.04, 1.0, 0.93], sat: 1.08, amb: 'day' },
  dawn: { elev: 7, azim: 95, sun: 0xffb08a, sunI: 2.4, zenith: 0x4b6fa3, horizon: 0xf0c2b4, ground: 0x5c5560, skyI: 0.7, fog: 0xd9c3c4, fogD: 0.013, hemi: 0.5, cloud: 0.35, cloudCol: 0xffd9cf, stars: 0, exposure: 0.95, bloom: 0.42, tint: [1.02, 0.99, 1.0], sat: 0.98, amb: 'day' },
  overcast: { elev: 44, azim: 140, sun: 0xcfd6dc, sunI: 1.5, zenith: 0x7c8894, horizon: 0xaab3bb, ground: 0x5a5d5a, skyI: 0.8, fog: 0xa5aeb6, fogD: 0.0075, hemi: 0.95, cloud: 0.98, cloudCol: 0xb9c0c6, stars: 0, exposure: 0.86, bloom: 0.18, tint: [0.97, 1.0, 1.02], sat: 0.9, amb: 'wind' },
  dusk: { elev: 3.5, azim: 285, sun: 0xff7b3d, sunI: 2.1, zenith: 0x2b3a70, horizon: 0xe9824f, ground: 0x4a3c3c, skyI: 0.6, fog: 0xb5765c, fogD: 0.006, hemi: 0.4, cloud: 0.6, cloudCol: 0xf0a47c, stars: 0.25, exposure: 1.05, bloom: 0.5, tint: [1.05, 0.98, 0.95], sat: 1.1, amb: 'night' },
  night: { elev: 42, azim: 200, sun: 0x9db8ff, sunI: 1.05, zenith: 0x040814, horizon: 0x101b30, ground: 0x05070b, skyI: 1.0, fog: 0x0e1828, fogD: 0.007, hemi: 0.62, cloud: 0.3, cloudCol: 0x26324a, stars: 1, exposure: 1.38, bloom: 0.75, tint: [0.94, 0.99, 1.08], sat: 0.92, amb: 'night', moon: true },
  storm: { elev: 48, azim: 60, sun: 0x9fabb8, sunI: 1.35, zenith: 0x2e363f, horizon: 0x59636d, ground: 0x30343a, skyI: 0.8, fog: 0x4d5762, fogD: 0.012, hemi: 1.05, cloud: 1.0, cloudCol: 0x525a64, stars: 0, exposure: 1.12, bloom: 0.3, tint: [0.94, 0.99, 1.05], sat: 0.82, amb: 'storm', rain: 1 },
  ashen: { elev: 9, azim: 300, sun: 0xff5a2a, sunI: 2.6, zenith: 0x24120f, horizon: 0xc04a22, ground: 0x2a1a15, skyI: 0.75, fog: 0x7a3a24, fogD: 0.0085, hemi: 0.4, cloud: 0.85, cloudCol: 0x6a3024, stars: 0, exposure: 1.0, bloom: 0.65, tint: [1.08, 0.96, 0.9], sat: 1.05, amb: 'wind', embers: 1 },
};

const SKY_VS = `varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FS = `varying vec3 vDir;
uniform vec3 uSunDir, uSunCol, uZenith, uHorizon, uGround, uCloudCol;
uniform float uCloud, uStars, uTime, uSkyI, uMoon, uFlash;
uniform sampler2D uNoise;
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));
  col = mix(col, uGround, smoothstep(0.0, -0.12, d.y));
  col *= uSkyI;
  float sd = max(dot(d, uSunDir), 0.0);
  if (uMoon > 0.5) {
    col += uSunCol * (smoothstep(0.9993, 0.9996, sd) * 3.0 + pow(sd, 90.0) * 0.12);
  } else {
    col += uSunCol * (pow(sd, 1400.0) * 40.0 + pow(sd, 120.0) * 0.3 + pow(sd, 9.0) * 0.1 * (1.0 - h * 0.6));
  }
  if (uStars > 0.01 && d.y > 0.0) {
    vec3 sp = d * 240.0; vec3 c = floor(sp);
    float hsh = fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float st = step(0.9965, hsh) * smoothstep(0.45, 0.05, length(fract(sp) - 0.5));
    col += vec3(0.9, 0.95, 1.0) * st * uStars * (0.5 + 0.5 * sin(uTime * 2.0 + hsh * 90.0)) * smoothstep(0.0, 0.25, d.y) * 1.6;
  }
  vec2 cuv = d.xz / (abs(d.y) + 0.16) * 0.11 + uTime * vec2(0.0035, 0.0012);
  float n = texture2D(uNoise, cuv).r * 0.58 + texture2D(uNoise, cuv * 2.7 + 0.31).r * 0.3 + texture2D(uNoise, cuv * 7.3).g * 0.12;
  float th = 0.86 - uCloud * 0.62;
  float cov = smoothstep(th, th + 0.26, n);
  float sh = texture2D(uNoise, cuv + uSunDir.xz * 0.025).r;
  float lit = clamp(0.6 + (n - sh) * 2.6, 0.1, 1.4);
  vec3 cc = uCloudCol * uSkyI * (0.38 + 0.72 * lit) + uSunCol * pow(sd, 6.0) * 0.28;
  cc += vec3(1.0) * uFlash * 2.5;
  col = mix(col, cc, cov * smoothstep(0.015, 0.2, d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

const FINAL_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.45 }, uGrain: { value: 0.03 }, uCA: { value: 0.22 },
    uDamage: { value: 0 }, uSat: { value: 1 }, uContrast: { value: 1.06 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
    uFlash: { value: 0 }, uFade: { value: 0 }, uLow: { value: 0 }, uBars: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse;
uniform float uTime, uVignette, uGrain, uCA, uDamage, uSat, uContrast, uFlash, uFade, uLow, uBars; uniform vec3 uTint;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 c = vUv - 0.5; float r2 = dot(c, c);
  vec2 off = c * r2 * uCA * 0.02;
  vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSat * (1.0 - uLow * 0.7));
  col = max(vec3(0.0), (col - 0.18) * uContrast + 0.18);
  col *= uTint;
  col *= 1.0 - uVignette * smoothstep(0.12, 0.85, r2 * 1.9);
  float dv = smoothstep(0.08, 0.5, r2 * 1.4);
  col = mix(col, vec3(0.55, 0.02, 0.0) * (0.4 + lum), clamp(uDamage * dv, 0.0, 0.85));
  col += (hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 100.0) - 0.5) * uGrain * (0.35 + lum);
  col += vec3(1.0, 0.95, 0.85) * uFlash;
  col *= 1.0 - uFade;
  col *= step(uBars, vUv.y) * step(uBars, 1.0 - vUv.y);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`,
};

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.04, 1600);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
    this.scene.add(this.hemi);
    this.scene.fog = new THREE.FogExp2(0xffffff, 0.004);

    this.skyU = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uCloudCol: { value: new THREE.Color() },
      uCloud: { value: 0.5 }, uStars: { value: 0 }, uTime: { value: 0 }, uSkyI: { value: 1 }, uMoon: { value: 0 }, uFlash: { value: 0 },
      uNoise: { value: G.noiseTex },
    };
    const skyMat = new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
    const skyGeo = new THREE.SphereGeometry(900, 32, 16);
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(skyGeo, skyMat));
    this.pmrem = new THREE.PMREMGenerator(r);

    // pooled lights (fixed count so shaders never recompile)
    this.lamps = [];
    for (let i = 0; i < 5; i++) { const l = new THREE.PointLight(0xff9a4a, 0, 14, 1.8); this.scene.add(l); this.lamps.push(l); }
    this.fxLights = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffc070, 0, 20, 1.6); l.userData.t = 0; this.scene.add(l); this.fxLights.push(l); }
    this.lampSources = [];   // {x,y,z,color,intensity}

    this.env = ENVS.golden; this.envName = 'golden';
    this.fx = { damage: 0, flash: 0, fade: 0, low: 0, bars: 0, lightning: 0, shake: 0 };
    this.quality = 2;
    this.focus = new THREE.Vector3();
    this.time = 0;
    this.buildComposer();
    this.setEnv('golden');
    this.resize();
  }

  buildComposer() {
    const q = this.quality, r = this.renderer;
    const dpr = window.devicePixelRatio || 1;
    this.pixelRatio = [0.7, 1, Math.min(dpr, 1.5), Math.min(dpr, 2)][q];
    r.setPixelRatio(this.pixelRatio);
    const w = Math.max(2, this.canvas.clientWidth || window.innerWidth), h = Math.max(2, this.canvas.clientHeight || window.innerHeight);
    r.setSize(w, h, false);
    const samples = [0, 0, 4, 4][q];
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
    const rt = new THREE.WebGLRenderTarget(w * this.pixelRatio, h * this.pixelRatio, { type: THREE.HalfFloatType, samples });
    const c = this.composer = new EffectComposer(r, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = null;
    if (q >= 1) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.3, 0.6, 1.25);
      c.addPass(this.bloom);
    }
    this.final = new ShaderPass(FINAL_SHADER);
    c.addPass(this.final);
    c.addPass(new OutputPass());
    const sm = [1024, 2048, 4096, 4096][q];
    if (this.sun.shadow.mapSize.x !== sm) {
      this.sun.shadow.mapSize.set(sm, sm);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.shadowExtent = [46, 54, 60, 64][q];
    const sc = this.sun.shadow.camera;
    sc.left = -this.shadowExtent; sc.right = this.shadowExtent; sc.top = this.shadowExtent; sc.bottom = -this.shadowExtent;
    sc.near = 1; sc.far = 420; sc.updateProjectionMatrix();
    // fewer dynamic point lights on low settings (each one is paid for by every lit pixel)
    this.nLamps = [1, 2, 3, 4][q]; this.nFx = [1, 2, 2, 3][q];
    this.lamps.forEach((l, i) => { l.visible = i < this.nLamps; if (!l.visible) l.intensity = 0; });
    this.fxLights.forEach((l, i) => { l.visible = i < this.nFx; if (!l.visible) { l.intensity = 0; l.userData.t = 0; } });
    this.applyEnvUniforms();
  }

  setQuality(q) { this.quality = clamp(q | 0, 0, 3); this.buildComposer(); this.resize(); }

  setEnv(name) {
    const e = this.env = ENVS[name] || ENVS.noon; this.envName = name;
    const el = e.elev * Math.PI / 180, az = e.azim * Math.PI / 180;
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    this.sunDir = dir;
    const u = this.skyU;
    u.uSunDir.value.copy(dir); u.uSunCol.value.set(e.sun).multiplyScalar(e.moon ? 1 : e.sunI / 3);
    u.uZenith.value.set(e.zenith); u.uHorizon.value.set(e.horizon); u.uGround.value.set(e.ground); u.uCloudCol.value.set(e.cloudCol);
    u.uCloud.value = e.cloud; u.uStars.value = e.stars; u.uSkyI.value = e.skyI; u.uMoon.value = e.moon ? 1 : 0;
    this.sun.color.set(e.sun); this.sun.intensity = e.sunI;
    this.hemi.color.set(e.horizon); this.hemi.groundColor.set(e.ground); this.hemi.intensity = e.hemi;
    this.scene.fog.color.set(e.fog); this.scene.fog.density = e.fogD;
    this.renderer.toneMappingExposure = e.exposure;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = e.moon ? 1.0 : 1.15;
    this.applyEnvUniforms();
    if (G.onEnvChange) G.onEnvChange(e);
  }

  applyEnvUniforms() {
    const e = this.env; if (!e || !this.final) return;
    const u = this.final.uniforms;
    u.uTint.value.set(e.tint[0], e.tint[1], e.tint[2]); u.uSat.value = e.sat;
    if (this.bloom) this.bloom.strength = e.bloom;
  }

  resize() {
    const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  flashLight(pos, color, intensity, dur = 0.08, dist = 18) {
    let best = this.fxLights[0];
    for (let i = 0; i < this.nFx; i++) { const l = this.fxLights[i]; if (l.userData.t < best.userData.t) best = l; }
    best.position.copy(pos); best.color.set(color); best.intensity = intensity; best.distance = dist;
    best.userData.t = dur; best.userData.dur = dur; best.userData.i0 = intensity;
  }

  update(dt) {
    this.time += dt;
    this.skyU.uTime.value = this.time;
    this.sky.position.copy(this.camera.position);
    // shadow frustum follows the focus point, snapped to texels to stop shimmer
    const texel = (this.shadowExtent * 2) / this.sun.shadow.mapSize.x * 4;
    const fx = Math.round(this.focus.x / texel) * texel, fz = Math.round(this.focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunDir.x * 200, this.sunDir.y * 200, fz + this.sunDir.z * 200);
    for (const l of this.fxLights) {
      if (l.userData.t > 0) { l.userData.t -= dt; l.intensity = l.userData.i0 * Math.max(0, l.userData.t / l.userData.dur); } else l.intensity = 0;
    }
    // nearest lamp sources get the pooled point lights
    const cam = this.camera.position, src = this.lampSources;
    if (src.length) {
      for (const s of src) s._d = (s.x - cam.x) ** 2 + (s.z - cam.z) ** 2 + (s.dead ? 1e9 : 0);
      src.sort((a, b) => a._d - b._d);
    }
    const lampScale = this.env.moon || this.envName === 'dusk' || this.envName === 'storm' || this.envName === 'ashen' ? 1 : 0.25;
    for (let i = 0; i < this.nLamps; i++) {
      const l = this.lamps[i], s = src[i];
      if (s && !s.dead) {
        l.position.set(s.x, s.y, s.z); l.color.set(s.color || 0xff9a4a);
        const fl = 0.85 + 0.15 * Math.sin(this.time * 11 + i * 2.3) * Math.sin(this.time * 7.3 + i);
        l.intensity = (s.intensity || 40) * fl * lampScale;
      } else l.intensity = 0;
    }
    // lightning
    const f = this.fx;
    if (this.env.rain && Math.random() < dt * 0.09) { f.lightning = 1; if (G.audio) G.audio.thunder(); }
    f.lightning = Math.max(0, f.lightning - dt * 3.5);
    const lg = f.lightning > 0 ? f.lightning * (0.5 + 0.5 * Math.sin(this.time * 60)) : 0;
    this.skyU.uFlash.value = lg;
    this.sun.intensity = this.env.sunI + lg * 9;
    f.damage = damp(f.damage, 0, 2.2, dt); f.flash = damp(f.flash, 0, 5, dt);
    const u = this.final.uniforms;
    u.uTime.value = this.time; u.uDamage.value = f.damage; u.uFlash.value = f.flash; u.uFade.value = f.fade; u.uLow.value = f.low; u.uBars.value = f.bars;
  }

  render() { this.composer.render(); }
}

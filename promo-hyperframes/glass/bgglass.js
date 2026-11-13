// 3D "wallpaper" world behind the Glass look ad. Seek-safe: every frame is render(t).
// window.__bg gives: W, H, FOV, DROP (time the window turns to glass), clock, render, ready.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.184.0/+esm";

const B = window.__bg;
const { W, H, FOV, DROP } = B;

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("bg3d"), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 200);
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// backdrop: tall gradient cylinder
const c = document.createElement("canvas"); c.width = 16; c.height = 512;
const g = c.getContext("2d");
const gr = g.createLinearGradient(0, 0, 0, 512);
gr.addColorStop(0, "#070a14"); gr.addColorStop(0.5, "#16244a"); gr.addColorStop(1, "#0a0f1d");
g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
const bt = new THREE.CanvasTexture(c); bt.colorSpace = THREE.SRGBColorSpace;
const backdrop = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 60, 64, 1, true), new THREE.MeshBasicMaterial({ map: bt, side: THREE.BackSide }));
scene.add(backdrop);

// glossy shapes around the centre (the window sits in front of them)
const COLS = [0x2f6ae0, 0x5ccb8b, 0x8b5cf6, 0xf59e0b, 0xec4899, 0x22d3ee, 0x2f6ae0, 0x5ccb8b, 0xf4f1ea, 0x8b5cf6, 0xf59e0b, 0x2f6ae0];
const GEOS = [
  new THREE.SphereGeometry(1.3, 48, 32), new THREE.TorusKnotGeometry(0.9, 0.32, 160, 24), new THREE.TorusGeometry(1.1, 0.42, 32, 80),
  new THREE.IcosahedronGeometry(1.2, 1), new THREE.CapsuleGeometry(0.6, 1.4, 12, 24), new THREE.OctahedronGeometry(1.1, 0),
];
const shapes = [];
for (let i = 0; i < 12; i++) {
  const m = new THREE.Mesh(GEOS[i % GEOS.length], new THREE.MeshPhysicalMaterial({ color: COLS[i], roughness: 0.18, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 }));
  const a = (i / 12) * Math.PI * 2;
  const r = 4.2 + (i % 3) * 1.4;
  m.userData = { a, r, y: -2.6 + ((i * 5) % 7) * 0.9, z: -3 - (i % 4) * 1.6, k: i };
  scene.add(m);
  shapes.push(m);
}

const hemi = new THREE.HemisphereLight(0xbfd2ff, 0x1a1030, 0.6); scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 6, 8); scene.add(key);
const p1 = new THREE.PointLight(0x5c8cff, 60, 40, 1.5); p1.position.set(-6, 3, 4); scene.add(p1);
const p2 = new THREE.PointLight(0x5ccb8b, 40, 40, 1.5); p2.position.set(6, -3, 3); scene.add(p2);

B.render = (t) => {
  const on = smooth((t - DROP + 0.1) / 0.6);          // world wakes up when the glass turns on
  renderer.toneMappingExposure = 0.35 + 0.75 * on;
  const a0 = t * 0.05;
  cam.position.set(Math.sin(a0) * 2.2, Math.sin(t * 0.21) * 0.6, 13 - 1.5 * on);
  cam.lookAt(0, 0, -4);
  for (const m of shapes) {
    const { a, r, y, z, k } = m.userData;
    const aa = a + t * (0.12 + (k % 3) * 0.03) + on * 0.6;
    m.position.set(Math.cos(aa) * r, y + Math.sin(t * 0.9 + k) * 0.4, z + Math.sin(aa) * 1.2);
    m.rotation.set(t * 0.35 + k, t * 0.27 + k * 0.5, 0);
  }
  renderer.render(scene, cam);
};
B.render(B.clock.t);
B.ready();

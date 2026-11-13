// Calm 3D background for the "How to install NexDB" video: a dark blue room with a soft grid floor and a few
// large, dim, slow orbs far behind the dialogs. Nothing passes in front or moves fast. Seek-safe: every frame is render(t).
// window.__bg gives: W, H, FOV, clock, render, ready.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.184.0/+esm";

const B = window.__bg;
const { W, H, FOV } = B;

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("bg3d"), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a1124, 14, 46);
const cam = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 200);

// backdrop: soft vertical gradient
const c = document.createElement("canvas"); c.width = 16; c.height = 512;
const g = c.getContext("2d");
const gr = g.createLinearGradient(0, 0, 0, 512);
gr.addColorStop(0, "#060912"); gr.addColorStop(0.55, "#12224a"); gr.addColorStop(1, "#0a1124");
g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
const bt = new THREE.CanvasTexture(c); bt.colorSpace = THREE.SRGBColorSpace;
scene.add(new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 80, 64, 1, true), new THREE.MeshBasicMaterial({ map: bt, side: THREE.BackSide, fog: false })));

// floor grid, fading into fog
const grid = new THREE.GridHelper(120, 60, 0x2f6ae0, 0x1d3466);
grid.position.y = -6;
grid.material.transparent = true; grid.material.opacity = 0.35;
scene.add(grid);

// a few big soft orbs, far back
const ORBS = [
  { col: 0x2f6ae0, r: 4.2, x: -9, y: 1.5, z: -22 },
  { col: 0x5ccb8b, r: 3.0, x: 10, y: -1.0, z: -26 },
  { col: 0x3d4f8f, r: 5.5, x: 3, y: 5.5, z: -34 },
];
const orbs = ORBS.map((o, k) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(o.r, 64, 48), new THREE.MeshPhysicalMaterial({ color: o.col, roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.3 }));
  m.userData = { ...o, k };
  scene.add(m);
  return m;
});

scene.add(new THREE.HemisphereLight(0xbfd2ff, 0x0a1020, 0.7));
const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(4, 8, 6); scene.add(key);

B.render = (t) => {
  cam.position.set(Math.sin(t * 0.03) * 1.2, 0.6 + Math.sin(t * 0.05) * 0.3, 14);
  cam.lookAt(0, 0, -20);
  for (const m of orbs) {
    const { x, y, z, k } = m.userData;
    m.position.set(x + Math.sin(t * 0.06 + k * 2) * 1.2, y + Math.sin(t * 0.09 + k) * 0.6, z);
  }
  renderer.render(scene, cam);
};
B.render(B.clock.t);
B.ready();

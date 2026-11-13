// 3D background for the "NexDB for Mac" cartoon ad. Seek-safe: every frame is render(t).
// window.__bg (set in index.html) gives: S, D (voice line starts/lengths), W, H, FOV, SC (scene windows), render, ready.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.184.0/+esm";

const B = window.__bg;
const { S, D, W, H, FOV } = B;

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("bg3d"), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 300);

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
function mesh(geo, m, x, y, z, parent) {
  const g = new THREE.Mesh(geo, m);
  g.position.set(x, y, z);
  g.castShadow = true;
  g.receiveShadow = true;
  parent.add(g);
  return g;
}
const box = (w, h, d, m, x, y, z, parent) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// ------------------------------------------------------------------ ROOM (origin)
const room = new THREE.Group();
scene.add(room);
const floorTex = canvasTex(1024, 1024, (g) => {
  g.fillStyle = "#7a5238"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? "#744e35" : "#80573b"; g.fillRect(0, i * 64, 1024, 62);
    g.fillStyle = "#5e3f2b"; g.fillRect(0, i * 64 + 62, 1024, 2);
    g.fillRect(((i * 397) % 900) + 60, i * 64, 2, 62);
  }
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(2, 2);
const floor = mesh(new THREE.PlaneGeometry(14, 12), mat(0xffffff, { map: floorTex, roughness: 0.6 }), 0, 0, 1, room);
floor.rotation.x = -Math.PI / 2;
const wallM = mat(0x3d5280);
const back = mesh(new THREE.PlaneGeometry(14, 6), wallM, 0, 3, -4, room);
const left = mesh(new THREE.PlaneGeometry(12, 6), mat(0x34476f), -6, 3, 1, room); left.rotation.y = Math.PI / 2;
const right = mesh(new THREE.PlaneGeometry(12, 6), mat(0x34476f), 6, 3, 1, room); right.rotation.y = -Math.PI / 2;
const ceil = mesh(new THREE.PlaneGeometry(14, 12), mat(0x46587f), 0, 6, 1, room); ceil.rotation.x = Math.PI / 2;
box(14, 0.22, 0.06, mat(0xe8ecf2), 0, 0.11, -3.97, room);
box(0.06, 0.22, 12, mat(0xe8ecf2), -5.97, 0.11, 1, room);
box(0.06, 0.22, 12, mat(0xe8ecf2), 5.97, 0.11, 1, room);
// rug
const rug = mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.03, 64), mat(0x2c3f6e, { roughness: 1 }), 0, 0.015, -1.2, room);
rug.scale.z = 0.6;

// window with sky, sun and moon
const skyM = new THREE.MeshBasicMaterial({ color: 0x8ccaff });
mesh(new THREE.PlaneGeometry(1.8, 1.5), skyM, -1.7, 3.1, -3.98, room);
const sunM = new THREE.MeshBasicMaterial({ color: 0xffd56b, transparent: true });
const sun = mesh(new THREE.CircleGeometry(0.22, 40), sunM, -1.3, 3.45, -3.97, room);
const moonM = new THREE.MeshBasicMaterial({ color: 0xf4f1ea, transparent: true, opacity: 0 });
mesh(new THREE.CircleGeometry(0.17, 40), moonM, -2.15, 3.45, -3.97, room);
const frameM = mat(0xeef1f5, { roughness: 0.5 });
box(1.98, 0.1, 0.12, frameM, -1.7, 3.85, -3.94, room);
box(1.98, 0.1, 0.12, frameM, -1.7, 2.35, -3.94, room);
box(0.1, 1.6, 0.12, frameM, -2.64, 3.1, -3.94, room);
box(0.1, 1.6, 0.12, frameM, -0.76, 3.1, -3.94, room);
box(0.06, 1.5, 0.08, frameM, -1.7, 3.1, -3.93, room);
box(1.8, 0.06, 0.08, frameM, -1.7, 3.1, -3.93, room);
box(2.2, 0.08, 0.3, frameM, -1.7, 2.28, -3.85, room); // sill
// curtains
const curtM = mat(0x5ccb8b, { roughness: 0.95 });
box(0.35, 2.1, 0.08, curtM, -2.95, 2.95, -3.88, room);
box(0.35, 2.1, 0.08, curtM, -0.45, 2.95, -3.88, room);

// clock
const clock = new THREE.Group(); clock.position.set(1.75, 3.55, -3.93); room.add(clock);
const face = mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 48), mat(0xf4f1ea, { roughness: 0.4 }), 0, 0, 0, clock); face.rotation.x = Math.PI / 2;
const rim = mesh(new THREE.TorusGeometry(0.47, 0.05, 12, 48), mat(0x1b1f27), 0, 0, 0.03, clock);
for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; box(0.03, i % 3 ? 0.05 : 0.1, 0.02, mat(0x1b1f27), Math.sin(a) * 0.37, Math.cos(a) * 0.37, 0.05, clock).rotation.z = -a; }
const hourH = new THREE.Group(); hourH.position.z = 0.06; clock.add(hourH); box(0.05, 0.22, 0.02, mat(0x1b1f27), 0, 0.1, 0, hourH);
const minH = new THREE.Group(); minH.position.z = 0.08; clock.add(minH); box(0.03, 0.34, 0.02, mat(0xd64545), 0, 0.16, 0, minH);

// shelves with books on the back wall, right
const shelfM = mat(0x9b6a43);
const bookColors = [0x2f6ae0, 0x5ccb8b, 0xd64545, 0xf2c14e, 0xe8ecf2, 0x6f7fd1, 0x2f7ea1];
for (const [sy, n] of [[2.55, 7], [1.85, 6]]) {
  box(1.9, 0.07, 0.36, shelfM, 3.6, sy, -3.8, room);
  let x = 2.8;
  for (let i = 0; i < n; i++) {
    const h = 0.32 + ((i * 37) % 13) / 60, w = 0.11 + ((i * 17) % 5) / 100;
    const b = box(w, h, 0.26, mat(bookColors[(i + sy * 10) % bookColors.length | 0]), x, sy + 0.035 + h / 2, -3.8, room);
    if (i === n - 1) b.rotation.z = -0.25;
    x += w + 0.03;
  }
}
// poster on the right wall area
const posterTex = canvasTex(256, 340, (g) => {
  g.fillStyle = "#13203d"; g.fillRect(0, 0, 256, 340);
  g.fillStyle = "#2f6ae0"; g.font = "bold 120px Segoe UI, sans-serif"; g.textAlign = "center"; g.fillText("</>", 128, 200);
  g.fillStyle = "#9aa3b2"; g.font = "bold 28px Segoe UI, sans-serif"; g.fillText("CODE", 128, 280);
});
box(0.95, 1.25, 0.04, mat(0xeef1f5), 4.0, 4.1, -3.95, room);
mesh(new THREE.PlaneGeometry(0.85, 1.13), new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.7 }), 4.0, 4.1, -3.92, room);

// floor lamp, right
const lamp = new THREE.Group(); lamp.position.set(-4.2, 0, -2.6); room.add(lamp);
mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.06, 32), mat(0x1b1f27), 0, 0.03, 0, lamp);
mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.1, 12), mat(0x1b1f27), 0, 1.6, 0, lamp);
const shadeM = mat(0xf4e3c1, { emissive: 0xffc56b, emissiveIntensity: 0, side: THREE.DoubleSide });
mesh(new THREE.CylinderGeometry(0.3, 0.5, 0.55, 32, 1, true), shadeM, 0, 3.2, 0, lamp);
const lampLight = new THREE.PointLight(0xffc27a, 0, 12, 1.6);
lampLight.position.set(-4.2, 3.0, -2.4); lampLight.castShadow = true; room.add(lampLight);

// plant, right corner
const plant = new THREE.Group(); plant.position.set(4.5, 0, -2.9); room.add(plant);
mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.7, 24), mat(0xd9714e), 0, 0.35, 0, plant);
const leafM = mat(0x3f9a5a);
[[0, 1.2, 0, 0.5], [0.35, 1.0, 0.1, 0.38], [-0.32, 1.05, -0.05, 0.4], [0.1, 1.55, 0, 0.36], [-0.15, 1.4, 0.2, 0.3]].forEach(([x, y, z, r]) => mesh(new THREE.IcosahedronGeometry(r, 1), leafM, x, y, z, plant));

// ceiling pendant
mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.0, 6), mat(0x1b1f27), 0, 5.5, -1.5, room);
const pendM = mat(0x1b1f27, { side: THREE.DoubleSide });
mesh(new THREE.ConeGeometry(0.45, 0.4, 32, 1, true), pendM, 0, 4.85, -1.5, room);
const bulbM = new THREE.MeshBasicMaterial({ color: 0xfff1d0 });
mesh(new THREE.SphereGeometry(0.12, 16, 12), bulbM, 0, 4.68, -1.5, room);

// lights for the room
const hemi = new THREE.HemisphereLight(0xbfd2ff, 0x4a3426, 1.1);
room.add(hemi);
const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.6);
sunLight.position.set(-3, 6, 4); sunLight.target.position.set(0, 0, -3);
sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048);
Object.assign(sunLight.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
room.add(sunLight, sunLight.target);
const pend = new THREE.PointLight(0xffe2b0, 4, 10, 1.5); pend.position.set(0, 4.5, -1.5); room.add(pend);

// ------------------------------------------------------------------ STAGE (x = 100)
const stage = new THREE.Group(); stage.position.x = 100; scene.add(stage);
const backTex = canvasTex(16, 512, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, "#070b14"); gr.addColorStop(0.55, "#1d3260"); gr.addColorStop(1, "#0b1222");
  g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
});
const backdropM = new THREE.MeshBasicMaterial({ map: backTex, side: THREE.BackSide });
mesh(new THREE.CylinderGeometry(30, 30, 40, 64, 1, true), backdropM, 0, 8, 0, stage);
const sfloor = mesh(new THREE.CircleGeometry(30, 64), mat(0x16233f, { roughness: 0.35, metalness: 0.25 }), 0, 0, 0, stage);
sfloor.rotation.x = -Math.PI / 2;
const plinth = mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.35, 64), mat(0x22345c, { roughness: 0.4, metalness: 0.2 }), 0, 0.175, 0, stage);
const ringM = new THREE.MeshBasicMaterial({ color: 0x2f6ae0 });
const ring = mesh(new THREE.TorusGeometry(3.32, 0.04, 8, 96), ringM, 0, 0.36, 0, stage); ring.rotation.x = Math.PI / 2;
const shapes = [];
const shapeCols = [0x2f6ae0, 0xeef1f5, 0x5ccb8b, 0x2f6ae0, 0xeef1f5, 0x6f7fd1, 0x5ccb8b, 0x2f6ae0, 0xf2c14e, 0xeef1f5, 0x2f6ae0, 0x5ccb8b];
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  const r = 12.5 + (i % 3) * 2.2;
  const geo = [new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.IcosahedronGeometry(0.6, 0), new THREE.TorusGeometry(0.5, 0.18, 16, 40), new THREE.SphereGeometry(0.5, 32, 16)][i % 4];
  const m = mesh(geo, mat(shapeCols[i], { roughness: 0.35, metalness: 0.1 }), Math.cos(a) * r, 1.2 + ((i * 7) % 5) * 1.1, Math.sin(a) * r, stage);
  m.userData = { y: m.position.y, k: i };
  shapes.push(m);
}
const key = new THREE.SpotLight(0xffffff, 120, 40, 0.6, 0.6, 1.4);
key.position.set(4, 12, 8); key.target.position.set(0, 0, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
stage.add(key, key.target);
const fill = new THREE.PointLight(0x5c8cff, 40, 30, 1.5); fill.position.set(-6, 5, 2); stage.add(fill);
const rimL = new THREE.PointLight(0x5ccb8b, 20, 25, 1.5); rimL.position.set(6, 3, -6); stage.add(rimL);

// ------------------------------------------------------------------ camera and state per frame
const SC = B.SC; // { "sc-room": [start, dur], ... }
const inScene = (t, id) => t >= SC[id][0] && t < SC[id][0] + SC[id][1];
const STAGE_VIEW = { // angle (rad), height, distance, look height
  "sc-reveal": [0.0, 2.4, 10, 2.4], "sc-stack": [0.5, 2.6, 10.5, 2.5], "sc-host": [-0.6, 2.2, 10, 2.4],
  "sc-macs": [1.1, 2.4, 10, 2.4], "sc-os": [-1.2, 2.8, 11, 2.6], "sc-price": [2.0, 2.3, 10, 2.4], "sc-end": [3.1, 2.5, 10.5, 2.5],
};

B.render = (t) => {
  const isRoom = inScene(t, "sc-room") || inScene(t, "sc-nex");
  if (isRoom) {
    let x, z;
    if (inScene(t, "sc-room")) { const k = smooth(t / SC["sc-room"][1]); x = -0.5 + k * 0.9; z = 6.2 - k * 0.7; }
    else { const k = smooth((t - SC["sc-nex"][0]) / SC["sc-nex"][1]); x = 0.6 - k * 0.7; z = 5.8 - k * 0.3; }
    cam.position.set(x, 2.2, z);
    cam.lookAt(x * 0.4, 2.2, -4);
    // night between "three hours later" and the end of the room story
    let n = 0;
    if (inScene(t, "sc-room")) n = smooth((t - (S[2] + 0.2)) / 2.0) * (1 - 0.35 * smooth((t - S[3]) / 0.6));
    skyM.color.setRGB(0.55 - 0.5 * n, 0.79 - 0.69 * n, 1 - 0.77 * n);
    sunM.opacity = 1 - smooth(n * 2);
    moonM.opacity = smooth(n * 2 - 1);
    hemi.intensity = 1.1 - 0.75 * n;
    sunLight.intensity = 1.6 * (1 - n);
    lampLight.intensity = 9 * smooth(n * 3);
    shadeM.emissiveIntensity = 1.2 * smooth(n * 3);
    // clock: 3 turns of the minute hand during "three hours later"
    const k = smooth((t - (S[2] + 0.1)) / 2.2);
    minH.rotation.z = -Math.PI * 2 * 3 * k;
    hourH.rotation.z = -Math.PI / 2 * k - (inScene(t, "sc-nex") ? 1.2 : 0);
  } else {
    let id = Object.keys(STAGE_VIEW).find((k) => inScene(t, k)) || "sc-end";
    const [a0, h, r, ly] = STAGE_VIEW[id];
    const a = a0 + (t - SC[id][0]) * 0.07;
    cam.position.set(100 + Math.sin(a) * r, h, Math.cos(a) * r);
    cam.lookAt(100, ly, 0);
    for (const m of shapes) {
      const { y, k } = m.userData;
      m.rotation.set(t * 0.4 + k, t * 0.3 + k * 0.7, 0);
      m.position.y = y + Math.sin(t * 1.2 + k) * 0.25;
    }
  }
  renderer.render(scene, cam);
};
B.render(B.clock.t);
B.ready();

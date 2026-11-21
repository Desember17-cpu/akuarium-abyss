// Render: scene Three.js (kamera oblique top-down), cahaya, HUD DOM, minimap.
// Semua mesh dibuat sekali di sini; tiap frame hanya posisi/warna yang berubah.
import * as THREE from 'three';
import { LEVEL, WALLS, GLASS_TANKS, COVERS, DARK_ZONES, PEARLS, EXIT, PLAYER_START } from './config.js';
import { SIGHT_BOXES } from './level.js';
import { CONE_RAYS, computeConePoints, coneColorFor } from './guards.js';
import { STATE_TITLE, STATE_PLAY, STATE_WIN, STATE_LOSE, STATE_PAUSED } from './world.js';

function makeTextSprite(text, color, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(4, 20, 34, 0.72)';
  ctx.beginPath();
  ctx.roundRect(6, 14, 244, 68, 16);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 50);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale, (scale * 96) / 256, 1);
  return sprite;
}

function makeMarkSprite(symbol, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(48, 48, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#101418';
  ctx.font = 'bold 62px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, 48, 52);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.9, 0.9, 1);
  return sprite;
}

function floorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8fd0d4';
  ctx.fillRect(0, 0, 512, 360);
  // Ubin pasir akuarium.
  ctx.strokeStyle = 'rgba(30, 90, 110, 0.25)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 360);
    ctx.stroke();
  }
  for (let y = 0; y <= 360; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  // Bintik pasir + kerang.
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 360;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(20,70,90,0.16)';
    ctx.beginPath();
    ctx.arc(x, y, 1 + Math.random() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRenderer(canvas, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06283d);
  scene.fog = new THREE.Fog(0x06283d, 34, 52);

  const camera = new THREE.PerspectiveCamera(46, 1280 / 800, 0.1, 100);
  const CAM_BASE = new THREE.Vector3(0, 21.5, 12.8);
  camera.position.copy(CAM_BASE);
  camera.lookAt(0, 0, -0.4);

  // --- Cahaya: ambient + hemisphere + directional berbayang + spot + titik ---
  scene.add(new THREE.AmbientLight(0x9fd8e8, 0.85));
  const hemi = new THREE.HemisphereLight(0xbfefff, 0x1d4a5e, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2cf, 1.5);
  sun.position.set(6, 16, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -16;
  sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.camera.far = 45;
  scene.add(sun);
  const spot = new THREE.SpotLight(0x7df0ff, 90, 22, 0.7, 0.5, 1.6);
  spot.position.set(0, 9, -2);
  spot.target.position.set(0, 0, -2);
  scene.add(spot);
  scene.add(spot.target);
  const exitLight = new THREE.PointLight(0x39ff88, 22, 9, 1.8);
  exitLight.position.set(EXIT.x, 2.2, EXIT.z - 0.6);
  scene.add(exitLight);

  // --- Lantai ---
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(LEVEL.halfW * 2 + 1.2, LEVEL.halfH * 2 + 1.2),
    new THREE.MeshLambertMaterial({ map: floorTexture() }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Zona gelap: cakram lantai lebih gelap + rumpun kelp.
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14506b, transparent: true, opacity: 0.5 });
  const kelpMat = new THREE.MeshLambertMaterial({ color: 0x1f8f5f });
  const kelpGeo = new THREE.ConeGeometry(0.22, 1.5, 6);
  for (const d of DARK_ZONES) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(d.r, 28), darkMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(d.x, 0.02, d.z);
    scene.add(disc);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + d.x;
      const kelp = new THREE.Mesh(kelpGeo, kelpMat);
      kelp.position.set(d.x + Math.cos(a) * d.r * 0.55, 0.75, d.z + Math.sin(a) * d.r * 0.55);
      kelp.rotation.z = (Math.sin(a * 3) * 0.2);
      kelp.castShadow = true;
      scene.add(kelp);
    }
  }

  // --- Dinding ---
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x14425e });
  const trimMat = new THREE.MeshBasicMaterial({ color: 0x2fd4e8 });
  for (const w of WALLS) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w.w, LEVEL.wallHeight, w.d), wallMat);
    wall.position.set(w.x, LEVEL.wallHeight / 2, w.z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w.w, 0.08, w.d + 0.06), trimMat);
    trim.position.set(w.x, LEVEL.wallHeight + 0.02, w.z);
    scene.add(trim);
  }

  // --- Tangki kaca: kotak transparan + air bercahaya + karang mini di dalam ---
  const tankLights = [];
  for (const t of GLASS_TANKS) {
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(t.w, t.h, t.d),
      new THREE.MeshPhongMaterial({
        color: t.tint,
        transparent: true,
        opacity: 0.28,
        shininess: 120,
        specular: 0x99eeff,
      }),
    );
    glass.position.set(t.x, t.h / 2, t.z);
    scene.add(glass);
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(t.w - 0.3, t.h - 0.7, t.d - 0.3),
      new THREE.MeshBasicMaterial({ color: t.tint, transparent: true, opacity: 0.16 }),
    );
    water.position.set(t.x, t.h / 2 - 0.1, t.z);
    scene.add(water);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(t.w, t.h, t.d)),
      new THREE.LineBasicMaterial({ color: 0x9ff4ff }),
    );
    edges.position.set(t.x, t.h / 2, t.z);
    scene.add(edges);
    // Bingkai atas-bawah.
    for (const y of [0.08, t.h - 0.08]) {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(t.w + 0.12, 0.16, t.d + 0.12),
        new THREE.MeshLambertMaterial({ color: 0x0d3247 }),
      );
      frame.position.set(t.x, y, t.z);
      scene.add(frame);
    }
    // Karang mini + batu di dalam tangki.
    const miniCoral = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.1, 7),
      new THREE.MeshLambertMaterial({ color: 0xff7fa8 }),
    );
    miniCoral.position.set(t.x - t.w / 4, 0.55, t.z);
    scene.add(miniCoral);
    const miniRock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.45),
      new THREE.MeshLambertMaterial({ color: 0x5a7d8a }),
    );
    miniRock.position.set(t.x + t.w / 4, 0.35, t.z + 0.3);
    scene.add(miniRock);
    const pl = new THREE.PointLight(t.tint, 14, 8, 1.8);
    pl.position.set(t.x, 2.8, t.z);
    scene.add(pl);
    tankLights.push(pl);
  }

  // --- Cover padat: karang / batu / pilar ---
  const coralColors = [0xff6f91, 0xff9a3d, 0xc9b8ff, 0xff7fa8];
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x6b8a97 });
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x2a6f8f });
  for (const c of COVERS) {
    if (c.kind === 'coral') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(c.w, 0.5, c.d), rockMat);
      base.position.set(c.x, 0.25, c.z);
      base.castShadow = true;
      base.receiveShadow = true;
      scene.add(base);
      for (let i = 0; i < 5; i++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.28 + (i % 2) * 0.12, 0.9 + (i % 3) * 0.35, 6),
          new THREE.MeshLambertMaterial({ color: coralColors[i % coralColors.length] }),
        );
        cone.position.set(
          c.x + ((i - 2) * c.w) / 6,
          0.5 + cone.geometry.parameters.height / 2 - 0.1,
          c.z + (i % 2 === 0 ? -c.d / 5 : c.d / 5),
        );
        cone.castShadow = true;
        scene.add(cone);
      }
    } else if (c.kind === 'rock') {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0), rockMat);
      rock.scale.set(c.w / 1.6, c.h / 1.6, c.d / 1.6);
      rock.position.set(c.x, c.h / 2, c.z);
      rock.castShadow = true;
      rock.receiveShadow = true;
      scene.add(rock);
    } else {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), pillarMat);
      pillar.position.set(c.x, c.h / 2, c.z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      scene.add(pillar);
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(c.w + 0.3, 0.18, c.d + 0.3),
        new THREE.MeshLambertMaterial({ color: 0x9ff4ff, emissive: 0x1a5a70 }),
      );
      cap.position.set(c.x, c.h + 0.09, c.z);
      scene.add(cap);
    }
  }

  // --- Mutiara: alas + bola bercahaya + label nama ---
  const pearlMeshes = [];
  for (const p of PEARLS) {
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.7, 0.5, 10),
      new THREE.MeshLambertMaterial({ color: 0x0d3247 }),
    );
    pedestal.position.set(p.x, 0.25, p.z);
    pedestal.castShadow = true;
    scene.add(pedestal);
    const pearl = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 20, 16),
      new THREE.MeshPhongMaterial({ color: p.color, emissive: p.glow, emissiveIntensity: 0.7, shininess: 140 }),
    );
    pearl.position.set(p.x, 0.95, p.z);
    scene.add(pearl);
    const glow = new THREE.PointLight(p.glow, 6, 4.5, 1.8);
    glow.position.set(p.x, 1.4, p.z);
    scene.add(glow);
    const label = makeTextSprite(p.name, '#dff7ff', 2.6);
    label.position.set(p.x, 2.1, p.z);
    scene.add(label);
    pearlMeshes.push({ pearl, glow, label, def: p });
  }

  // --- EXIT: pintu hijau bercahaya + label ---
  const exitGroup = new THREE.Group();
  const doorFrame = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 2.4, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x0d5c33, emissive: 0x0a3d22 }),
  );
  doorFrame.position.set(EXIT.x, 1.2, 9.0);
  doorFrame.castShadow = true;
  exitGroup.add(doorFrame);
  const doorGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 2.0),
    new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.85 }),
  );
  doorGlow.position.set(EXIT.x, 1.15, 8.72);
  doorGlow.rotation.y = Math.PI;
  exitGroup.add(doorGlow);
  const exitLabel = makeTextSprite('EXIT', '#39ff88', 2.4);
  exitLabel.position.set(EXIT.x, 3.0, 8.6);
  exitGroup.add(exitLabel);
  const exitPad = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.6),
    new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.25 }),
  );
  exitPad.rotation.x = -Math.PI / 2;
  exitPad.position.set(EXIT.x, 0.03, EXIT.z);
  exitGroup.add(exitPad);
  scene.add(exitGroup);

  // --- Pemain: penyelam kuning terang + cincin hijau + panah ---
  const playerGroup = new THREE.Group();
  const suitMat = new THREE.MeshLambertMaterial({ color: 0xffd23d });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 4, 10), suitMat);
  body.position.y = 0.85;
  body.castShadow = true;
  playerGroup.add(body);
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 12),
    new THREE.MeshPhongMaterial({ color: 0xbfefff, transparent: true, opacity: 0.85, shininess: 120 }),
  );
  helmet.position.y = 1.5;
  playerGroup.add(helmet);
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.6, 10),
    new THREE.MeshLambertMaterial({ color: 0x2fd4e8 }),
  );
  tank.position.set(0, 0.95, -0.38);
  playerGroup.add(tank);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.66, 28),
    new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  playerGroup.add(ring);
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.5, 4),
    new THREE.MeshBasicMaterial({ color: 0x39ff88 }),
  );
  arrow.position.y = 2.15;
  arrow.rotation.x = Math.PI;
  arrow.rotation.y = Math.PI / 4;
  playerGroup.add(arrow);
  const playerLight = new THREE.PointLight(0xffe9a0, 5, 5, 1.8);
  playerLight.position.y = 1.6;
  playerGroup.add(playerLight);
  scene.add(playerGroup);

  // --- Penjaga: penyelam gelap / hiu robot + cone + tanda ?/! ---
  const guardGroups = [];
  const diverMat = new THREE.MeshLambertMaterial({ color: 0x22303c });
  const sharkMat = new THREE.MeshLambertMaterial({ color: 0x8fa8b8 });
  for (const g of world.guards) {
    const grp = new THREE.Group();
    if (g.kind === 'shark') {
      const bodyM = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.9, 10), sharkMat);
      bodyM.rotation.x = Math.PI / 2;
      bodyM.position.y = 0.7;
      bodyM.castShadow = true;
      grp.add(bodyM);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 4), sharkMat);
      tail.rotation.x = -Math.PI / 2;
      tail.position.set(0, 0.7, -1.2);
      grp.add(tail);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 4), sharkMat);
      fin.position.set(0, 1.25, 0.1);
      grp.add(fin);
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff2d2d }),
      );
      eye.position.set(0.2, 0.85, 0.8);
      grp.add(eye);
    } else {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.5, 4, 10), diverMat);
      b.position.y = 0.8;
      b.castShadow = true;
      grp.add(b);
      const helm = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 14, 10),
        new THREE.MeshPhongMaterial({ color: 0x22303c, shininess: 60 }),
      );
      helm.position.y = 1.38;
      grp.add(helm);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffe9a0 }),
      );
      lamp.position.set(0, 1.42, 0.28);
      grp.add(lamp);
      const tankM = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.17, 0.55, 8),
        new THREE.MeshLambertMaterial({ color: 0x9aa8b0 }),
      );
      tankM.position.set(0, 0.9, -0.34);
      grp.add(tankM);
    }
    // Cincin kecil merah di bawah penjaga supaya terbaca.
    const gring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.6, 24),
      new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    );
    gring.rotation.x = -Math.PI / 2;
    gring.position.y = 0.04;
    grp.add(gring);
    scene.add(grp);

    // Kerucut visi: kipas segitiga yang dibangun ulang tiap frame.
    const coneGeo = new THREE.BufferGeometry();
    const conePos = new Float32Array((CONE_RAYS + 2) * 3);
    coneGeo.setAttribute('position', new THREE.BufferAttribute(conePos, 3));
    const idx = [];
    for (let i = 0; i < CONE_RAYS; i++) {
      idx.push(0, i + 1, i + 2);
    }
    coneGeo.setIndex(idx);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffe14d,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = 0.55;
    scene.add(cone);

    const markQ = makeMarkSprite('?', '#ffb020');
    markQ.position.y = 2.1;
    markQ.visible = false;
    grp.add(markQ);
    const markE = makeMarkSprite('!', '#ff2d2d');
    markE.position.y = 2.1;
    markE.visible = false;
    grp.add(markE);

    guardGroups.push({ grp, cone, coneGeo, conePos, coneMat, markQ, markE });
  }

  // --- Ikan: kerucut kecil warna-warni ---
  const fishGeo = new THREE.ConeGeometry(0.16, 0.55, 6);
  const fishMats = [
    new THREE.MeshLambertMaterial({ color: 0x7be8ff }),
    new THREE.MeshLambertMaterial({ color: 0xffa94d }),
    new THREE.MeshLambertMaterial({ color: 0xff8fb0 }),
  ];
  const fishMeshes = world.fish.map((f, i) => {
    const m = new THREE.Mesh(fishGeo, fishMats[i % fishMats.length]);
    m.scale.setScalar(f.size / 0.22);
    scene.add(m);
    return m;
  });

  // --- Gelembung ---
  const bubbleGeo = new THREE.SphereGeometry(1, 8, 6);
  const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xcff6ff, transparent: true, opacity: 0.45 });
  const bubbleMeshes = world.bubbles.map((b) => {
    const m = new THREE.Mesh(bubbleGeo, bubbleMat);
    m.scale.setScalar(b.size);
    scene.add(m);
    return m;
  });

  // --- Titik pakan (saat Q ditekan) ---
  const feedMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe14d }),
  );
  feedMesh.visible = false;
  scene.add(feedMesh);
  const feedRing = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.62, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  feedRing.rotation.x = -Math.PI / 2;
  feedRing.position.y = 0.04;
  feedRing.visible = false;
  scene.add(feedRing);

  // --- Minimap ---
  const minimap = document.getElementById('minimap');
  const mmCtx = minimap ? minimap.getContext('2d') : null;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function drawMinimap() {
    if (!mmCtx || !minimap) return;
    const W = minimap.width;
    const H = minimap.height;
    const sx = (x) => ((x + LEVEL.halfW) / (LEVEL.halfW * 2)) * W;
    const sz = (z) => ((z + LEVEL.halfH) / (LEVEL.halfH * 2)) * H;
    mmCtx.clearRect(0, 0, W, H);
    mmCtx.fillStyle = 'rgba(6, 40, 61, 0.92)';
    mmCtx.fillRect(0, 0, W, H);
    mmCtx.fillStyle = '#2fd4e8';
    for (const t of GLASS_TANKS) {
      mmCtx.globalAlpha = 0.55;
      mmCtx.fillRect(sx(t.x - t.w / 2), sz(t.z - t.d / 2), (t.w / 26) * W, (t.d / 18) * H);
    }
    mmCtx.globalAlpha = 1;
    mmCtx.fillStyle = '#8a6f4d';
    for (const c of COVERS) {
      mmCtx.fillRect(sx(c.x - c.w / 2), sz(c.z - c.d / 2), (c.w / 26) * W, (c.d / 18) * H);
    }
    mmCtx.fillStyle = '#39ff88';
    mmCtx.fillRect(sx(EXIT.x - 1.2), sz(8.2), (2.4 / 26) * W, 6);
    for (const p of world.pearls) {
      if (p.taken) continue;
      mmCtx.fillStyle = '#ffffff';
      mmCtx.beginPath();
      mmCtx.arc(sx(p.x), sz(p.z), 3.5, 0, Math.PI * 2);
      mmCtx.fill();
    }
    for (const g of world.guards) {
      mmCtx.fillStyle = g.state === 'chase' ? '#ff2d2d' : g.state === 'suspicious' ? '#ffb020' : '#ff7a7a';
      mmCtx.beginPath();
      mmCtx.arc(sx(g.x), sz(g.z), 3, 0, Math.PI * 2);
      mmCtx.fill();
      // Arah hadap.
      mmCtx.strokeStyle = mmCtx.fillStyle;
      mmCtx.beginPath();
      mmCtx.moveTo(sx(g.x), sz(g.z));
      mmCtx.lineTo(sx(g.x) + Math.sin(g.facing) * 7, sz(g.z) + Math.cos(g.facing) * 7);
      mmCtx.stroke();
    }
    const p = world.player;
    mmCtx.fillStyle = '#ffd23d';
    mmCtx.beginPath();
    mmCtx.arc(sx(p.x), sz(p.z), 4, 0, Math.PI * 2);
    mmCtx.fill();
    mmCtx.strokeStyle = '#39ff88';
    mmCtx.lineWidth = 2;
    mmCtx.beginPath();
    mmCtx.arc(sx(p.x), sz(p.z), 6, 0, Math.PI * 2);
    mmCtx.stroke();
    mmCtx.lineWidth = 1;
  }

  function sync() {
    const p = world.player;
    playerGroup.position.set(p.x, 0, p.z);
    playerGroup.rotation.y = p.facing;
    arrow.visible = world.state === STATE_PLAY;
    ring.material.opacity = p.sneaking ? 0.45 : 0.95;

    // Kamera mengikuti pemain sedikit supaya ia tetap di tengah perhatian.
    const targetPos = new THREE.Vector3(
      CAM_BASE.x + p.x * 0.12,
      CAM_BASE.y,
      CAM_BASE.z + p.z * 0.1,
    );
    camera.position.lerp(targetPos, 0.06);
    camera.lookAt(p.x * 0.12, 0, -0.4 + p.z * 0.1);

    for (let i = 0; i < world.guards.length; i++) {
      const g = world.guards[i];
      const gg = guardGroups[i];
      gg.grp.position.set(g.x, 0, g.z);
      gg.grp.rotation.y = g.facing + (g.kind === 'shark' ? Math.PI : 0);
      // Cone: bangun kipas dari titik sinar (dengan belokan refraksi).
      const pts = computeConePoints(g, SIGHT_BOXES, GLASS_TANKS);
      const arr = gg.conePos;
      arr[0] = g.x;
      arr[1] = 0;
      arr[2] = g.z;
      for (let j = 0; j < pts.length; j++) {
        arr[(j + 1) * 3] = pts[j].x;
        arr[(j + 1) * 3 + 1] = 0;
        arr[(j + 1) * 3 + 2] = pts[j].z;
      }
      gg.coneGeo.attributes.position.needsUpdate = true;
      gg.coneGeo.computeBoundingSphere();
      gg.coneMat.color.setHex(coneColorFor(g.state));
      gg.coneMat.opacity = g.state === 'chase' ? 0.42 : g.state === 'suspicious' ? 0.36 : 0.28;
      gg.markQ.visible = g.state === 'suspicious' || g.state === 'search';
      gg.markE.visible = g.state === 'chase';
    }

    for (let i = 0; i < world.pearls.length; i++) {
      const pm = pearlMeshes[i];
      const taken = world.pearls[i].taken;
      pm.pearl.visible = !taken;
      pm.glow.visible = !taken;
      pm.label.visible = !taken;
      if (!taken) {
        pm.pearl.position.y = 0.95 + Math.sin(world.time * 2 + i * 2) * 0.12;
        pm.pearl.rotation.y += 0.02;
      }
    }

    for (let i = 0; i < world.fish.length; i++) {
      const f = world.fish[i];
      const m = fishMeshes[i];
      m.position.set(f.x, 1.1 + Math.sin(world.time * 1.5 + f.phase) * 0.15, f.z);
      m.rotation.y = Math.atan2(Math.cos(f.heading || 0), Math.sin(f.heading || 0));
      m.rotation.z = Math.PI / 2;
    }
    for (let i = 0; i < world.bubbles.length; i++) {
      const b = world.bubbles[i];
      bubbleMeshes[i].position.set(b.x, b.y, b.z);
    }

    if (world.feed && world.feed.active) {
      feedMesh.visible = true;
      feedRing.visible = true;
      feedMesh.position.set(world.feed.x, 0.5 + Math.sin(world.time * 4) * 0.08, world.feed.z);
      feedRing.position.set(world.feed.x, 0.04, world.feed.z);
    } else {
      feedMesh.visible = false;
      feedRing.visible = false;
    }

    // Cahaya tangki berdenyut pelan (bioluminescent).
    for (let i = 0; i < tankLights.length; i++) {
      tankLights[i].intensity = 13 + Math.sin(world.time * 1.4 + i * 2.1) * 2.5;
    }
    exitLight.intensity = 20 + Math.sin(world.time * 3) * 4;

    drawMinimap();
    updateHUD();
  }

  function fmtTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateHUD() {
    const setText = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    setText('hud-pearls', `◆ ${world.pearlsTaken}/3 Mutiara`);
    setText('hud-time', fmtTime(world.time));
    setText('hud-feed', `◉ Pakan: ${world.player.feedLeft}`);
    const meter = world.meter;
    const fill = document.getElementById('meter-fill');
    if (fill) {
      fill.style.width = `${Math.round(meter)}%`;
      fill.style.background = meter >= 65 ? '#ff2d2d' : meter >= 30 ? '#ffb020' : '#39ff88';
    }
    setText(
      'meter-label',
      meter >= 65 ? 'TERLIHAT!' : meter >= 30 ? 'CURIGA...' : meter > 2 ? 'TERDETEKSI...' : 'TERSEMBUNYI',
    );
    const strip = document.getElementById('guard-strip');
    if (strip) {
      strip.innerHTML = world.guards
        .map((g) => {
          const sym = g.state === 'chase' ? '!' : g.state === 'suspicious' || g.state === 'search' ? '?' : g.state === 'distracted' ? '✦' : '○';
          const cls = g.state === 'chase' ? 'chase' : g.state === 'suspicious' || g.state === 'search' ? 'susp' : '';
          return `<span class="${cls}">${g.name} ${sym}</span>`;
        })
        .join(' · ');
    }
    const banner = document.getElementById('banner');
    if (banner) {
      if (world.messageTimer > 0 && world.message) {
        banner.textContent = world.message;
        banner.style.opacity = '1';
      } else {
        banner.style.opacity = '0';
      }
    }
    // Layar.
    const show = (id, on) => {
      const el = document.getElementById(id);
      if (el) el.style.display = on ? 'flex' : 'none';
    };
    show('screen-title', world.state === STATE_TITLE);
    show('screen-win', world.state === STATE_WIN);
    show('screen-lose', world.state === STATE_LOSE);
    show('screen-paused', world.state === STATE_PAUSED);
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = world.state === STATE_TITLE ? 'none' : 'block';
    if (world.state === STATE_WIN) {
      setText('win-grade', `GRADE ${world.grade || '-'}`);
      setText(
        'win-stats',
        `Waktu ${fmtTime(world.time)} · Terlihat ${world.spotted}x · Mutiara 3/3 · Pakan dipakai ${world.feedUsed}x`,
      );
    }
    if (world.state === STATE_LOSE) {
      setText('lose-stats', `Mutiara ${world.pearlsTaken}/3 · Waktu ${fmtTime(world.time)}`);
    }
  }

  return {
    render() {
      sync();
      renderer.render(scene, camera);
    },
    sync,
    resize,
  };
}

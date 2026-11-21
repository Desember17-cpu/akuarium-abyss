// Penjaga: mesin status patroli -> curiga (?) -> kejar (!) -> geledah -> patroli,
// plus kerucut visi bervolume yang TERHALANG cover padat dan MEMBELOK saat
// melewati kaca akuarium (refraksi) — mekanik khas Akuarium Abyss.
import { GUARDS, DETECT } from './config.js';
import { resolveCircle, sightBlocked, sightThroughGlass, inDarkZone } from './level.js';
import { findPath } from './pathfind.js';

export const CONE_RAYS = 26;
export const BEND_ANGLE = 0.22; // radian belokan sinar saat menembus kaca

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function pointInGlass(px, pz, tanks) {
  for (const t of tanks) {
    if (Math.abs(px - t.x) <= t.w / 2 && Math.abs(pz - t.z) <= t.d / 2) return true;
  }
  return false;
}

function pointInSightBox(px, pz, boxes) {
  for (const b of boxes) {
    if (Math.abs(px - b.x) <= b.hw && Math.abs(pz - b.z) <= b.hd) return true;
  }
  return false;
}

export function createGuards() {
  return GUARDS.map((def, i) => ({
    def,
    id: def.id,
    name: def.name,
    kind: def.kind,
    x: def.waypoints[0].x,
    z: def.waypoints[0].z,
    facing: def.kind === 'shark' ? 0 : Math.PI / 2,
    waypointIndex: 1,
    state: 'patrol',
    alert: 0,
    stateTime: 0,
    lastSeen: null,
    loseSightTimer: 0,
    chasePath: null,
    chaseRepath: 0,
    searchTarget: null,
    feedTarget: null,
    feedTimer: 0,
    pauseTimer: 0,
    patrolDir: 1,
    seedPhase: i * 1.7,
  }));
}

// Apakah penjaga ini bisa melihat pemain sekarang? Mengembalikan faktor
// visibilitas 0..1 (0 = tak terlihat) dan apakah lewat kaca.
export function canSeePlayer(g, px, pz, sneaking) {
  const dx = px - g.x;
  const dz = pz - g.z;
  const dist = Math.hypot(dx, dz);
  if (dist > g.def.range) return { visible: 0, throughGlass: false };
  const angleTo = Math.atan2(dx, dz); // 0 = menghadap +z (utara layar = -z? lihat catatan)
  const diff = Math.abs(angleDiff(angleTo, g.facing));
  if (diff > g.def.halfAngle) return { visible: 0, throughGlass: false };
  if (sightBlocked(g.x, g.z, px, pz)) return { visible: 0, throughGlass: false };
  const throughGlass = sightThroughGlass(g.x, g.z, px, pz);
  let v = 1.15 - (dist / g.def.range) * 0.55; // lebih dekat = lebih jelas
  if (throughGlass) v *= DETECT.glassFactor;
  if (inDarkZone(px, pz)) v *= DETECT.darkFactor;
  if (sneaking) v *= DETECT.sneakFactor;
  return { visible: Math.max(0, Math.min(1, v)), throughGlass };
}

// Titik-titik ujung kerucut visi: sinar berjalan lurus, BERHENTI di cover padat,
// dan MEMBELOK + melebar saat menembus kaca. Dipakai render (bukan logika).
export function computeConePoints(g, sightBoxes, glassTanks) {
  const pts = [];
  const half = g.def.halfAngle;
  for (let i = 0; i <= CONE_RAYS; i++) {
    const rel = -half + (2 * half * i) / CONE_RAYS;
    let ang = g.facing + rel;
    let dx = Math.sin(ang);
    let dz = Math.cos(ang);
    let px = g.x;
    let pz = g.z;
    let maxDist = g.def.range;
    let bent = false;
    const step = 0.25;
    for (let d = step; d <= maxDist; d += step) {
      const nx = g.x + dx * d;
      const nz = g.z + dz * d;
      if (pointInSightBox(nx, nz, sightBoxes)) break;
      if (!bent && pointInGlass(nx, nz, glassTanks)) {
        // Refraksi: sinar membelok menjauhi sumbu cone, jangkauan memanjang.
        bent = true;
        const bend = (rel >= 0 ? 1 : -1) * BEND_ANGLE;
        ang += bend;
        dx = Math.sin(ang);
        dz = Math.cos(ang);
        maxDist = g.def.range * 1.18;
        // Lanjutkan dari titik masuk kaca dengan arah baru.
        const ex = g.x + dx * d;
        const ez = g.z + dz * d;
        px = ex;
        pz = ez;
        // Set ulang basis langkah dari posisi baru.
        let dd = d + step;
        for (; dd <= maxDist; dd += step) {
          const mx = g.x + dx * dd;
          const mz = g.z + dz * dd;
          if (pointInSightBox(mx, mz, sightBoxes)) break;
          px = mx;
          pz = mz;
        }
        break;
      }
      px = nx;
      pz = nz;
    }
    pts.push({ x: px, z: pz, bent });
  }
  return pts;
}

// Satu langkah AI penjaga. events: { onSpotted, onLost, onCaught } via return flags.
export function updateGuard(g, dt, player, feed, time) {
  const def = g.def;
  g.stateTime += dt;
  const see = canSeePlayer(g, player.x, player.z, player.sneaking);
  const prevState = g.state;

  // --- Pembaruan alert (meter per penjaga) ---
  if (see.visible > 0 && g.state !== 'distracted') {
    g.alert += DETECT.rate * see.visible * dt;
    g.lastSeen = { x: player.x, z: player.z };
    g.loseSightTimer = 0;
  } else {
    g.alert -= DETECT.decay * dt;
    if (g.state === 'chase') g.loseSightTimer += dt;
  }
  g.alert = Math.max(0, Math.min(100, g.alert));

  // --- Transisi status ---
  if (g.state === 'distracted') {
    g.feedTimer -= dt;
    if (g.feedTimer <= 0) {
      g.state = 'patrol';
      g.stateTime = 0;
      g.alert = Math.max(0, g.alert - 40);
    }
  } else if (feed && feed.active && !g.feedTarget) {
    const fd = Math.hypot(feed.x - g.x, feed.z - g.z);
    if (fd <= 6.5) {
      g.state = 'distracted';
      g.feedTarget = { x: feed.x, z: feed.z };
      g.feedTimer = 4.5;
      g.stateTime = 0;
    }
  }

  if (g.state !== 'distracted') {
    if (g.alert >= DETECT.chaseAt && g.state !== 'chase') {
      g.state = 'chase';
      g.stateTime = 0;
      g.chaseRepath = 0;
    } else if (g.state === 'chase' && g.loseSightTimer >= DETECT.loseSightTime) {
      g.state = 'search';
      g.stateTime = 0;
      g.searchTarget = g.lastSeen ? { ...g.lastSeen } : { x: g.x, z: g.z };
    } else if (g.state === 'chase' && g.alert < DETECT.chaseAt - 25) {
      g.state = 'search';
      g.stateTime = 0;
      g.searchTarget = g.lastSeen ? { ...g.lastSeen } : { x: g.x, z: g.z };
    } else if (g.state === 'search' && g.stateTime >= DETECT.searchTime) {
      g.state = 'patrol';
      g.stateTime = 0;
      g.alert = 0;
    } else if (g.state === 'suspicious' && g.alert < DETECT.calmBelow) {
      g.state = 'patrol';
      g.stateTime = 0;
    } else if (g.state === 'patrol' && g.alert >= DETECT.suspiciousAt) {
      g.state = 'suspicious';
      g.stateTime = 0;
    }
  }

  // --- Gerakan per status ---
  const speed = g.state === 'chase' ? def.chaseSpeed : def.speed;
  let target = null;
  let faceTarget = null;

  if (g.state === 'patrol') {
    target = def.waypoints[g.waypointIndex];
    const d = Math.hypot(target.x - g.x, target.z - g.z);
    if (d < 0.3) {
      g.waypointIndex = (g.waypointIndex + 1) % def.waypoints.length;
      target = def.waypoints[g.waypointIndex];
    }
  } else if (g.state === 'suspicious') {
    faceTarget = g.lastSeen;
  } else if (g.state === 'chase') {
    g.chaseRepath -= dt;
    if (g.chaseRepath <= 0) {
      g.chaseRepath = 0.8; // info pengejar agak basi — memberi pemain celah lari
      // Bila masih melihat pemain, kejar posisinya; bila sudah hilang dari
      // pandangan, kejar TITIK TERAKHIR TERLIHAT (bukan posisi pemain kini) —
      // pemain yang memutus garis pandang benar-benar bisa lolos.
      const target =
        see.visible > 0 ? { x: player.x, z: player.z } : g.lastSeen || { x: player.x, z: player.z };
      g.chasePath = findPath(g.x, g.z, target.x, target.z, null, 0.5);
      // Titik pertama = sel start (sudah dilewati) — mulai dari titik ke-2.
      g.chasePathIndex = g.chasePath.length > 1 ? 1 : 0;
    }
    if (g.chasePath && g.chasePath.length > 0) {
      const idx = Math.min(g.chasePathIndex || 0, g.chasePath.length - 1);
      target = g.chasePath[idx];
      const d = Math.hypot(target.x - g.x, target.z - g.z);
      if (d < 0.4 && (g.chasePathIndex || 0) < g.chasePath.length - 1) {
        g.chasePathIndex = (g.chasePathIndex || 0) + 1;
        target = g.chasePath[g.chasePathIndex];
      }
    } else {
      target = { x: player.x, z: player.z };
    }
    faceTarget = { x: player.x, z: player.z };
  } else if (g.state === 'search') {
    target = g.searchTarget;
    if (target) {
      const d = Math.hypot(target.x - g.x, target.z - g.z);
      if (d < 0.4) {
        // Menggeledah: menoleh kiri-kanan di tempat.
        g.facing += Math.sin(time * 1.8 + g.seedPhase) * 0.9 * dt;
      }
    }
  } else if (g.state === 'distracted') {
    target = g.feedTarget;
    if (target) {
      const d = Math.hypot(target.x - g.x, target.z - g.z);
      if (d < 0.5) target = null;
    }
  }

  if (target) {
    const dx = target.x - g.x;
    const dz = target.z - g.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const want = Math.atan2(dx, dz);
      g.facing = turnToward(g.facing, want, 3.2 * dt);
      const step = Math.min(d, speed * dt);
      g.x += (dx / d) * step;
      g.z += (dz / d) * step;
    }
  } else if (faceTarget) {
    const want = Math.atan2(faceTarget.x - g.x, faceTarget.z - g.z);
    g.facing = turnToward(g.facing, want, 2.6 * dt);
  }

  // Tabrakan: penjaga TIDAK PERNAH menembus dinding/tangki/cover.
  const radius = g.kind === 'shark' ? 0.62 : 0.45;
  resolveCircle(g, radius);

  // Tertangkap? (hanya saat mengejar dan sangat dekat)
  const caught =
    g.state === 'chase' &&
    Math.hypot(player.x - g.x, player.z - g.z) < DETECT.catchDistance;

  return {
    becameChase: prevState !== 'chase' && g.state === 'chase',
    becameSuspicious: prevState !== 'suspicious' && g.state === 'suspicious',
    caught,
  };
}

function turnToward(current, target, maxStep) {
  const d = angleDiff(target, current);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

// Warna cone menurut status: kuning patroli, oranye curiga, merah kejar.
export function coneColorFor(state) {
  if (state === 'chase') return 0xff2d2d;
  if (state === 'suspicious') return 0xff9a1f;
  if (state === 'search') return 0xffc861;
  if (state === 'distracted') return 0x7be8ff;
  return 0xffe14d;
}

// Pemain: penyelam pencuri mutiara. Baju kuning terang + cincin hijau supaya
// selalu terbaca di lantai akuarium. Gerak WASD, Shift menyelinap.
import { PLAYER, PLAYER_START, FEED } from './config.js';
import { resolveCircle, nearPearl, nearExit } from './level.js';

export function createPlayer() {
  return {
    x: PLAYER_START.x,
    z: PLAYER_START.z,
    facing: Math.PI, // menghadap utara (ke dalam akuarium)
    moving: false,
    sneaking: false,
    stepTimer: 0,
    feedLeft: FEED.count,
    feedCooldown: 0,
  };
}

export function resetPlayer(p) {
  p.x = PLAYER_START.x;
  p.z = PLAYER_START.z;
  p.facing = Math.PI;
  p.moving = false;
  p.sneaking = false;
  p.feedLeft = FEED.count;
  p.feedCooldown = 0;
}

// Gerakkan pemain dari input sumbu (ax, az ternormalisasi). Mengembalikan
// info interaksi: mutiara terdekat / di pintu exit.
export function updatePlayer(p, ax, az, sneaking, dt) {
  p.sneaking = sneaking;
  const speed = sneaking ? PLAYER.sneakSpeed : PLAYER.walkSpeed;
  p.moving = ax !== 0 || az !== 0;
  if (p.moving) {
    p.facing = Math.atan2(ax, az);
    p.x += ax * speed * dt;
    p.z += az * speed * dt;
    resolveCircle(p, PLAYER.radius);
    p.stepTimer -= dt;
  }
  if (p.feedCooldown > 0) p.feedCooldown -= dt;
  return {
    pearl: nearPearl(p.x, p.z),
    atExit: nearExit(p.x, p.z),
  };
}

// Lempar pakan (Q): jatuh beberapa langkah di depan pemain, ikan berkerumun,
// penjaga di sekitar teralihkan. Mengembalikan titik pakan atau null.
export function throwFeed(p) {
  if (p.feedLeft <= 0 || p.feedCooldown > 0) return null;
  p.feedLeft -= 1;
  p.feedCooldown = 0.6;
  const fx = p.x + Math.sin(p.facing) * FEED.throwDistance;
  const fz = p.z + Math.cos(p.facing) * FEED.throwDistance;
  const clamped = {
    x: Math.max(-12.4, Math.min(12.4, fx)),
    z: Math.max(-8.4, Math.min(8.4, fz)),
  };
  return { x: clamped.x, z: clamped.z, active: true, timer: FEED.distractTime };
}

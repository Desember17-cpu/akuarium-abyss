// Level: geometri halangan, tabrakan lingkaran-vs-kotak, dan tes garis pandang.
// Kaca (GLASS_TANKS) menghalangi gerak tapi TIDAK memutus pandangan —
// ia hanya membiaskan cone dan melambatkan deteksi (lihat guards.js).
import { LEVEL, WALLS, GLASS_TANKS, COVERS, DARK_ZONES, PEARLS, EXIT } from './config.js';

// Semua kotak yang menghalangi GERAK (dinding + tangki + cover).
export function allSolidBoxes() {
  const boxes = [];
  for (const w of WALLS) boxes.push({ x: w.x, z: w.z, hw: w.w / 2, hd: w.d / 2 });
  for (const t of GLASS_TANKS) boxes.push({ x: t.x, z: t.z, hw: t.w / 2, hd: t.d / 2 });
  for (const c of COVERS) boxes.push({ x: c.x, z: c.z, hw: c.w / 2, hd: c.d / 2 });
  return boxes;
}

// Kotak yang menghalangi PANDANGAN (hanya dinding + cover padat; kaca tidak).
export function sightBlockingBoxes() {
  const boxes = [];
  for (const w of WALLS) boxes.push({ x: w.x, z: w.z, hw: w.w / 2, hd: w.d / 2 });
  for (const c of COVERS) boxes.push({ x: c.x, z: c.z, hw: c.w / 2, hd: c.d / 2 });
  return boxes;
}

export const SOLID_BOXES = allSolidBoxes();
export const SIGHT_BOXES = sightBlockingBoxes();

function pointInBox(px, pz, b) {
  return Math.abs(px - b.x) <= b.hw && Math.abs(pz - b.z) <= b.hd;
}

export function pointBlocked(px, pz) {
  for (const b of SOLID_BOXES) if (pointInBox(px, pz, b)) return true;
  return false;
}

// Dorong lingkaran (pos, radius) keluar dari semua kotak padat. Dipakai
// pemain DAN penjaga — jadi tidak ada yang bisa menembus dinding/tangki.
export function resolveCircle(pos, radius) {
  for (const b of SOLID_BOXES) {
    const cx = Math.max(b.x - b.hw, Math.min(pos.x, b.x + b.hw));
    const cz = Math.max(b.z - b.hd, Math.min(pos.z, b.z + b.hd));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Pusat tepat di dalam kotak: dorong ke sisi terdekat.
        const pushLeft = pos.x - (b.x - b.hw);
        const pushRight = b.x + b.hw - pos.x;
        const pushUp = pos.z - (b.z - b.hd);
        const pushDown = b.z + b.hd - pos.z;
        const m = Math.min(pushLeft, pushRight, pushUp, pushDown);
        if (m === pushLeft) pos.x = b.x - b.hw - radius;
        else if (m === pushRight) pos.x = b.x + b.hw + radius;
        else if (m === pushUp) pos.z = b.z - b.hd - radius;
        else pos.z = b.z + b.hd + radius;
      }
    }
  }
  // Jepit di dalam arena.
  pos.x = Math.max(-LEVEL.halfW + 0.6, Math.min(LEVEL.halfW - 0.6, pos.x));
  pos.z = Math.max(-LEVEL.halfH + 0.6, Math.min(LEVEL.halfH - 0.6, pos.z));
}

// Tes segmen (x1,z1)->(x2,z2) melawan satu kotak (slab test 2D).
// Mengembalikan jarak t (0..1) titik masuk, atau null bila tak bersentuhan.
function segmentBoxT(x1, z1, x2, z2, b) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  let tmin = 0;
  let tmax = 1;
  const minX = b.x - b.hw;
  const maxX = b.x + b.hw;
  const minZ = b.z - b.hd;
  const maxZ = b.z + b.hd;
  if (Math.abs(dx) < 1e-9) {
    if (x1 < minX || x1 > maxX) return null;
  } else {
    let t1 = (minX - x1) / dx;
    let t2 = (maxX - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z1 < minZ || z1 > maxZ) return null;
  } else {
    let t1 = (minZ - z1) / dz;
    let t2 = (maxZ - z1) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

// Apakah garis pandang dari (x1,z1) ke (x2,z2) terhalang cover padat?
export function sightBlocked(x1, z1, x2, z2) {
  for (const b of SIGHT_BOXES) {
    const t = segmentBoxT(x1, z1, x2, z2, b);
    if (t !== null && t > 0.001 && t < 0.999) return true;
  }
  return false;
}

// Apakah garis pandang melewati tangki kaca? (Untuk refraksi + deteksi lambat.)
export function sightThroughGlass(x1, z1, x2, z2) {
  for (const t of GLASS_TANKS) {
    const b = { x: t.x, z: t.z, hw: t.w / 2, hd: t.d / 2 };
    const hit = segmentBoxT(x1, z1, x2, z2, b);
    if (hit !== null && hit > 0.001 && hit < 0.999) return true;
  }
  return false;
}

// Jarak terdekat segmen ke kotak kaca — dipakai cone untuk membelokkan sinar.
export function glassHitT(x1, z1, x2, z2) {
  let best = null;
  for (const t of GLASS_TANKS) {
    const b = { x: t.x, z: t.z, hw: t.w / 2, hd: t.d / 2 };
    const hit = segmentBoxT(x1, z1, x2, z2, b);
    if (hit !== null && hit > 0.001 && hit < 0.999 && (best === null || hit < best)) best = hit;
  }
  return best;
}

export function inDarkZone(x, z) {
  for (const d of DARK_ZONES) {
    const dx = x - d.x;
    const dz = z - d.z;
    if (dx * dx + dz * dz <= d.r * d.r) return true;
  }
  return false;
}

export function nearPearl(x, z) {
  for (const p of PEARLS) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz <= 1.25 * 1.25) return p;
  }
  return null;
}

export function nearExit(x, z) {
  const dx = x - EXIT.x;
  const dz = z - EXIT.z;
  return dx * dx + dz * dz <= EXIT.r * EXIT.r;
}

// A* di grid atas level — dipakai autopilot pemain DAN penjaga yang mengejar.
// Sel grid 0,5 unit; sel terhalang bila pusatnya (dengan inflasi) menabrak kotak padat.
import { pointBlocked } from './level.js';

export const CELL = 0.5;
export const COLS = 54; // x: -13.5 .. 13.5
export const ROWS = 38; // z: -9.5 .. 9.5

export function toCell(x, z) {
  return {
    cx: Math.max(0, Math.min(COLS - 1, Math.floor((x + 13.5) / CELL))),
    cz: Math.max(0, Math.min(ROWS - 1, Math.floor((z + 9.5) / CELL))),
  };
}

export function toWorld(cx, cz) {
  return { x: -13.5 + (cx + 0.5) * CELL, z: -9.5 + (cz + 0.5) * CELL };
}

export function blockedCell(cx, cz, inflate) {
  if (cx < 0 || cz < 0 || cx >= COLS || cz >= ROWS) return true;
  const w = toWorld(cx, cz);
  // Cek pusat + 4 titik tepi sel supaya jalur tidak menyerempet dinding.
  const pts = [
    [w.x, w.z],
    [w.x - inflate, w.z],
    [w.x + inflate, w.z],
    [w.x, w.z - inflate],
    [w.x, w.z + inflate],
  ];
  for (const [px, pz] of pts) if (pointBlocked(px, pz)) return true;
  return false;
}

// extraCost(cx, cz) -> biaya tambahan (>=0) atau Infinity bila dilarang.
// Mengembalikan array {x,z} titik jalan (sudah termasuk tujuan), atau [] bila buntu.
export function findPath(sx, sz, tx, tz, extraCost, radius) {
  const start = toCell(sx, sz);
  const goal = toCell(tx, tz);
  const inflate = radius ?? 0.45;
  if (blockedCell(goal.cx, goal.cz, inflate)) {
    // Tujuan di dalam halangan: cari sel bebas terdekat.
    let found = null;
    for (let r = 1; r <= 4 && !found; r++) {
      for (let dz = -r; dz <= r && !found; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const cx = goal.cx + dx;
          const cz = goal.cz + dz;
          if (!blockedCell(cx, cz, inflate)) {
            found = { cx, cz };
            break;
          }
        }
      }
    }
    if (!found) return [];
    goal.cx = found.cx;
    goal.cz = found.cz;
  }
  if (blockedCell(start.cx, start.cz, inflate)) {
    // Awal menempel dinding (sel start terhalang inflasi): cari sel bebas
    // terdekat sebagai titik awal — jangan menyerah begitu saja.
    let found = null;
    for (let r = 1; r <= 4 && !found; r++) {
      for (let dz = -r; dz <= r && !found; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const cx = start.cx + dx;
          const cz = start.cz + dz;
          if (!blockedCell(cx, cz, inflate)) {
            found = { cx, cz };
            break;
          }
        }
      }
    }
    if (!found) return [];
    start.cx = found.cx;
    start.cz = found.cz;
  }

  const key = (cx, cz) => cz * COLS + cx;
  const open = [{ cx: start.cx, cz: start.cz, g: 0, f: 0, parent: null }];
  const gScore = new Map([[key(start.cx, start.cz), 0]]);
  const closed = new Set();
  const heuristic = (cx, cz) => Math.hypot(cx - goal.cx, cz - goal.cz);

  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const cur = open.splice(best, 1)[0];
    const ck = key(cur.cx, cur.cz);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur.cx === goal.cx && cur.cz === goal.cz) {
      const path = [];
      let node = cur;
      while (node) {
        path.unshift(toWorld(node.cx, node.cz));
        node = node.parent;
      }
      return smoothPath(path);
    }
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nx = cur.cx + dx;
        const nz = cur.cz + dz;
        if (blockedCell(nx, nz, inflate)) continue;
        if (dx !== 0 && dz !== 0) {
          if (blockedCell(cur.cx + dx, cur.cz, inflate) || blockedCell(cur.cx, cur.cz + dz, inflate)) continue;
        }
        const nk = key(nx, nz);
        if (closed.has(nk)) continue;
        let extra = 0;
        if (extraCost) {
          extra = extraCost(nx, nz);
          if (!Number.isFinite(extra)) continue;
        }
        const step = dx !== 0 && dz !== 0 ? 1.414 : 1;
        const ng = cur.g + step + extra;
        if (gScore.has(nk) && gScore.get(nk) <= ng) continue;
        gScore.set(nk, ng);
        open.push({ cx: nx, cz: nz, g: ng, f: ng + heuristic(nx, nz), parent: cur });
      }
    }
  }
  return [];
}

// Buang titik yang segaris / bisa dipotong lurus tanpa menabrak.
function smoothPath(path) {
  if (path.length <= 2) return path;
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !lineClear(path[i], path[j])) j--;
    out.push(path[j]);
    i = j;
  }
  return out;
}

function lineClear(a, b) {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.ceil(dist / 0.25);
  const r = 0.45; // radius pemain: pintasan harus muat badan, bukan cuma titik
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (
      pointBlocked(x, z) ||
      pointBlocked(x - r, z) ||
      pointBlocked(x + r, z) ||
      pointBlocked(x, z - r) ||
      pointBlocked(x, z + r)
    ) {
      return false;
    }
  }
  return true;
}

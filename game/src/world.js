// Dunia: status game (title/play/win/lose), meter deteksi, mutiara, EXIT,
// dan AUTOPILOT — pemain otomatis yang memainkan ATURAN ASLI dari state segar
// (jalan, menyelinap, melempar pakan, menunggu cone lewat) sampai menang.
import { PEARLS, EXIT, DETECT, SHOT_SEED, GUARDS } from './config.js';
import { createRandom } from './random.js';
import { createGuards, updateGuard, angleDiff } from './guards.js';
import { createPlayer, resetPlayer, updatePlayer, throwFeed } from './player.js';
import { createFish, updateFish, createBubbles, updateBubbles } from './fish.js';
import { findPath, toCell, toWorld, blockedCell, CELL, COLS, ROWS } from './pathfind.js';
import { pointBlocked, sightBlocked } from './level.js';

export const STATE_TITLE = 'title';
export const STATE_PLAY = 'play';
export const STATE_WIN = 'win';
export const STATE_LOSE = 'lose';
export const STATE_PAUSED = 'paused';

const PHANTOM = { x: 0, z: -60, sneaking: false };

export function createWorld(seed) {
  const rng = createRandom(seed ?? SHOT_SEED);
  return {
    rng,
    state: STATE_TITLE,
    time: 0,
    pearls: PEARLS.map((p) => ({ ...p, taken: false })),
    pearlsTaken: 0,
    meter: 0,
    spotted: 0, // berapa kali penjaga sampai mengejar (!)
    feedUsed: 0,
    player: createPlayer(),
    guards: createGuards(),
    fish: createFish(rng),
    bubbles: createBubbles(rng, 26),
    feed: null, // {x, z, active, timer}
    auto: false,
    autoPath: null,
    autoTarget: null,
    autoReplan: 0,
    autoWait: 0,
    autoStage: null,
    message: '',
    messageTimer: 0,
    grade: null,
    best: 0,
    stepSoundTimer: 0,
    startedAt: 0,
  };
}

export function startGame(world, auto) {
  world.state = STATE_PLAY;
  world.time = 0;
  world.pearlsTaken = 0;
  world.pearls.forEach((p) => (p.taken = false));
  world.meter = 0;
  world.spotted = 0;
  world.feedUsed = 0;
  world.feed = null;
  world.auto = !!auto;
  world.autoPath = null;
  world.autoTarget = null;
  world.autoReplan = 0;
  world.autoWait = 0;
  world.autoStage = null;
  world.grade = null;
  world.message = '';
  world.messageTimer = 0;
  resetPlayer(world.player);
  world.guards = createGuards();
  world.startedAt = 0;
}

export function gradeFor(time, spotted) {
  if (time <= 75 && spotted === 0) return 'S';
  if (time <= 120 && spotted <= 1) return 'A';
  if (time <= 180) return 'B';
  return 'C';
}

function setMessage(world, text, seconds) {
  world.message = text;
  world.messageTimer = seconds;
}

// --- Sel panas: sel grid yang sedang berada di dalam cone penjaga ---
function hotCells(world) {
  const hot = new Set();
  for (const g of world.guards) {
    const range = g.def.range + 0.5;
    const minCx = Math.max(0, Math.floor((g.x - range + 13.5) / CELL));
    const maxCx = Math.min(COLS - 1, Math.floor((g.x + range + 13.5) / CELL));
    const minCz = Math.max(0, Math.floor((g.z - range + 9.5) / CELL));
    const maxCz = Math.min(ROWS - 1, Math.floor((g.z + range + 9.5) / CELL));
    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const w = toWorld(cx, cz);
        const dx = w.x - g.x;
        const dz = w.z - g.z;
        const d = Math.hypot(dx, dz);
        if (d > range) continue;
        if (Math.abs(angleDiff(Math.atan2(dx, dz), g.facing)) > g.def.halfAngle) continue;
        hot.add(cz * COLS + cx);
      }
    }
    // Zona dekat penjaga: sangat mahal, jangan dekati.
    const r = 1.6;
    const c = toCell(g.x, g.z);
    const rr = Math.ceil(r / CELL);
    for (let cz = c.cz - rr; cz <= c.cz + rr; cz++) {
      for (let cx = c.cx - rr; cx <= c.cx + rr; cx++) {
        if (cx < 0 || cz < 0 || cx >= COLS || cz >= ROWS) continue;
        const w = toWorld(cx, cz);
        if (Math.hypot(w.x - g.x, w.z - g.z) <= r) hot.add(cz * COLS + cx + 100000);
      }
    }
  }
  return hot;
}

function cellCost(hot) {
  return (cx, cz) => {
    const k = cz * COLS + cx;
    if (hot.has(k)) return 30;
    if (hot.has(k + 100000)) return 80;
    return 0;
  };
}

function isHot(hot, x, z) {
  const c = toCell(x, z);
  return hot.has(c.cz * COLS + c.cx) || hot.has(c.cz * COLS + c.cx + 100000);
}

// Jalur patroli semua penjaga (segmen antar waypoint, termasuk putaran
// kembali ke waypoint pertama). Sel staging tidak boleh menempel jalur ini —
// penjaga akan berjalan tepat di atas pemain yang menunggu di sana.
const PATROL_SEGMENTS = [];
for (const g of GUARDS) {
  const wps = g.waypoints;
  for (let i = 0; i < wps.length; i++) {
    PATROL_SEGMENTS.push([wps[i], wps[(i + 1) % wps.length]]);
  }
}

function distToSegment(px, pz, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - a.x) * dx + (pz - a.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + dx * t;
  const cz = a.z + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

function nearPatrolLane(x, z, margin) {
  for (const [a, b] of PATROL_SEGMENTS) {
    if (distToSegment(x, z, a, b) < margin) return true;
  }
  return false;
}

// Cari sel aman terdekat (tidak panas, tidak dekat penjaga) dalam radius r.
// minGuardDist: sel harus sejauh ini dari penjaga mana pun (untuk mundur aman).
// Bila ada penjaga yang mengejar, sel HARUS terhalang cover dari matanya
// (putus garis pandang) — kalau tidak ada, coba lagi tanpa syarat itu.
function nearestSafeCell(world, hot, x, z, radius, minGuardDist) {
  const found = nearestSafeCellPass(world, hot, x, z, radius, minGuardDist, true);
  if (found) return found;
  // Cadangan: bukan sel terdekat, tapi sel yang PALING JAUH dari pengejar.
  return farthestFromChasers(world, hot, x, z, radius, minGuardDist);
}

function farthestFromChasers(world, hot, x, z, radius, minGuardDist) {
  const c = toCell(x, z);
  const rr = Math.ceil(radius / CELL);
  let best = null;
  let bestScore = -Infinity;
  for (let dz = -rr; dz <= rr; dz++) {
    for (let dx = -rr; dx <= rr; dx++) {
      const cx = c.cx + dx;
      const cz = c.cz + dz;
      if (cx < 1 || cz < 1 || cx >= COLS - 1 || cz >= ROWS - 1) continue;
      const k = cz * COLS + cx;
      if (hot.has(k) || hot.has(k + 100000)) continue;
      if (blockedCell(cx, cz, 0.45)) continue;
      const w = toWorld(cx, cz);
      if (nearPatrolLane(w.x, w.z, 1.3)) continue; // jangan lari ke jalur patroli
      let minD = Infinity;
      for (const g of world.guards) {
        const d = Math.hypot(w.x - g.x, w.z - g.z);
        if (d < minD) minD = d;
      }
      // Skor: jarak ke penjaga terdekat, dikurangi sedikit jarak tempuh.
      const score = minD - Math.hypot(w.x - x, w.z - z) * 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = w;
      }
    }
  }
  return best;
}

function nearestSafeCellPass(world, hot, x, z, radius, minGuardDist, needCover) {
  const c = toCell(x, z);
  const rr = Math.ceil(radius / CELL);
  let best = null;
  let bestD = Infinity;
  for (let dz = -rr; dz <= rr; dz++) {
    for (let dx = -rr; dx <= rr; dx++) {
      const cx = c.cx + dx;
      const cz = c.cz + dz;
      if (cx < 1 || cz < 1 || cx >= COLS - 1 || cz >= ROWS - 1) continue;
      const k = cz * COLS + cx;
      if (hot.has(k) || hot.has(k + 100000)) continue;
      if (blockedCell(cx, cz, 0.45)) continue; // jangan staging di dalam dinding
      const w = toWorld(cx, cz);
      if (nearPatrolLane(w.x, w.z, 1.3)) continue; // jangan menunggu di jalur patroli
      if (minGuardDist) {
        let ok = true;
        for (const g of world.guards) {
          if (Math.hypot(w.x - g.x, w.z - g.z) < minGuardDist) {
            ok = false;
            break;
          }
          // Sel persembunyian harus di balik cover dari pengejar.
          if (needCover && g.state === 'chase' && !sightBlocked(g.x, g.z, w.x, w.z)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }
      const d = Math.hypot(w.x - x, w.z - z);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
  }
  return best;
}

// --- Autopilot: satu langkah (mengembalikan sumbu gerak + aksi) ---
function autopilotStep(world, dt) {
  const p = world.player;
  const hot = hotCells(world);
  world.autoReplan -= dt;
  world.autoDebug = world.autoDebug || {};

  // Target: mutiara terdekat yang belum diambil, lalu EXIT.
  let target = null;
  let targetKind = 'pearl';
  let bestD = Infinity;
  for (const pearl of world.pearls) {
    if (pearl.taken) continue;
    const d = Math.hypot(pearl.x - p.x, pearl.z - p.z);
    if (d < bestD) {
      bestD = d;
      target = pearl;
    }
  }
  if (!target) {
    target = EXIT;
    targetKind = 'exit';
  }

  // Meter tinggi / sedang dikejar -> mundur ke sel aman dan tunggu reda.
  const chased = world.guards.some((g) => g.state === 'chase');
  if (world.meter > 55 || chased) {
    world.autoDebug.branch = 'retreat';
    // Tujuan mundur TETAP sampai tercapai (jangan ganti tiap 0,4 dtk —
    // gonta-ganti arah membuat pemain zig-zag dan pengejar memotong jalan).
    if (!world.autoStage) {
      world.autoStage = nearestSafeCell(world, hot, p.x, p.z, 6, 3.5);
      world.autoReplan = 0;
      world.autoPath = null;
    }
    if (world.autoStage) {
      const d = Math.hypot(world.autoStage.x - p.x, world.autoStage.z - p.z);
      if (d > 0.5) {
        return moveAlongPath(world, world.autoStage.x, world.autoStage.z, false, hot);
      }
      // Sudah di tempat aman — TAPI bila masih terlihat / terus dikejar,
      // sel ini ternyata tidak aman: jangan menunggu ditangkap. Cari SEGERA
      // persembunyian baru yang lebih jauh dari semua penjaga, lalu pergi.
      if (chased || world.meter > 40 || isHot(hot, p.x, p.z)) {
        world.autoStage = nearestSafeCell(world, hot, p.x, p.z, 7, 4.0);
        world.autoReplan = 0.4;
        world.autoPath = null;
        if (world.autoStage) {
          return moveAlongPath(world, world.autoStage.x, world.autoStage.z, false, hot);
        }
        // Tidak ada sel aman: lari tegak lurus dari pengejar terdekat
        // (lari lurus bisa menabrak dinding — pilih sisi yang lapang).
        let cg = null;
        let cd = Infinity;
        for (const g of world.guards) {
          if (g.state !== 'chase') continue;
          const dd = Math.hypot(g.x - p.x, g.z - p.z);
          if (dd < cd) {
            cd = dd;
            cg = g;
          }
        }
        if (cg) {
          const dx = p.x - cg.x;
          const dz = p.z - cg.z;
          const dl = Math.hypot(dx, dz) || 1;
          const ax0 = dx / dl;
          const az0 = dz / dl;
          const sides = [
            { x: -az0, z: ax0 },
            { x: az0, z: -ax0 },
          ];
          for (const s of sides) {
            const aheadX = p.x + s.x * 2;
            const aheadZ = p.z + s.z * 2;
            if (!pointBlocked(aheadX, aheadZ)) {
              return { ax: s.x, az: s.z, sneak: false, act: null };
            }
          }
          return { ax: ax0, az: az0, sneak: false, act: null };
        }
        return { ax: 0, az: 0, sneak: true, act: null };
      }
      // Benar-benar aman: tunggu sampai meter reda.
      if (world.meter < 15 && !chased) {
        world.autoStage = null;
        world.autoPath = null;
      }
      return { ax: 0, az: 0, sneak: true, act: null };
    }
  }

  // Target sedang disorot cone -> tunggu di sel aman dekat target.
  if (isHot(hot, target.x, target.z)) {
    world.autoDebug.branch = 'stage-hot';
    world.autoDebug.target = `${targetKind}(${target.x.toFixed(1)},${target.z.toFixed(1)})`;
    if (!world.autoStage || world.autoReplan <= 0) {
      world.autoStage = nearestSafeCell(world, hot, target.x, target.z, 4.5);
      world.autoReplan = 0.4;
      world.autoPath = null;
    }
    if (world.autoStage) {
      const d = Math.hypot(world.autoStage.x - p.x, world.autoStage.z - p.z);
      if (d > 0.5) return moveAlongPath(world, world.autoStage.x, world.autoStage.z, false, hot);
      // Menunggu cone lewat; lempar pakan hanya bila sudah menunggu lama
      // (penjaga menempel di target) — jangan boroskan 3 pakan di awal.
      world.autoStageWait = (world.autoStageWait || 0) + dt;
      if (p.feedLeft > 0 && p.feedCooldown <= 0 && (world.autoStageWait || 0) > 5) {
        const near = world.guards.find((g) => Math.hypot(g.x - target.x, g.z - target.z) < 5);
        if (near && world.time - (world.lastFeedTry || -10) > 6) {
          world.lastFeedTry = world.time;
          world.autoStageWait = 0;
          p.facing = Math.atan2(near.x - p.x, near.z - p.z);
          return { ax: 0, az: 0, sneak: true, act: 'feed' };
        }
      }
      return { ax: 0, az: 0, sneak: true, act: null };
    }
  }
  world.autoStage = null;
  world.autoStageWait = 0;

  // Sudah di sisi mutiara: diam untuk mencongkel (channel 1 detik).
  if (targetKind === 'pearl') {
    const dd = Math.hypot(target.x - p.x, target.z - p.z);
    if (dd < 1.0) return { ax: 0, az: 0, sneak: true, act: null };
  }

  // Rencana jalur baru bila perlu.
  if (!world.autoPath || world.autoPath.length === 0 || world.autoReplan <= 0) {
    world.autoReplan = 0.4;
    world.autoPath = findPath(p.x, p.z, target.x, target.z, cellCost(hot), 0.45);
    // Titik pertama = sel start (sudah dilewati pemain) — mulai dari titik ke-2
    // supaya pemain tidak bolak-balik ke belakang setiap replan 0,4 detik.
    world.autoPathIndex = world.autoPath.length > 1 ? 1 : 0;
    world.autoDebug.branch = 'path';
    world.autoDebug.pathLen = world.autoPath.length;
    world.autoDebug.path = world.autoPath.map((w) => `(${w.x.toFixed(1)},${w.z.toFixed(1)})`).join(' ');
  }
  if (!world.autoPath || world.autoPath.length === 0) {
    // Tidak ada jalur murah: lempar pakan ke penjaga terdekat (dibatasi:
    // paling cepat 6 detik sekali supaya tidak memboroskan 3 pakan).
    if (p.feedLeft > 0 && p.feedCooldown <= 0 && world.time - (world.lastFeedTry || -10) > 6) {
      let near = null;
      let nd = Infinity;
      for (const g of world.guards) {
        const d = Math.hypot(g.x - p.x, g.z - p.z);
        if (d < nd) {
          nd = d;
          near = g;
        }
      }
      if (near && nd < 6.5) {
        world.lastFeedTry = world.time;
        p.facing = Math.atan2(near.x - p.x, near.z - p.z);
        return { ax: 0, az: 0, sneak: true, act: 'feed' };
      }
    }
    return { ax: 0, az: 0, sneak: true, act: null };
  }

  const idx = Math.min(world.autoPathIndex || 0, world.autoPath.length - 1);
  let wp = world.autoPath[idx];
  const d = Math.hypot(wp.x - p.x, wp.z - p.z);
  if (d < 0.35 && (world.autoPathIndex || 0) < world.autoPath.length - 1) {
    world.autoPathIndex = (world.autoPathIndex || 0) + 1;
    wp = world.autoPath[world.autoPathIndex];
  }
  // Hati-hati seperti manusia: menyelinap bila penjaga dekat, bila waypoint
  // disorot cone, atau bila meter mulai naik.
  let nearestGuard = Infinity;
  for (const g of world.guards) {
    const gd = Math.hypot(g.x - p.x, g.z - p.z);
    if (gd < nearestGuard) nearestGuard = gd;
  }
  const sneak = isHot(hot, wp.x, wp.z) || world.meter > 5 || nearestGuard < 4.5;
  return moveToward(world, wp.x, wp.z, sneak, hot);
}

function moveToward(world, tx, tz, sneak, hot) {
  const p = world.player;
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return { ax: 0, az: 0, sneak, act: null };
  return { ax: dx / d, az: dz / d, sneak, act: null };
}

// Bergerak ke titik tujuan LEWAT JALUR A* (bukan garis lurus) supaya tidak
// berjalan menabrak dinding dan terjepit di celah sempit antar kotak.
function moveAlongPath(world, tx, tz, sneak, hot) {
  if (!world.autoPath || world.autoPath.length === 0 || world.autoReplan <= 0) {
    world.autoReplan = 0.4;
    world.autoPath = findPath(world.player.x, world.player.z, tx, tz, cellCost(hot), 0.45);
    world.autoPathIndex = world.autoPath.length > 1 ? 1 : 0;
  }
  if (!world.autoPath || world.autoPath.length === 0) {
    return moveToward(world, tx, tz, sneak, hot);
  }
  const idx = Math.min(world.autoPathIndex || 0, world.autoPath.length - 1);
  let wp = world.autoPath[idx];
  const d = Math.hypot(wp.x - world.player.x, wp.z - world.player.z);
  if (d < 0.35 && (world.autoPathIndex || 0) < world.autoPath.length - 1) {
    world.autoPathIndex = (world.autoPathIndex || 0) + 1;
    wp = world.autoPath[world.autoPathIndex];
  }
  return moveToward(world, wp.x, wp.z, sneak, hot);
}

// --- Satu langkah simulasi (dt detik). Input: {ax, az, sneak, interact, feed} ---
export function updateWorld(world, dt, input, audio) {
  // Animasi ambient selalu jalan (ikan + gelembung).
  updateFish(world.fish, dt, world.feed, world.time);
  updateBubbles(world.bubbles, dt, world.time);
  if (world.messageTimer > 0) world.messageTimer -= dt;

  if (world.state === STATE_TITLE) {
    // Latar hidup: penjaga patroli, pemain hantu di luar arena (tak terlihat).
    for (const g of world.guards) updateGuard(g, dt, PHANTOM, null, world.time);
    world.time += dt;
    return;
  }
  if (world.state === STATE_WIN || world.state === STATE_LOSE || world.state === STATE_PAUSED) {
    return;
  }

  // --- PLAY ---
  world.time += dt;
  const p = world.player;

  // Pakan aktif: hitung mundur, lalu ikan bubar.
  if (world.feed && world.feed.active) {
    world.feed.timer -= dt;
    if (world.feed.timer <= 0) {
      world.feed.active = false;
      for (const g of world.guards) g.feedTarget = null;
    }
  }

  // Tentukan gerakan: autopilot atau pemain manusia.
  let ax = 0;
  let az = 0;
  let sneak = false;
  let doInteract = false;
  let doFeed = false;
  if (world.auto) {
    const step = autopilotStep(world, dt);
    ax = step.ax;
    az = step.az;
    sneak = step.sneak;
    doFeed = step.act === 'feed';
    doInteract = true; // autopilot mengambil otomatis saat dekat
    world.autoDebug = world.autoDebug || {};
    world.autoDebug.axis = [Number(ax.toFixed(2)), Number(az.toFixed(2))];
    world.autoDebug.sneak = sneak;
    world.autoDebug.channel = world.channel ? world.channel.pearlId : null;
  } else if (input) {
    const a = input.axis();
    ax = a.x;
    az = a.z;
    sneak = input.sneaking();
    doInteract = input.wasPressed('interact') || input.wasPressed('confirm');
    doFeed = input.wasPressed('feed');
  }

  const info = updatePlayer(p, ax, az, sneak, dt);
  if (p.moving && p.stepTimer <= 0) {
    p.stepTimer = sneak ? 0.55 : 0.38;
    if (audio) audio.step(sneak);
  }

  // Pemulih macet (autopilot): bila diperintah bergerak tapi posisi nyaris
  // tidak berubah selama 1,2 detik, buang rencana lama dan cari sel bebas
  // di dekat pemain sebagai jalan memutar.
  if (world.auto) {
    const moved = Math.hypot(p.x - (world.autoLastX ?? p.x), p.z - (world.autoLastZ ?? p.z));
    if (ax !== 0 || az !== 0) {
      if (moved < 0.06) {
        world.autoStuckTime = (world.autoStuckTime || 0) + dt;
      } else {
        world.autoStuckTime = 0;
      }
      if ((world.autoStuckTime || 0) > 1.2) {
        world.autoStuckTime = 0;
        world.autoPath = null;
        world.autoStage = null;
        const detour = nearestSafeCell(world, hotCells(world), p.x, p.z, 3.5);
        if (detour) {
          world.autoPath = findPath(p.x, p.z, detour.x, detour.z, null, 0.45);
          world.autoPathIndex = world.autoPath.length > 1 ? 1 : 0;
          world.autoReplan = 0.8;
        }
      }
    } else {
      world.autoStuckTime = 0;
    }
    world.autoLastX = p.x;
    world.autoLastZ = p.z;
  }

  if (doFeed) {
    const f = throwFeed(p);
    if (f) {
      world.feed = f;
      world.feedUsed += 1;
      setMessage(world, 'Pakan dilempar — ikan berkerumun, penjaga teralihkan!', 2.5);
      if (audio) audio.feed();
    }
  }

  // Ambil mutiara (E / otomatis untuk autopilot): mencongkel mutiara dari
  // alasnya butuh 1 detik diam di tempat — bergerak menjauh membatalkan.
  if (world.channel) {
    const ch = world.channel;
    const stillNear = info.pearl && info.pearl.id === ch.pearlId;
    if (!stillNear || p.moving) {
      world.channel = null;
    } else {
      ch.t += dt;
      setMessage(world, `Mengambil ${ch.name}…`, 0.3);
      if (ch.t >= 1.0) {
        const pearl = world.pearls.find((pp) => pp.id === ch.pearlId);
        if (pearl && !pearl.taken) {
          pearl.taken = true;
          world.pearlsTaken += 1;
          setMessage(world, `${pearl.name} didapat! (${world.pearlsTaken}/3)`, 2.5);
          if (audio) audio.pickup();
        }
        world.channel = null;
      }
    }
  } else if (doInteract && info.pearl) {
    const pearl = world.pearls.find((pp) => pp.id === info.pearl.id);
    if (pearl && !pearl.taken) {
      world.channel = { pearlId: pearl.id, name: pearl.name, t: 0 };
      setMessage(world, `Mengambil ${pearl.name}…`, 0.3);
    }
  }

  // Penjaga: AI + deteksi.
  let maxAlert = 0;
  for (const g of world.guards) {
    const ev = updateGuard(g, dt, p, world.feed, world.time);
    if (ev.becameChase) {
      world.spotted += 1;
      setMessage(world, `${g.name} melihatmu! Lari dan bersembunyi!`, 2.5);
      if (audio) audio.alert();
    } else if (ev.becameSuspicious && audio) {
      audio.suspicious();
    }
    if (ev.caught) {
      world.state = STATE_LOSE;
      if (audio) audio.lose();
      return;
    }
    if (g.alert > maxAlert) maxAlert = g.alert;
  }
  world.meter = maxAlert;

  // Menang: 3 mutiara + sampai EXIT.
  if (world.pearlsTaken >= 3 && info.atExit) {
    world.state = STATE_WIN;
    world.grade = gradeFor(world.time, world.spotted);
    if (audio) audio.win();
  }
}

// Jalankan simulasi N langkah tetap (1/60 dtk) tanpa input manusia —
// dipakai mode shot (?shot=...) supaya hasilnya deterministik.
export function simulate(world, seconds, auto) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    if (world.state === STATE_WIN || world.state === STATE_LOSE) break;
    updateWorld(world, 1 / 60, null, null);
  }
}

// Jalankan autopilot sampai menang/kalah (maks 150 detik simulasi).
export function simulateToEnd(world) {
  const maxSteps = 150 * 60;
  for (let i = 0; i < maxSteps; i++) {
    if (world.state === STATE_WIN || world.state === STATE_LOSE) break;
    updateWorld(world, 1 / 60, null, null);
  }
  return world.state;
}

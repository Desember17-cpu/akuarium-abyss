// Gerombolan ikan: berenang ambient di sekitar tangki, dan BERKERUMUN ke
// titik pakan saat pemain melempar (Q) — pengalih khas Akuarium Abyss.
import { createRandom, rangeRandom } from './random.js';
import { GLASS_TANKS } from './config.js';

const FISH_COUNT = 42;

export function createFish(rng) {
  const fish = [];
  const tanks = GLASS_TANKS;
  for (let i = 0; i < FISH_COUNT; i++) {
    const tank = tanks[i % tanks.length];
    fish.push({
      // Posisi awal: di dalam / di dekat tangki asal.
      x: tank.x + rangeRandom(rng, -tank.w / 2 + 0.3, tank.w / 2 - 0.3),
      z: tank.z + rangeRandom(rng, -tank.d / 2 + 0.3, tank.d / 2 - 0.3),
      homeX: tank.x,
      homeZ: tank.z,
      homeR: Math.max(tank.w, tank.d) / 2 + 1.2,
      angle: rng() * Math.PI * 2,
      orbitR: rangeRandom(rng, 0.8, 2.6),
      speed: rangeRandom(rng, 0.35, 0.9) * (rng() > 0.5 ? 1 : -1),
      size: rangeRandom(rng, 0.16, 0.3),
      hue: rng(),
      phase: rng() * Math.PI * 2,
      swarm: 0, // 0 = berenang bebas, 1 = berkerumun ke pakan
    });
  }
  return fish;
}

export function updateFish(fish, dt, feed, time) {
  for (const f of fish) {
    if (feed && feed.active) {
      // Berkerumun: spiral mendekat ke titik pakan.
      f.swarm = Math.min(1, f.swarm + dt * 1.5);
    } else {
      f.swarm = Math.max(0, f.swarm - dt * 0.8);
    }
    f.angle += f.speed * dt * (1 + f.swarm * 1.6);
    let cx = f.homeX;
    let cz = f.homeZ;
    let r = f.orbitR;
    if (f.swarm > 0 && feed) {
      cx = cx + (feed.x - cx) * f.swarm;
      cz = cz + (feed.z - cz) * f.swarm;
      r = f.orbitR * (1 - f.swarm * 0.75);
    }
    const wobble = Math.sin(time * 1.3 + f.phase) * 0.25;
    f.x = cx + Math.cos(f.angle) * r + wobble * 0.4;
    f.z = cz + Math.sin(f.angle) * r * 0.7 + wobble * 0.3;
    f.heading = f.angle + (f.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
}

// Gelembung udara ambient: naik pelan dari dasar, reset di permukaan.
export function createBubbles(rng, count) {
  const bubbles = [];
  for (let i = 0; i < count; i++) {
    bubbles.push({
      x: rangeRandom(rng, -12.5, 12.5),
      z: rangeRandom(rng, -8.5, 8.5),
      y: rangeRandom(rng, 0.3, 2.2),
      speed: rangeRandom(rng, 0.25, 0.6),
      size: rangeRandom(rng, 0.04, 0.1),
      phase: rng() * Math.PI * 2,
    });
  }
  return bubbles;
}

export function updateBubbles(bubbles, dt, time) {
  for (const b of bubbles) {
    b.y += b.speed * dt;
    b.x += Math.sin(time * 0.9 + b.phase) * 0.08 * dt;
    if (b.y > 2.5) {
      b.y = 0.25;
      b.x = -12.5 + ((b.x + 12.5 + 3.7) % 25);
    }
  }
}

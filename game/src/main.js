// Boot + loop utama: langkah tetap 1/60 dtk, layar title/play/win/lose,
// tombol mulai & ulangi, mute, dan mode shot untuk screenshot.
import { SHOT_SEED, BEST_KEY } from './config.js';
import { createWorld, startGame, updateWorld, STATE_TITLE, STATE_PLAY, STATE_WIN, STATE_LOSE, STATE_PAUSED } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const audio = createAudio();

if (shot) {
  // Mode screenshot: staging deterministik, lalu render TERUS via rAF supaya
  // buffer WebGL tetap tersaji saat Chrome mengambil screenshot
  // (tanpa loop, buffer bisa terhapus dan canvas tampil kosong).
  const world = createWorld(seed);
  const renderer = createRenderer(canvas, world);
  stageShot(shot, world, renderer);
  (function shotLoop() {
    requestAnimationFrame(shotLoop);
    renderer.render();
  })();
} else {
  const world = createWorld(seed);
  const renderer = createRenderer(canvas, world);
  const input = createInput(window);

  function readBest() {
    try {
      return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
    } catch {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      window.localStorage.setItem(BEST_KEY, String(value));
    } catch {
      // Penyimpanan bisa mati: rekor hanya bertahan kunjungan ini.
    }
  }

  world.best = readBest();

  function bindButton(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  bindButton('btn-start', () => {
    audio.unlock();
    startGame(world, false);
  });
  bindButton('btn-again', () => {
    audio.unlock();
    startGame(world, false);
  });
  bindButton('btn-retry', () => {
    audio.unlock();
    startGame(world, false);
  });
  bindButton('btn-mute', () => {
    const m = !input.isMuted();
    input.setMuted(m);
    audio.setMuted(m);
    const el = document.getElementById('btn-mute');
    if (el) el.textContent = m ? '🔇 Suara: Mati (M)' : '🔊 Suara: Hidup (M)';
  });
  input.onMuteChange((m) => {
    audio.setMuted(m);
    const el = document.getElementById('btn-mute');
    if (el) el.textContent = m ? '🔇 Suara: Mati (M)' : '🔊 Suara: Hidup (M)';
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      if (world.state === STATE_TITLE || world.state === STATE_WIN || world.state === STATE_LOSE) {
        audio.unlock();
        startGame(world, false);
      }
    }
    if (e.code === 'KeyR') {
      if (world.state === STATE_PLAY || world.state === STATE_WIN || world.state === STATE_LOSE || world.state === STATE_PAUSED) {
        audio.unlock();
        startGame(world, false);
      }
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (world.state === STATE_PLAY) world.state = STATE_PAUSED;
      else if (world.state === STATE_PAUSED) world.state = STATE_PLAY;
    }
  });

  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 5) {
      updateWorld(world, STEP, input, audio);
      acc -= STEP;
      guard += 1;
    }
    if (world.state === STATE_WIN && world.best > 0 && world.time < world.best) {
      saveBest(Math.floor(world.time));
      world.best = Math.floor(world.time);
    } else if (world.state === STATE_WIN && world.best === 0) {
      saveBest(Math.floor(world.time));
      world.best = Math.floor(world.time);
    }
    renderer.render();
    input.endFrame();
  }
  requestAnimationFrame(frame);
}

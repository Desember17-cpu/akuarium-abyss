// Mode shot (?shot=start|play|climax|end): staging deterministik untuk screenshot.
// Semua shot memakai seed tetap dan memainkan ATURAN ASLI — end screen adalah
// kemenangan autopilot MURNI dari state segar, tanpa override grade/statistik.
import { startGame, simulate, simulateToEnd, STATE_TITLE } from './world.js';

export function stageShot(name, world, renderer) {
  if (name === 'start') {
    world.state = STATE_TITLE;
  } else if (name === 'play') {
    startGame(world, true);
    simulate(world, 14, true);
  } else if (name === 'climax') {
    startGame(world, true);
    simulate(world, 30, true);
  } else if (name === 'end') {
    startGame(world, true);
    simulateToEnd(world);
  } else {
    world.state = STATE_TITLE;
  }
  // Gambar dua frame supaya tekstur + cone stabil, lalu tandai siap.
  renderer.render();
  renderer.render();
  window.__shotReady = true;
  window.__shotWorld = world;
  return world;
}

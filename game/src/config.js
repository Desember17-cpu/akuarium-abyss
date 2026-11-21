// AKUARIUM ABYSS — konfigurasi level, penjaga, dan konstanta gameplay.
// Semua angka level ada di sini supaya penyeimbang cukup mengedit satu file.

export const LEVEL = {
  halfW: 13, // x dari -13 sampai 13
  halfH: 9, // z dari -9 sampai 9
  wallHeight: 2.6,
};

// Dinding pembatas luar (solid, menghalangi gerak + pandangan).
export const WALLS = [
  { x: 0, z: -9, w: 26.6, d: 0.6 }, // utara
  { x: 0, z: 9, w: 26.6, d: 0.6 }, // selatan
  { x: -13, z: 0, w: 0.6, d: 18.6 }, // barat
  { x: 13, z: 0, w: 0.6, d: 18.6 }, // timur
];

// Tangki kaca raksasa: MENGHALANGI GERAK tapi TIDAK menghalangi pandangan.
// Cone visi yang melewatinya MEMBELOK (refraksi) dan deteksi melambat.
export const GLASS_TANKS = [
  { id: 'tangki-utara', x: 0, z: -6.7, w: 9.0, d: 3.0, h: 2.4, tint: 0x2fd4e8 },
  { id: 'tangki-timur', x: 10.35, z: 0, w: 3.7, d: 4.0, h: 2.4, tint: 0x25c8b8 },
  { id: 'tangki-barat', x: -10.35, z: 0, w: 3.7, d: 4.0, h: 2.4, tint: 0x3fa8e8 },
];

// Cover padat: menghalangi gerak DAN pandangan (line-of-sight putus).
export const COVERS = [
  { id: 'karang-a', x: -3.2, z: -3.2, w: 2.2, d: 1.6, h: 1.5, kind: 'coral' },
  { id: 'karang-b', x: 3.2, z: -3.2, w: 2.2, d: 1.6, h: 1.5, kind: 'coral' },
  { id: 'batu-c', x: -6.8, z: 4.2, w: 1.8, d: 1.8, h: 1.1, kind: 'rock' },
  { id: 'batu-d', x: 6.8, z: 4.2, w: 1.8, d: 1.8, h: 1.1, kind: 'rock' },
  { id: 'pilar-tengah', x: 0, z: 0.5, w: 1.2, d: 1.2, h: 2.6, kind: 'pillar' },
  { id: 'terumbu-f', x: -2.5, z: 5.2, w: 2.4, d: 1.4, h: 1.2, kind: 'coral' },
  { id: 'terumbu-g', x: 2.5, z: 5.2, w: 2.4, d: 1.4, h: 1.2, kind: 'coral' },
];

// Zona gelap (rumpun kelp): deteksi di sini hanya 40% — tempat memulihkan meter.
export const DARK_ZONES = [
  { x: -11, z: -6.5, r: 2.4 },
  { x: 11, z: -6.5, r: 2.4 },
  { x: -11, z: 6.5, r: 2.4 },
  { x: 11, z: 6.5, r: 2.4 },
];

// Tiga mutiara yang harus dicuri, lalu capai EXIT.
export const PEARLS = [
  { id: 'bulan', name: 'Mutiara Bulan', x: 0, z: -3.2, color: 0xeaf6ff, glow: 0xbfe8ff },
  { id: 'api', name: 'Mutiara Api', x: 7.2, z: 0, color: 0xffd9a0, glow: 0xff9a3d },
  { id: 'badai', name: 'Mutiara Badai', x: -7.2, z: 0, color: 0xc9b8ff, glow: 0x8f6bff },
];

export const EXIT = { x: 0, z: 8.55, r: 1.35 };
export const PLAYER_START = { x: -11, z: 7 };

// Penjaga: waypoint HANYA di ruang terbuka (sudah dicek bebas halangan).
// Jalur mereka tidak pernah memotong dinding / tangki / cover.
export const GUARDS = [
  {
    id: 'arif', name: 'Penyelam Arif', kind: 'diver',
    waypoints: [{ x: -7, z: -4.6 }, { x: 7, z: -4.6 }],
    speed: 1.7, chaseSpeed: 2.3, range: 7.0, halfAngle: 0.56, color: 0xffc861,
  },
  {
    id: 'bima', name: 'Penyelam Bima', kind: 'diver',
    waypoints: [{ x: 5.2, z: -6.5 }, { x: 5.2, z: 6.5 }],
    speed: 1.6, chaseSpeed: 2.2, range: 7.0, halfAngle: 0.56, color: 0xffc861,
  },
  {
    id: 'citra', name: 'Penyelam Citra', kind: 'diver',
    waypoints: [{ x: -7, z: 6.8 }, { x: 7, z: 6.8 }],
    speed: 1.7, chaseSpeed: 2.3, range: 7.0, halfAngle: 0.56, color: 0xffc861,
  },
  {
    id: 'dewi', name: 'Penyelam Dewi', kind: 'diver',
    waypoints: [{ x: -5.2, z: -6.5 }, { x: -5.2, z: 6.5 }],
    speed: 1.6, chaseSpeed: 2.2, range: 7.0, halfAngle: 0.56, color: 0xffc861,
  },
  {
    id: 'mako', name: 'Hiu-Robo Mako', kind: 'shark',
    waypoints: [
      { x: -5, z: -4.6 }, { x: 5, z: -4.6 }, { x: 5, z: 7.2 }, { x: -5, z: 7.2 },
    ],
    speed: 1.05, chaseSpeed: 1.8, range: 9.0, halfAngle: 0.78, color: 0xff5a5a,
  },
];

export const PLAYER = {
  radius: 0.42,
  walkSpeed: 4.0,
  sneakSpeed: 2.2,
  guardRadius: 0.45,
  sharkRadius: 0.62,
};

// Penyeimbang deteksi: sengaja pemaaf supaya game BISA dimenangkan.
export const DETECT = {
  rate: 42, // meter/detik saat terlihat penuh dari dekat
  decay: 38, // meter/detik saat tidak terlihat
  suspiciousAt: 30, // meter: penjaga menoleh (?)
  chaseAt: 65, // meter: penjaga mengejar (!)
  calmBelow: 10, // meter: curiga reda, kembali patroli
  catchDistance: 0.9, // penjaga sedekat ini = tertangkap
  glassFactor: 0.35, // terlihat lewat kaca: deteksi melambat (cahaya membias)
  darkFactor: 0.4, // di zona gelap: deteksi melambat
  sneakFactor: 0.6, // menyelinap: deteksi melambat
  searchTime: 4.0, // detik menggeledah titik terakhir terlihat
  loseSightTime: 1.8, // detik tanpa LOS sebelum berhenti mengejar
};

export const FEED = { count: 3, radius: 6.5, distractTime: 4.5, throwDistance: 3.2 };

export const SHOT_SEED = 7;
export const BEST_KEY = 'akuarium-abyss-best';

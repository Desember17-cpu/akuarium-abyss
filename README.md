# AKUARIUM ABYSS — Curi 3 Mutiara di Kegelapan Biru

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/Desember17-cpu/akuarium-abyss/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/Desember17-cpu/akuarium-abyss/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

Game stealth 3D (Three.js) di akuarium raksasa yang tutup tengah malam. Kau penyelam
pencuri: curi **Mutiara Bulan**, **Mutiara Api**, dan **Mutiara Badai** dari tangki
pajangan, lalu capai pintu **EXIT** di selatan — tanpa tertangkap 4 penyelam
keamanan dan 1 hiu robot patroli.

## Mekanik khas

- **Kaca membiaskan cone visi.** Kerucut visi penjaga membelok dan melebar saat
  melewati dinding kaca akuarium — dan mata penjaga lebih lambat mengenalimu lewat
  kaca (deteksi 35%). Bersembunyi di balik tangki itu nyata.
- **Gerombolan ikan sebagai pengalih.** Tekan **Q** untuk melempar pakan: ikan
  berkerumun ke titik itu dan penjaga di sekitar teralihkan (3x pakai).
- **Zona gelap kelp.** Rumpun kelp di sudut membuatmu sulit terlihat — meter
  deteksi hanya naik 40% di sana, tempat memulihkan diri.
- **Sistem stealth lengkap.** Patroli → curiga (?) → kejar (!) → geledah →
  patroli; meter deteksi; menyelinap (Shift) lebih lambat tapi lebih sunyi;
  mencongkel mutiara butuh 1 detik diam di tempat.
- **Suara synth WebAudio.** Gelembung langkah, denting mutiara, sting alert,
  ambient bawah laut — tanpa file audio eksternal. M untuk mute.

## Kontrol

| Tombol | Aksi |
|---|---|
| WASD / panah | Gerak |
| Shift | Menyelinap |
| E | Ambil mutiara (diam 1 detik saat mencongkel) |
| Q | Lempar pakan (pengalih ikan, 3x) |
| P / Esc | Jeda |
| R | Ulangi |
| M | Suara hidup/mati |
| Enter | Mulai / main lagi |

Menang: 3 mutiara + sampai EXIT. Kalah: penyelam yang mengejar menyentuhmu.
Grade S/A/B/C dari waktu dan berapa kali kau terlihat.

## Cara jalan

Game ini file statis tanpa build step — cukup layani folder repo dari HTTP:

```sh
python3 -m http.server 8000
# buka http://localhost:8000/game/index.html
```

Screenshot deterministik (dipakai untuk `screenshots/`):

```sh
# ?shot=start | play | climax | end, dengan seed tetap
http://localhost:8000/game/index.html?shot=climax&seed=7
```

Mode `end` dimainkan autopilot dari state segar dengan aturan asli sampai menang
— layar kemenangan di screenshot adalah kemenangan sungguhan, bukan paksaan.

## Struktur source (`game/src/`, satu-tugas-satu-file)

- `config.js` — layout level, penjaga, mutiara, penyeimbang deteksi
- `random.js` — RNG deterministik (mulberry32)
- `input.js` — keyboard
- `audio.js` — synth WebAudio
- `level.js` — geometri halangan, tabrakan, garis pandang, kaca
- `pathfind.js` — A\* grid (dipakai autopilot + penjaga mengejar)
- `guards.js` — AI penjaga + kerucut visi bervolume (refraksi kaca)
- `player.js` — gerak pemain + lempar pakan
- `fish.js` — gerombolan ikan + gelembung
- `world.js` — status game, meter deteksi, autopilot
- `render.js` — scene Three.js, cahaya, HUD, minimap
- `shots.js` — staging deterministik untuk screenshot
- `main.js` — boot + loop utama

Three.js 0.160.0 ter-vendor di `game/vendor/three.min.js`. Tidak ada request
jaringan saat bermain: semua file berasal dari `game/`.

## Hand-in

`main.ts` menyalin `game/` + `screenshots/` ke `MAKEFUN_OUTPUT_DIR`
(default `/output`) dan menulis `dossier.json` via `vendor/makefun-game.ts`:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Lisensi

MIT — lihat `LICENSE`.

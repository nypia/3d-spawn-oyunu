# SPAWN — 3D Survivors-like

Vampire Survivors / Megabonk tarzında, **3. şahıs kameralı 3D** bir tarayıcı oyunu.
Three.js + TypeScript ile yazıldı; PC (klavye + fare) ve mobil (dokunmatik, M5'te) hedefleniyor.

Oyun tasarımı, mimari ve yol haritası: **[docs/GDD.md](docs/GDD.md)**

## Hızlı başlangıç

```bash
npm install
npm run dev        # http://localhost:5173
```

## Kontroller

| Tuş | Eylem |
|---|---|
| WASD / oklar | Hareket |
| Fare | Kamera (oyun ekranına tıklayınca fare kilitlenir; kilitsizken sürükleyerek bakılır) |
| Space | Zıpla |
| Shift / C | Kay: yokuş aşağı hızlanırsın, kayarken zıplarsan momentum korunur |
| Q / E | Kamerayı döndür |
| 1 / 2 / 3 | Seviye atlama kartı seç |
| Esc | Duraklat |

## URL parametreleri

| Parametre | Açıklama |
|---|---|
| `?seed=123` | Sabit harita ve spawn dizisi |
| `?debug` | Performans paneli ve hile tuşları (G ölümsüz · J +100 düşman · K seviye · L +1 dk) |
| `?bench=1000` | 1000 düşmanlı performans testi (ölümsüz) |
| `?quality=low\|high` | Kalite seviyesini zorla (varsayılan: dokunmatik cihazda düşük) |

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Tip kontrolü + üretim derlemesi (`dist/`) |
| `npm run preview` | Derlenmiş sürümü sun |
| `npm run typecheck` | TypeScript kontrolü |
| `npm run lint` / `npm run format` | Biome ile lint ve format |
| `npm test` | Birim testleri + tarayıcısız 10 dakikalık simülasyon + performans testi |
| `npm run test:e2e` | Playwright ile tarayıcı smoke testi (önce `npm run build`) |

## Mimari özeti

- `src/sim/`: **render'dan bağımsız** oyun simülasyonu (60 Hz sabit adım). Node'da tarayıcısız
  çalıştırılıp test edilebilir. Düşman, mermi ve XP taşları bellek ayırmayan Struct-of-Arrays
  havuzlarında tutulur. Çarpışma ve "en yakın düşman" sorguları uzaysal ızgara ile yapılır.
- `src/data/`: tüm içerik ve denge sayıları (silahlar, kitaplar, düşmanlar, spawn eğrisi).
- `src/render/`: Three.js katmanı. Sim durumunu her karede okur, düşman türü başına tek
  draw call (InstancedMesh) kullanır.
- `src/ui/`: DOM tabanlı HUD ve menüler.

## Lisans / asset'ler

Şu an tüm modeller koddan üretilen yer tutucu şekillerdir. M3'te eklenecek CC0 asset'ler
(Kenney, Quaternius) `CREDITS.md` dosyasında listelenecek.

# SPAWN — 3D Survivors-like

Vampire Survivors / Megabonk tarzında, **3. şahıs kameralı 3D** bir tarayıcı oyunu.
Three.js + TypeScript ile yazıldı; PC (klavye + fare) ve telefonda (dokunmatik) oynanır.

Oyun tasarımı, mimari ve yol haritası: **[docs/GDD.md](docs/GDD.md)**

## Şu an oyunda neler var (M2)

- **8 silah:** Büyü Oku, Ateş Halesi, Kılıç Savuruşu, Yörünge Taşları, Bumerang Balta, Zincir Şimşek,
  Havan, Saçma Tüfeği.
- **8 kitap** (pasif stat) ve **nadirlik** (Sıradan / Nadir / Epik / Efsanevi). Seviye atlamada
  Yenile, Yasakla ve Atla hakları var.
- **6 düşman** (Balçık, İskelet, Yarasa, Patlayan, Okçu, Golem) ve 75 saniyede bir **elit**.
- **Altın, vazolar, sandıklar ve 10 eşya.** Elitler ücretsiz ödül sandığı düşürür.
- **Tapınaklar:** içinde 4 sn dur, 3 kalıcı bonustan birini seç.
- Hasar sayıları, kayma ve zıplama ile Megabonk tarzı hareket.
- PC (klavye + fare) ve **dokunmatik** kontroller.

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
| 1 / 2 / 3 / 4 | Kart seç (seviye atlama, tapınak) |
| R | Kartları yenile |
| E / Enter | Sandık eşyasını al |
| Esc | Duraklat |

**Dokunmatik:** ekranın sol yarısında sürükle → koş, sağ yarısında sürükle → kamera.
ZIPLA ve KAY (basılı tut) butonları sağ altta, duraklat sağ üstte.

## URL parametreleri

Yerelde query string, Artifact linkinde hash kullanılır (ikisi birleştirilebilir: `#debug.low.seed42`).

| Query | Hash | Açıklama |
|---|---|---|
| `?seed=123` | `#seed123` | Sabit harita ve spawn dizisi |
| `?debug` | `#debug` | Performans paneli ve hile tuşları (G ölümsüz · J +100 düşman · K seviye · L +1 dk) |
| `?bench=1000` | `#bench` / `#bench500` | Çok düşmanlı performans testi (ölümsüz) |
| `?quality=low\|high` | `#low` / `#high` | Kalite seviyesini zorla (varsayılan: dokunmatik cihazda düşük) |

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Tip kontrolü + üretim derlemesi (`dist/`) |
| `npm run preview` | Derlenmiş sürümü sun |
| `npm run typecheck` | TypeScript kontrolü |
| `npm run lint` / `npm run format` | Biome ile lint ve format |
| `npm test` | Birim testleri + tarayıcısız 10 dakikalık simülasyon + performans testi |
| `npm run test:e2e` | Playwright ile masaüstü ve telefon (dokunmatik) testleri (önce `npm run build`) |
| `npm run build:artifact` | claude.ai Artifact için tek dosyalık sayfa (`dist-artifact/spawn.html`) |

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

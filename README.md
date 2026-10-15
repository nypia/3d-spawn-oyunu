# SPAWN — 3D Survivors-like

Vampire Survivors / Megabonk tarzında, **3. şahıs kameralı 3D** bir tarayıcı oyunu.
Three.js + TypeScript ile yazıldı; PC (klavye + fare) ve telefonda (dokunmatik) oynanır.

Oyun tasarımı, mimari ve yol haritası: **[docs/GDD.md](docs/GDD.md)**

## Şu an oyunda neler var (v0.5)

- **20 dakikalık koşu + Kan Ayı (v0.5):** düşmanlar dakika dakika güçlenir, yaklaşık her 1,5 dakikada
  yeni bir yaratık katılır, belirli dakikalarda temalı dalgalar gelir ("Ölü yürüyüşü", "Yarasa
  fırtınası"…). 5., 10. ve 15. dakikada boss (Balçık Kral, Vampir Lordu, Taş Dev), 20. dakikada final
  boss **Kemik Kral**. Boss saldırıları yerde kırmızı uyarıyla gelir; doğru anda zıplarsan kurtulursun.
  Final boss ölünce oyun bitmez: dünya **Kan Ayı** gecesine döner, daha zor bir döngü başlar ve
  boss'lar "Kanlı" hâlleriyle geri gelir. Ölene kadar sürer; en iyi rekor saklanır.
- **Sandık çarkı (v0.5):** sandık sarsılır, kapağı açılır, eşyalar şerit hâlinde dönüp yavaşlar.
  Nadirliğe göre açılış efekti; efsanevide dönen altın ışınlar, konfeti ve "EFSANEVİ!" damgası.
- **Ses (v0.5):** vuruş, ölüm, patlama, toplama, sandık, boss ve Kan Ayı sesleri, menü / gündüz /
  boss / Kan Ayı müzikleri. Duraklatma ekranında ses ayarları, HUD'da 🔊, M tuşu.

- **Görsel cila (v0.4):** animasyonlu Kenney maceracısı (4 karakter arasından seçilir), iskelet ve ork
  okçu gibi gerçek modeller, koddan çizilip canlandırılmış Balçık, Yarasa, Patlayan ve Golem.
  Yüzlerce düşman GPU'da tek draw call ile yürür ve ölüm animasyonu oynar. Ağaçlı, çiçekli,
  rüzgârda salınan çimenli bir dünya, gökyüzü ve bulutlar. Bloom parıltısı, vuruş kıvılcımı, seken
  parçalar, patlama, taş toplama ışıltısı, seviye atlama sarmalı, koşu tozu ve meşale korları.
  Yuvarlak hatlı yazı tipleri ve yenilenmiş arayüz.

- **8 silah** ve her birinin **evrimi**. Silah maks seviyede ve eşleşen kitap sendeyken açtığın
  sandık evrim verir (ör. Büyü Oku + Hiddet Kitabı → Kutsal Asa).
- **8 kitap** (pasif stat) ve **nadirlik** (Sıradan / Nadir / Epik / Efsanevi). En fazla
  **4 silah + 4 kitap**; yuvalar dolunca sahip olduklarının seviyeleri çıkar. Seviye atlamada
  Yenile, Yasakla ve Atla hakları var.
- **10 düşman** (Balçık, İskelet, Yarasa, Zombi, Patlayan, Okçu, Hayalet, Vampir, Golem, Mezar
  Bekçisi), giderek sıklaşan **elitler**. Hayalet engellerden geçer, Vampir hazırlanıp atılır,
  Bekçi peşinden gelen mor küreler atar.
  Güçlü düşmanlar daha değerli, farklı renkte XP taşı düşürür (mavi → yeşil → kırmızı → mor).
- **Altın, vazolar ve sandıklar.** Sandıktan nadirliğe göre **14 benzersiz eşya** çıkar
  (Anka Tüyü, Yankı Yüzüğü, Buz Kristali, Roket Çizme…). Elitler ücretsiz sandık düşürür.
- **Meşaleler:** çevrende belirir, kırınca altın kesesi, tavuk, **mıknatıs** (XP ve altını
  çeker), **Saat** (düşmanları dondurur) ya da **Tespih** (çevreyi temizler) düşer.
- **Ruh Kazanları:** yakınında öldürdüğün düşmanların ruhları kazana akar; dolunca patlar ve
  şanslı bir kazan sandığı bırakır.
- **Lanet Sunakları:** güç + kalıcı bir lanet içeren iki paktdan birini seç ya da reddet.
- **Hazine Goblini:** ara sıra çıkar ve kaçar; vurdukça altın saçar, yakalarsan altın yağmuru.
- **Rehber** (duraklat ekranında): tüm eşyalar ve evrimler.
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
| 1 / 2 / 3 / 4 | Kart seç (seviye atlama, pakt) |
| R | Kartları yenile |
| E / Enter | Sandık çarkını atlat, eşyayı al |
| Esc | Duraklat · paktı reddet |
| M | Sesi kapat / aç |

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
| `npm run diag` | Denge raporu: bot dakika dakika seviye, doğan türler, boss'lar; 8 seed'de ölüm süreleri |
| `npm run fetch-assets` / `npm run fetch-audio` | Kenney modellerini / sesleri ve müzikleri indirip küçültür (ffmpeg gerekir) |
| `npm run test:e2e` | Playwright ile masaüstü ve telefon (dokunmatik) testleri (önce `npm run build`) |
| `npm run build:artifact` | claude.ai Artifact için tek dosyalık sayfa (`dist-artifact/spawn.html`) |

## Mimari özeti

- `src/sim/`: **render'dan bağımsız** oyun simülasyonu (60 Hz sabit adım). Node'da tarayıcısız
  çalıştırılıp test edilebilir. Düşman, mermi ve XP taşları bellek ayırmayan Struct-of-Arrays
  havuzlarında tutulur. Çarpışma ve "en yakın düşman" sorguları uzaysal ızgara ile yapılır.
- `src/data/`: tüm içerik ve denge sayıları (silahlar, kitaplar, düşmanlar, spawn eğrisi).
- `src/render/`: Three.js katmanı. Sim durumunu her karede okur. Düşmanlar `crowd/CrowdMesh` ile
  çizilir: animasyonlar kemik matrisi dokusuna önceden pişirilir, her düşman türü tek draw call ile
  kendi animasyon karesini oynar. Efektler `fx/` altında havuzlu parçacıklardır. Yüksek kalitede
  bloom art işlemi açıktır; yavaş cihazda bloom ve çözünürlük kendiliğinden düşer.
- `src/ui/`: DOM tabanlı HUD ve menüler (sandık çarkı `ChestReel`, açılış efektleri `rewardFx`).
- `src/audio/`: Web Audio. `AudioManager` (kanallar, ses sınırlayıcı, konumlu ses, müzik geçişi) ve
  `SoundEvents` (sim olaylarını kendi imleciyle okuyup sese çevirir).

## Lisans / asset'ler

3D modeller ve ses efektleri [Kenney](https://kenney.nl) (CC0), müzikler Juhani Junkala
"Chiptune Adventures" (CC0, OpenGameArt), yazı tipleri Baloo 2 ve Nunito (SIL OFL 1.1).
Ayrıntılar `CREDITS.md` dosyasında. Yeniden indirmek için: `npm run fetch-assets`, `npm run fetch-audio`.

# SPAWN — Oyun Tasarım Dokümanı ve Yol Haritası

> 3D survivors-like (Vampire Survivors / Megabonk tarzı) · Three.js + TypeScript · PC + mobil
> Bu doküman yaşayan bir plandır; her kilometre taşında güncellenir.

## Durum

| Aşama | Durum |
|---|---|
| M0 — İskelet | ✅ Tamam |
| M1 — Oynanabilir prototip | ✅ Tamam |
| M2 — Çekirdek sistemler | ✅ Tamam: 8 silah, 8 kitap, nadirlik, yenile/yasakla/atla, 6 düşman + elit, altın, vazo, sandık, 10 eşya, tapınak, hasar sayıları |
| M5 (kısmen) — Dokunmatik kontroller | ✅ Öne alındı: joystick, kamera sürükleme, ZIPLA/KAY, otomatik kamera, kısa ekran düzeni |
| v0.3 — Geri bildirim turu + VS ilhamı | ✅ Tamam: XP taşı hatası, taş kademeleri, 4+4 yuva görünür, mıknatıs altın çeker, 14 benzersiz eşya, meşaleler + Saat/Tespih, silah evrimi, rehber |
| M3 — Görsel (v0.4) | ✅ Tamam: Kenney modelleri, animasyonlu kalabalık (CrowdMesh), el yapımı rig'ler, kahraman seçimi, dünya (ağaç, çimen, gök), bloom, parçacıklar, arayüz cilası |
| v0.5 — Zorluk, boss'lar, Kan Ayı, ses | ✅ Tamam: zaman çizelgeli spawn ve doğrusal olmayan ölçekleme, 4 yeni yaratık, 4 boss + tehlike alanları, Kan Ayı döngüleri, Ruh Kazanı / Lanet Sunağı / Hazine Goblini (tapınak kalktı), sandık çarkı ve nadirlik efektleri, ses ve müzik |
| M3 — Ses | ✅ Tamam (v0.5) |
| M4 (bölüm yapısı: 20 dk + Kan Ayı), M5'in kalanı, M6, M7 | Kısmen / planlandı |

**Oynanabilir sürüm:** claude.ai Artifact olarak yayınlanıyor (`npm run build:artifact`). three.js
jsDelivr CDN'den yüklenir, geri kalan her şey tek HTML dosyasına gömülür. Artifact'a query string
ulaşmadığı için hata ayıklama bayrakları hash ile verilir (`#debug`, `#low`, `#seed42`, `#bench`).

### M2'de netleşen sayılar (denge turu sonrası)
- XP eğrisi `6 · n^1.35`; spawn kredisi `0.9 + 0.85·dk + 0.12·dk²`; düşman canı `+%16/dk`, hasarı `+%8/dk`.
- Kuşatma halkası her dakika `12 + 5·dk` balçık (20 m). Elit her 75 sn.
- Taban can yenilenmesi 0.25/sn. Sandık 20 altından başlar, her açılışta ×1.4.
- Düşmanlardan kaçan ve XP toplayan bir botla ölçüldü: 9. dakikada ~21. seviye, ekranda 150–600 düşman.
  Normal botlar seed'e ve silah seçimine göre 3–15. dakika arasında ölüyor.

### v0.3'te değişen sayılar
- XP eğrisi `6 · n^1.42`. Düşman XP'si zamanla `×(1 + 0.08·dk)` artar. Okçu 4, Golem 8, elit ×12 XP verir.
- Yerde en fazla 800 XP taşı. Yeni taş 1 m içindeki taşla birleşir. Havuz doluysa oyuncuya en uzak
  taş yeni taşa katılır, yani XP kaybolmaz.
- Mıknatıs: vazodan %8, elitten %50, meşaleden (sv5+) düşer.
- `npm run diag` botuyla: 9. dakikada ~25. seviye, yerde ≤800 taş. Normal bot 6 seed'in 5'inde
  15 dakikayı tamamladı. Eski sürümde bu oran 3/6 idi; v0.3 daha kolay. M3'ten sonra yeniden ayarlanacak.

### v0.5'te değişenler
- **Kök neden:** spawn direktörü krediyi 1'e ulaşır ulaşmaz harcıyordu; pahalı türler (iskelet, okçu,
  golem) neredeyse hiç doğmuyordu. Artık önce tür seçilip kredisi biriktiriliyor.
- **Zaman çizelgesi** (`data/waves.ts`): 0–20 dk'da yaklaşık 1,5 dk'da bir yeni tür (Zombi 4:00,
  Patlayan 5:30, Okçu 7:00, Hayalet 8:30, Vampir 11:00, Golem 12:30, Mezar Bekçisi 14:00); Balçık ve
  İskelet emekliye ayrılır. 23 temalı olay (çember, sürü, akın).
- **Ölçekleme** (m = dakika, c = döngü): can `(1 + 0.08m + 0.025m²)·1.5^(c−1)`, hasar
  `(1 + 0.04m + 0.004m²)·1.3^(c−1)`, hız `min(1.2, 1 + 0.01m)·1.06^(c−1)`, kredi `1 + m + 0.08m²`.
  XP eğrisi `5 · n^1.42`, taban can yenilenmesi 0.5/sn.
- **Boss'lar:** 5:00 Balçık Kral, 10:00 Vampir Lordu, 15:00 Taş Dev, 20:00 Kemik Kral (final).
  Saldırılar kırmızı uyarı alanlarıyla gösterilir; iyi zamanlanmış zıplama kurtarır.
- **Kan Ayı:** final boss ölünce dünya kızıl geceye döner, daha zor bir döngü başlar (çizelge 8:00'dan
  1,5 kat hızla), boss'lar "Kanlı" döner, sonraki final 40:00'ta. Oyun ölene kadar sürer; rekor saklanır.
- `npm run diag` botu (dengeli yapı kurar, uyarı alanlarından kaçar, sandık açmaz): normal botlar
  5–21. dakikada (medyan ~12) ölüyor, ölümsüz bot 20. dakikada ~86. seviyede.

## Bağlam

Proje sıfırdan başladı. Hedef: Vampire Survivors / Megabonk türünde,
**3. şahıs kameralı, 3D, tarayıcıda çalışan**, hem **PC (klavye+mouse)** hem **mobil (dokunmatik)**
oynanabilen bir oyun. Görseller **CC0 low-poly asset** (Kenney, Quaternius) ile yapılacak.

Verilen kararlar: Three.js + TypeScript · Megabonk gibi 3. şahıs kamera, zıplama/kayma, engebeli
harita · low-poly ücretsiz asset · PC + mobil.

Not: Türün mekanikleri serbesttir, ama Megabonk/VS'nin isimleri, görselleri ve birebir içerikleri
kopyalanmayacak. Silah, karakter ve düşman isimleri bize özgü olacak.

---

## 1. Oyun Tasarımı (GDD özeti)

### 1.1 Temel döngü
```
Koş → silahlar otomatik saldırır → düşmanlar ölür → XP taşı düşer → topla → seviye atla
→ 3 kart arasından seç (silah / kitap / güç) → daha güçlü ol → daha kalabalık sürüyle başa çık
→ altınla sandık aç (eşya ya da evrim), Ruh Kazanı doldur, pakt yap, goblin kovala, meşale kır
→ 5/10/15. dk'da boss, 20. dk'da final → Kan Ayı döngüsü (ölene kadar)
Run bitince: gümüş kazan → kalıcı açılımlar (meta) → yeni run
```

### 1.2 Run yapısı (bir bölüm)
- **Bölüm süresi 10:00.** Ekranın üstünde geri sayım var.
- 0–8 dk: dalgalar giderek yoğunlaşır, her 60–90 sn'de bir **elit** düşman çıkar (sandık düşürür).
- **Bölüm sonu (v0.5): Kan Ayı.** Megabonk'taki boss portalı **yok** (kullanıcı kararı). 20. dakikadaki
  final boss ölünce oyun bitmez: dünya olduğu yerde kızıl geceye döner ve daha zor bir döngü başlar.
- MVP: 2 bölüm (biyom). Sonra 3. bölüm ve zorluk kademeleri gelir.

### 1.3 Kontroller
| Eylem | PC | Mobil |
|---|---|---|
| Hareket | WASD | Sol yarıda yüzen joystick |
| Kamera | Mouse (pointer lock) | Sağ yarıda sürükle + hareket yönüne otomatik dönüş |
| Zıplama | Space | Sağ altta buton |
| Kayma | Shift / Ctrl | Sağ altta buton |
| Etkileşim (sandık/sunak) | Üzerine yürü | Üzerine yürüyünce otomatik |
| Duraklat | Esc | Sol üst buton + uygulama arka plana gidince otomatik |

Silahlar **otomatik nişan alır**. Bu yüzden mobilde kamerayı kontrol etmek zorunlu değil.

### 1.4 Hareket (Megabonk hissi)
- Hızlanma/yavaşlama eğrisi, havada kısıtlı kontrol, **coyote time** ve **zıplama buffer'ı**.
- **Kayma (slide):** düzlükte kısa bir hamle. Yokuş aşağı kayınca eğim yönünde hız kazanılır.
  Kaymadan zıplanırsa momentum korunur (bunny-hop).
- **Çift zıplama:** eşya veya kitapla açılır.
- Hareket hızı bir stat'tır. Hız build'leri oyunun tarzının bir parçası.

### 1.5 İlerleme sistemleri
- **XP taşları:** renk ve boy değere göre değişir: mavi ≤2, yeşil ≤9, kırmızı ≤49, mor 50+ (elit).
  Güçlü düşmanlar üst kademe taş düşürür. Yakın düşen taşlar birleşir. Sınır (800) dolunca en uzak
  taş yeni taşa katılır, XP kaybolmaz. Mıknatıs tüm taşları ve altını çeker.
- **Seviye eğrisi:** `xpToNext(n) = round(6 * n^1.42)`. Değer `data/balance.ts` içinde, oynayarak ayarlanır.
- **Seviye atlama ekranı:** 3 kart (Şans stat'ı yüksekse 4). Her kart bir **nadirlik** taşır:
  Sıradan / Nadir / Epik / Efsanevi. Nadirlik bonusun büyüklüğünü çarpanla artırır (×1 / ×1.5 / ×2 / ×3).
  Kartlar üç tür olabilir: yeni silah, silah yükseltmesi, kitap (pasif stat).
  - **Yeniden çek (reroll)**, **yasakla (banish)**, **atla (skip)** hakları: run başına sınırlı,
    meta ile artırılır.
- **Slotlar:** 4 silah + 4 kitap. HUD'da boş yuvalar kesik çizgiyle görünür. Seviye ekranında
  "Silah 3/4 · Kitap 2/4" yazar. Yuvalar dolunca yalnızca sahip olunanların seviyeleri çıkar.
  Meta ile 5'e çıkabilir.
- **Altın:** düşmanlardan, vazolardan ve meşalelerden düşer. **Sandık** açmak altın ister ve her
  açılışta fiyatı artar. Sandıktan nadirlik zarı atılmış bir **eşya** ya da **evrim** çıkar.
- **Silah evrimi:** silah maks seviyede (8) ve eşleşen kitap en az Sv.1 iken açılan sandık evrim verir.
- **Ruh Kazanı (v0.5, tapınağın yerine):** 9 m içinde ölen düşmanların ruhları kazana akar; dolunca
  patlar, şanslı bir kazan sandığı bırakır, 60 sn soğur ve her seferinde daha çok ruh ister.
- **Lanet Sunağı:** iki pakt sunar (güç + kalıcı lanet, ör. +%25 hasar / −%20 maks can); reddedilebilir.
- **Hazine Goblini:** ara sıra çıkar ve kaçar; vurdukça altın saçar, yakalanınca altın yağmuru.
- **Sandık çarkı:** açılan sandıkta eşyalar şerit halinde döner; nadirliğe göre açılış efekti
  (efsanevide ışınlar, konfeti, "EFSANEVİ!" damgası). Boss sandığı 3 eşya verir.

### 1.6 MVP içerik listesi

**Silahlar (8).** Her silah veriyle tanımlanır, davranışı yeniden kullanılabilir bir modüldür.
Maksimum seviye 8. Her seviye kendi yükseltmesini getirir; kartın nadirliği onu büyütür.

| Silah | Davranış | Not |
|---|---|---|
| Kılıç Savuruşu | Yakın dövüş yayı (melee arc) | En yakın düşmana döner |
| Büyü Oku | Hedef takip eden mermi | Başlangıç silahı |
| Yörünge Taşları | Oyuncunun etrafında döner | Sayı +1 ile güçlenir |
| Ateş Halesi | Sürekli alan hasarı (aura) | Alan stat'ı ile büyür |
| Bumerang Balta | Gidip dönen, düşmanı delip geçen mermi | |
| Zincir Şimşek | Hedefler arasında sekme | Sekme sayısı yükseltilir |
| Havan | Yay çizerek düşen alan hasarı (AoE) | Önce yere uyarı halkası çizilir |
| Saçma Tüfeği | Koni şeklinde çoklu mermi | Hareket yönüne ateşler |

**Kitaplar (pasif stat, 8):** Güç (hasar %), Çeviklik (hareket hızı), Hiddet (saldırı hızı),
Çoğaltma (mermi sayısı), Genişlik (alan %), Mıknatıs (toplama mesafesi), Can (maks HP + yenilenme),
Şans (nadirlik ve kart sayısı).

**Silah evrimleri (8).** Evrim aynı davranışı daha güçlü bir tabanla kullanır. Alınmış yükseltmeler
korunur ve evrimin kendi efekt rengi olur.

| Silah | Kitap | Evrim |
|---|---|---|
| Büyü Oku | Hiddet | Kutsal Asa |
| Ateş Halesi | Can | Cehennem Halesi |
| Kılıç Savuruşu | Güç | Kan Kılıcı (360°) |
| Yörünge Taşları | Genişlik | Gezegen Halkası |
| Bumerang Balta | Çoğaltma | Kasırga Baltası |
| Zincir Şimşek | Şans | Fırtına |
| Havan | Mıknatıs | Meteor Yağmuru |
| Saçma Tüfeği | Çeviklik | Ejderha Nefesi |

**Eşyalar (sandıktan, 14).** Nadirliğe göre gruplanır ve her birinin kendine özgü bir etkisi var.
Sandık önce nadirlik zarı atar (Şans etkiler), sonra o kademeden bir eşya seçer.

| Nadirlik | Eşyalar |
|---|---|
| Sıradan | Tüy (+1 zıplama), Altın Sikke (altın +%30), Bandaj (seviye atlayınca 15 can), Mıknatıs Taşı (40 sn'de bir 15 m'deki XP ve altını çeker) |
| Nadir | Vampir Dişi (öldürünce can), Dikenli Zırh (zırh + hasar yansıtma), Keskin Göz (kritik şansı ve hasarı), Roket Çizme (kayarken çarptığın düşman hasar alır, sen almazsın) |
| Epik | Kalkan Muskası (12 sn'de bir vuruşu engeller), Patlayan Kafatası (öldürünce patlama), Buz Kristali (vuruşlar %8 dondurur), Anka Tüyü (bir kez diriliş + patlama) |
| Efsanevi | Lanetli Taç (+%25 düşman, XP ve altın +%30), Yankı Yüzüğü (silahlar %20 ihtimalle iki kez ateşlenir) |

**Düşmanlar (6 + elit):**
| Düşman | Davranış |
|---|---|
| Balçık | Yavaş, basit kovalayıcı. İlk dakikaların kalabalığı |
| İskelet | Orta hızda kovalayıcı |
| Yarasa | Hızlı, düşük HP, uçar (yerden yüksekte) |
| Golem | Yavaş ve tank. Geri itilmeye dirençli |
| Okçu | Mesafe korur, ateş eder (mermi dodge edilebilir) |
| Patlayan | Yaklaşınca şişer ve patlar (telegraph'lı) |
| Elit (her tür) | Daha büyük, parlayan, ×8 HP. Ücretsiz sandık, altın ve %50 mıknatıs düşürür |

**Karakterler (3, meta ile daha fazlası):**
| Karakter | Başlangıç silahı | Pasif |
|---|---|---|
| Şövalye | Kılıç Savuruşu | +%15 maks HP, +2 zırh |
| Büyücü | Büyü Oku | +%10 alan, +%10 süre |
| Avcı | Bumerang Balta | +%10 hareket hızı, +1 zıplama |

### 1.7 Spawn direktörü (türün kalbi)
- **Kredi bütçesi:** her saniye `bütçe += baseRate * zamanEğrisi(t) * lanet`. Bütçe, o dakikada
  açık olan düşman türlerine harcanır. Her türün bir `cost` ve `unlockTime` değeri var.
- **Yerleşim:** oyuncu etrafında 28–38 m'lik halkada doğarlar. Hareket yönüne doğru ağırlıklıdır,
  mümkünse kamera görüş alanı dışındadır. Y koordinatı arazi yüksekliğine oturtulur (`h(x,z)`).
- **Senaryolu olaylar** (`data/stages.ts`): belirli saniyelerde "kuşatma halkası", "yarasa sürüsü",
  elit doğuşu.
- **Aktif düşman sınırı:** masaüstünde 600, mobilde 250. Sınıra ulaşılınca yeni düşman doğmaz,
  onun yerine mevcutların HP çarpanı artar (zorluk düşmez).
- **Geri dönüşüm:** oyuncudan 60 m'den uzak düşmanlar, oyuncunun önündeki halkaya ışınlanır.
- **Ölçekleme:** düşman HP'si `×(1 + 0.12·dk)`, hasarı `×(1 + 0.06·dk)`. Bölüm geçince taban çarpanlar artar.

### 1.8 Harita
- **Prosedürel yükseklik haritası (heightmap):** simplex noise + seed. Boyut 320×320 m ve sınırları
  sarp kayalık/çit. Tepe, çukur ve rampalar sayesinde kayma ve zıplama anlamlı olur.
- Dekor (ağaç, kaya, mezar taşı) instanced olarak çizilir. Engeller fizikte basit daire çarpıştırıcıdır.
- Kazan, sunak, sandık ve vazo seed'li olarak, birbirinden minimum mesafeyle yerleşir. Meşaleler ise
  oyuncunun çevresinde oyun sırasında belirir.
- Biyom 1: Çayır/Orman. Biyom 2: Mezarlık/Çöl (farklı renk paleti, sis rengi ve düşman havuzu).

### 1.9 Vampire Survivors'tan ilham alınanlar (v0.3)
- **Taş kademeleri:** XP değeri büyüdükçe taş rengi değişir (mavi → yeşil → kırmızı → mor). Taş sınırı
  aşılınca fazlası tek taşta birikir.
- **Silah evrimi:** maks silah + eşleşen kitap + sandık (yukarıdaki tablo).
- **Meşaleler (ışık kaynakları):** 10 sn'de bir oyuncunun 15–30 m çevresinde belirir (yakında en
  fazla 6). Yürüyerek ya da silahla kırılır. Düşenler seviye kapılıdır ve Şans nadirleri artırır:

  | Ödül | Oran | Etki |
  |---|---|---|
  | Altın kesesi | %55 | 3–6 altın |
  | Tavuk | %20 | 25 can |
  | Mıknatıs | %12 (sv5+) | Tüm XP taşlarını ve altını çeker |
  | Saat | %8 (sv4+) | 40 m'deki düşmanları 6 sn dondurur |
  | Tespih | %5 (sv8+) | 30 m'deki elit olmayanları yok eder, elitlerin canının %35'i |

- Nadir pickup'ların (mıknatıs, saat, tespih) üstünde uzaktan görünen bir ışık sütunu olur.
- **Rehber:** duraklat ekranında eşyalar (nadirliğe göre) ve evrimler listelenir.

### 1.10 Meta ilerleme
- Run sonunda **gümüş** kazanılır (kill, süre, bölüm). Gümüşle kalıcı yükseltmeler alınır:
  +%HP, +reroll, +slot, başlangıç altını.
- **Görevler/başarımlar** yeni içerik açar ("Balta ile 500 düşman öldür → Avcı açılır",
  "1. bölümü bitir → Havan havuza eklenir").
- Kayıt `localStorage`'a sürümlü JSON olarak yazılır, migrasyon fonksiyonları vardır.

---

## 2. Teknik Mimari

### 2.1 Teknoloji yığını
- **Vite** (dev server + build) · **TypeScript (strict)** · **three** (0.186.x) · **simplex-noise**.
- Arayüz framework'süz: **DOM + CSS katmanı**. HUD ve menüler mobilde responsive olur, erişilebilirlik kolaylaşır.
- Test: **Vitest** (birim + headless simülasyon) ve **Playwright** (tarayıcı smoke testi; Chromium hazır kurulu).
- Lint/format: **Biome** (tek araç).
- Fizik motoru **yok**. Survivors-like için gereksiz ve yavaş. Kinematik karakter, heightmap
  örnekleme ve spatial hash yeterli.
- Dağıtım: GitHub Actions ile **GitHub Pages**. Telefondan link ile oynanır. PWA manifest ile tam
  ekran ve yatay mod. İleride istenirse Capacitor (mağazalar) veya Electron/Tauri (Steam).

### 2.2 Ana prensip: Simülasyon ve render ayrımı
- `src/sim/` render'dan **bağımsızdır**. Sadece `three`'nin matematik sınıflarını (Vector3 vb.)
  kullanabilir. Scene, Mesh ve Renderer kullanmaz. Bu sayede 10 dakikalık bir run Node'da
  **headless** olarak test edilebilir. Dengeleme ve regresyon testleri de buna dayanır.
- `src/render/` her karede sim state'ini okuyup çizer. Sim'e veri yazmaz.
- **Sabit adımlı döngü:** sim 60 Hz, render requestAnimationFrame ile. 120 Hz ekranlar için
  render interpolasyonu sonraki aşamada eklenir. Duraklatma ve level-up ekranında sim durur.
- **Seed'li RNG** (mulberry32): tekrarlanabilir run'lar, testler ve `?seed=123` ile hata ayıklama.

### 2.3 Veri odaklı havuzlar (performansın anahtarı)
- `EnemyPool`, `ProjectilePool`, `PickupPool`, `ParticlePool`: **Struct-of-Arrays** tipli diziler
  (`Float32Array posX/posY/posZ/velX/velZ/hp`, `Uint16Array typeId`, `Uint8Array flags`).
  Sabit kapasiteleri vardır. Ölen elemanın yerine son eleman taşınır (swap-remove), oyun sırasında
  hiç bellek ayırma (GC) olmaz.
- **SpatialHash** (XZ düzleminde 4 m'lik ızgara): düşman-düşman ayrışması, mermi-düşman çarpışması,
  pickup mıknatısı, oyuncuya temas hasarı ve "en yakın düşman" sorguları.
- Uzaktaki düşmanların yapay zekası her 2–3 tick'te bir güncellenir (LOD).

### 2.4 Render katmanı
- **InstancedMesh:** her düşman türü, mermi türü, XP taşı ve dekor türü için 1 draw call. Hedef
  toplam draw call < 100.
- **Düşman animasyonu (v0.4, `crowd/`):** her vertex tek bir kemiğe bağlı olduğu için kemik
  matrisleri klip klip, kare kare bir float dokusuna pişirilir (`bakeRig`). `CrowdMesh` instance başına
  (kare A, kare B, ara oran, flaş) taşır; vertex shader iki kareyi harmanlar. Yürüme hızı sim'deki
  yürünen yola bağlıdır (donan düşman pozunu korur). Ölenler kısa süre `die` klibini oynayan
  "ceset" olur. İskelet ve okçu Kenney modelleri, Balçık/Yarasa/Patlayan/Golem koddan çizilen
  prosedürel rig'lerdir. Vuruş flaşı beyaz, donma buz mavisi, elit altın tonludur.
- **Oyuncu:** Kenney maceracısı, `AnimationMixer` (idle/yürü/koş/zıpla/düş/kay/öl, geçişli).
  Başlangıç ekranında 4 karakterden biri seçilir (kozmetik).
- **Kamera rig'i:** orbit (yaw/pitch) ve yaylı kol. Araziye girmemesi için yükseklik kontrolü,
  yumuşak takip ve hafif ekran sarsıntısı (ayarlardan kapatılabilir).
- **Işık:** 1 directional (gölge sadece oyuncu çevresindeki dar frustum'da) + hemisphere + mesafe sisi.
  Düşük kalitede gölge yerine oyuncu altında "blob" gölge decal'i kullanılır.
- **Hasar sayıları:** rakam atlası texture'ı + instanced quad'lar (DOM yerine, yüzlercesi aynı anda).
- **VFX (v0.4, `fx/`):** kameraya dönük kart parçacıkları (toplamalı kıvılcım/ışıltı, normal karışımlı
  toz/duman) ve seken katı parçalar (kırıntı, altın para). Kaynaklar sim olay akışlarıdır: vuruş,
  ölüm, patlama, kırılma, toplama (`collectFx`). Ayrıca seviye atlama sarmalı, koşu/kayma/iniş tozu,
  meşale korları ve büyü oku izi.
- **Parıltı:** yüksek kalitede HDR bloom (RenderPass → UnrealBloomPass, eşik 1 → OutputPass, MSAA).
  Işıyan şeyler (taş, büyü, alev, rün) 1'in üstünde renk verir. Düşük kalitede bloom yerine
  toplamalı "parıltı kartları" kullanılır. Kalite elle seçilmediyse 3 sn boyunca 45 FPS altında
  kalınca önce bloom, sonra piksel oranı düşer.
- **Dünya:** gradyan gök kubbesi + güneş, low-poly bulutlar, ufukla aynı renkte sis, Kenney doğa
  modelleri (ağaç, kaya, çiçek, mantar, çalı) ve rüzgârda salınan çimen tutamları. Statik
  serpinti oyuncuya uzaklığa göre kırpılır (`CulledInstances`).

### 2.5 Kalite ve performans bütçesi
| | Masaüstü | Mobil (orta segment) |
|---|---|---|
| Hedef FPS | 60 | 30–60 |
| Aktif düşman | 600 (stres testi 1000) | 250 |
| Pixel ratio sınırı | 2.0 | 1.25 |
| Gölge | Dar frustum | Blob decal |
| Materyal | MeshStandard / Toon | MeshLambert |

- 3 kalite seviyesi (Düşük/Orta/Yüksek). Mobil cihaz algılanırsa Düşük ile başlanır.
- **Dinamik çözünürlük:** FPS bir süre hedefin altında kalırsa pixel ratio düşürülür.

### 2.6 Stat ve silah sistemleri
- **Stats:** taban değer + modifier yığını (`add`, `mult`). Değişince bir kez hesaplanıp cache'lenir.
  Stat'lar: maxHp, regen, armor, moveSpeed, jumpCount, damage, attackSpeed, projectileCount, area,
  duration, projectileSpeed, critChance, critDamage, pickupRange, xpGain, goldGain, luck, knockback,
  lifesteal, curse.
- **Silah = veri + davranış.** `data/weapons.ts` içindeki tanım (id, isim, ikon, davranış, taban
  stat'lar, yükseltme havuzu) ile `sim/combat/behaviors/*` (projectile, homing, orbit, aura, arc,
  chain, boomerang, mortar, cone) birleşir. Yeni silah eklemek çoğunlukla sadece veri yazmaktır.
- **Hasar:** `hasar = taban × (1 + damage%) × (kritik ? critDamage : 1)`. Oyuncunun aldığı hasar
  `× 100/(100+armor)` ile azalır. Her düşmanın temas hasarı en fazla 0.5 sn'de bir uygulanır.
- **UpgradeRoller:** havuz = sahip olunan ve maksa ulaşmamış silahlar + boş slot varsa yeni
  silahlar + kitaplar. Ağırlıklı rastgele seçilir. Nadirlik zarı Şans ile kayar. Yasaklanan
  kartlar havuzdan çıkar.

### 2.7 Arayüz (DOM)
- HUD: HP barı, XP barı + seviye, sayaç, kill ve altın, 4 silah + 4 kitap yuvası (seviye, evrimde ★,
  evrime hazırsa parlama), eşya ikonları, kısa duyurular.
- Ekranlar: Ana menü → Karakter seçimi → Oyun → Seviye atlama kartları → Duraklat/Ayarlar →
  Oyun sonu/Zafer (istatistik: silah başına hasar) → Meta mağaza/Görevler.
- Mobil: joystick, zıplama/kayma butonları, ≥ 44 px dokunma hedefleri, `safe-area-inset`,
  yatay mod uyarısı, uygulama arka plana gidince (`visibilitychange`) otomatik duraklatma.
- Dil: Türkçe + İngilizce (`ui/i18n`).

### 2.8 Ses
- Web Audio (three `AudioListener`). SFX havuzlanır ve **kısılır** (aynı ses bir karede en fazla N
  kez çalar, yüzlerce vuruş kulak tırmalamasın). Müzik döngüsü, Master/Müzik/SFX ayrı ses seviyeleri.
- Mobilde ilk dokunuşta AudioContext açılır (`resume`).

### 2.9 Asset'ler (CC0)
- **Kenney:** Nature Kit, Graveyard Kit, Particle Pack, UI Pack, Game Icons, Impact/Interface/RPG
  Audio, Kenney Fonts.
- **Quaternius:** Ultimate Animated Character Pack (oyuncu), Ultimate Monsters (düşmanlar),
  Stylized Nature MegaKit.
- `kenney.nl` ve `quaternius.com` bu ortamdan erişilebilir durumda (kontrol edildi). Her paketin
  lisansı indirirken tekrar doğrulanacak ve `CREDITS.md`'ye yazılacak.
- Pipeline: GLB → `gltf-transform` ile optimize (meshopt, texture boyutu ≤ 1024, mobil için 512).
  Hedef ilk yükleme < 25 MB. `public/assets/manifest.json` ve yükleme ekranı.
- Asset yüklenemezse fallback olarak primitive şekiller (kapsül/küre) kullanılır, oyun yine çalışır.

### 2.10 Klasör yapısı
(✔ = M1'de var, diğerleri ilgili aşamada eklenecek)
```
index.html · package.json · tsconfig.json · vite.config.ts · biome.json · playwright.config.ts   ✔
public/assets/{models,textures,audio,fonts}/ · public/manifest.webmanifest                      (M3, M5)
src/
  main.ts                                                                                         ✔
  core/        Game.ts (durum makinesi + sabit adımlı döngü), Input.ts, Rng.ts                     ✔
  sim/         world/{World,Obstacles,EventRing}.ts                                               ✔
               terrain/Heightmap.ts · spatial/SpatialGrid.ts · stats/Stats.ts                      ✔
               player/Player.ts · enemies/{EnemyPool,SpawnDirector}.ts                             ✔
               combat/ProjectilePool.ts · weapons/Weapons.ts · pickups/GemPool.ts                  ✔
               progression/Upgrades.ts                                                            ✔
               interactables/{Chest,Shrine,Vase,Torches}.ts · stage/StageRunner.ts              (M2, M4)
  data/        balance.ts, enemies.ts, weapons.ts, tomes.ts                                       ✔
               items.ts, characters.ts, stages.ts                                                 (M2, M4, M6)
  render/      Renderer3D.ts, CameraRig.ts, TerrainView.ts, WorldView.ts, HeroView.ts,
               PropsView.ts, Scatter.ts, Sky.ts, Quality.ts, shapes.ts                              ✔
               assets/{loadAssets,staticModels}.ts · crowd/{bakeRig,CrowdMesh,proceduralRigs}.ts   ✔
               fx/{Effects,Particles,Debris,Sprites}.ts · DamageNumbers.ts                         ✔
  audio/       AudioManager.ts                                                                    (M3)
  ui/          Hud.ts, Screens.ts, dom.ts, styles.css                                             ✔
               touch/VirtualJoystick.ts, i18n/{tr,en}.ts                                          (M5, M6)
  meta/        SaveSystem.ts, Unlocks.ts, Quests.ts                                               (M6)
  debug/       DebugOverlay.ts                                                                    ✔
tests/         unit/*.test.ts · sim/headless-run.test.ts · e2e/smoke.spec.ts                      ✔
docs/GDD.md    (bu doküman)                                                                       ✔
.github/workflows/{ci,pages}.yml                                                                  ✔
```

### 2.11 Debug araçları
- `?debug`: FPS/ms, aktif düşman/mermi/pickup sayısı, draw call, spatial hash görselleştirme.
- Hile tuşları (sadece `?debug` ile): **G** ölümsüzlük, **J** +100 düşman, **K** seviye atla, **L** +1 dk.
- `?bench=1000`: 1000 düşmanlı performans sahnesi. `?seed=N`: sabit harita ve spawn.

---

## 3. Yol Haritası (kilometre taşları)

Her aşama oynanabilir bir sürümle biter. Branch `claude/elegant-turing-4ce5nm`'e commit/push edilir.
Her aşamadan sonra senden geri bildirim alıp devam ederim.

**M0 — İskelet**
Vite + TS + three kurulumu, Biome, Vitest, Playwright, CI (typecheck/lint/test/build),
GitHub Pages deploy, `docs/GDD.md`, boş sahne ve sabit adımlı döngü.
✔ Kabul: `npm run dev` ile dönen bir sahne açılır, CI yeşil.

**M1 — Oynanabilir prototip (primitive şekillerle)**
Heightmap arazi, oyuncu kontrolcüsü (koş/zıpla/kay/eğimde hızlan), 3. şahıs kamera, Balçık + İskelet,
basit spawn direktörü, Büyü Oku, XP taşları, seviye atlama (3 kart, nadirlik yok), HP, ölüm ekranı, temel HUD.
✔ Kabul: 5 dakika eğlenceli şekilde oynanabiliyor, 300 düşmanda 60 FPS.

**M2 — Çekirdek sistemler**
Stat/modifier sistemi, 8 silah, 8 kitap, nadirlik + reroll/banish/skip, tam spawn direktörü
(kredi, olaylar, sınır, geri dönüşüm), 6 düşman + elit, altın, sandık + 10 eşya, tapınak, vazo,
hasar sayıları, mıknatıs, XP taşı birleştirme, headless sim testi.
✔ Kabul: 10 dk'lık bot run'ı hatasız biter, build çeşitliliği hissediliyor.

**M3 — Görsel ve ses**
Kenney/Quaternius asset'leri, oyuncu animasyonları, instanced düşmanlar + shader animasyonu + vuruş
flaşı, VFX, telegraph halkaları, ışık/sis/biyom paleti, SFX + müzik, yükleme ekranı, `CREDITS.md`.
✔ Kabul: Masaüstünde 600 düşmanda 60 FPS, oyun "gerçek oyun" gibi görünüyor.
Görsel kısım v0.4'te, ses (Kenney CC0 efektler + Juhani Junkala müzikleri, `AudioManager` +
`SoundEvents`) v0.5'te tamamlandı.

**v0.3 — Geri bildirim turu (tamamlandı)**
XP taşı hatası, güçlü düşman XP'si ve taş kademeleri, 4+4 yuva görünür, mıknatıs altını da çeker,
14 benzersiz eşya, meşaleler + Saat/Tespih/kese, silah evrimi, rehber.

**M4 — Bölüm yapısı**
Bölüm sonu mekaniği ileride birlikte seçilecek (boss portalı **yok**). Ayrıca zafer ekranı,
2. biyom (Mezarlık), bölümler arası geçiş ve oyun sonu istatistikleri.
✔ Kabul: 2 bölüm baştan sona oynanabiliyor.

**M5 — Mobil**
Dokunmatik joystick ve butonlar, kamera otomatik takip, responsive HUD/menüler, kalite seviyeleri,
dinamik çözünürlük, PWA (tam ekran, yatay mod), arka planda duraklatma, ses unlock.
✔ Kabul: GitHub Pages linkinden orta segment bir telefonda 250 düşmanda ≥ 30 FPS.

**M6 — Meta ilerleme**
Ana menü, karakter seçimi (3 karakter), gümüş, kalıcı yükseltme mağazası, görevler/açılımlar,
kayıt sistemi (sürümlü), ayarlar (ses, hassasiyet, kalite, dil, ekran sarsıntısı, hasar sayıları).
✔ Kabul: Run'lar arası ilerleme kalıcı, yeni içerik görevlerle açılıyor.

**M7 — Cila ve yayın**
Denge turu (headless sim ile istatistik), ilk oyun ipuçları, erişilebilirlik, render interpolasyonu,
hata/çökme koruması, itch.io build'i. Sonraki fikirler: VAT animasyonları,
yeni biyomlar, zorluk kademeleri, gamepad desteği.

---

## 4. Doğrulama

- **Hızlı kontroller (her commit):** `npm run typecheck`, `npm run lint`, `npm test`.
- **Birim testleri (Vitest):** RNG determinizmi, Stats modifier hesabı, XP eğrisi, UpgradeRoller
  (ağırlık, nadirlik, Şans etkisi, banish), SpawnDirector bütçesi ve sınırı, SpatialHash sorguları,
  heightmap'te mesh yüksekliği ile `h(x,z)` örneğinin tutarlılığı, kayıt migrasyonu.
- **Headless sim testi:** `World` Node'da sabit seed ile 10 sim-dakikası çalıştırılır. Bot daireler
  çizerek koşar ve hep ilk kartı seçer. Doğrulananlar: NaN yok, exception yok, düşman sayısı sınırın
  altında, tick başına süre bütçede.
- **Tarayıcı smoke testi (Playwright, hazır kurulu Chromium):** `npm run build && npm run preview`.
  Masaüstü ve mobil (dokunmatik emülasyon) viewport'unda: canvas render ediliyor, konsolda hata yok,
  tuş/dokunma ile oyuncu hareket ediyor, level-up ekranı açılıyor. Ekran görüntüleri alınıp sana gösterilir.
- **Performans:** `?bench=1000` sahnesinde FPS ve draw call ölçümü.
- **Gerçek cihaz:** GitHub Pages linkinden telefonda deneme. Bunu senin yapman gerekiyor.
  Repo ayarlarından Pages'in "GitHub Actions" kaynağıyla açılması gerekecek.

## 5. Riskler ve önlemler
| Risk | Önlem |
|---|---|
| Mobilde yüzlerce düşmanda FPS düşüşü | Instancing, SoA havuzlar, düşman sınırı, kalite seviyeleri, dinamik çözünürlük |
| Animasyonlu düşmanları instancing ile çizmek | MVP'de shader ile prosedürel animasyon, sonra VAT |
| 3. şahıs kamera mobilde zor | Otomatik nişan + kameranın hareket yönüne otomatik dönmesi |
| Asset paketleri büyük | gltf-transform ile sıkıştırma, mobil texture boyutu, lazy load |
| Denge zorluğu | Tüm sayılar `data/` altında, headless sim ile otomatik istatistik |

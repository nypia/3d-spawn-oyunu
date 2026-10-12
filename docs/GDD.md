# SPAWN — Oyun Tasarım Dokümanı ve Yol Haritası

> 3D survivors-like (Vampire Survivors / Megabonk tarzı) · Three.js + TypeScript · PC + mobil
> Bu doküman yaşayan bir plandır; her kilometre taşında güncellenir.

## Durum

| Aşama | Durum |
|---|---|
| M0 — İskelet | ✅ Tamam |
| M1 — Oynanabilir prototip | ✅ Tamam (2 silah, 7 kitap, 3 düşman; primitive modeller) |
| M2 — Çekirdek sistemler | ⏳ Sırada |
| M3–M7 | Planlandı |

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
→ altınla sandık aç, tapınak doldur → boss portalı → sonraki bölüm
Run bitince: gümüş kazan → kalıcı açılımlar (meta) → yeni run
```

### 1.2 Run yapısı (bir bölüm)
- **Bölüm süresi 10:00.** Ekranın üstünde geri sayım var.
- 0–8 dk: dalgalar giderek yoğunlaşır, her 60–90 sn'de bir **elit** düşman çıkar (sandık düşürür).
- Haritada **Boss Portalı** var. 3. dakikadan sonra oyuncu portala girip **şarj ederse** (alanda
  5 sn durursa) bölüm boss'u gelir. Boss ölünce sonraki bölüme geçilir.
- Süre biterse **"Son Dalga"** başlar: durmadan güçlenen, ölümcül bir sürü. Bu baskı oyuncuyu
  portala gitmeye iter (Megabonk'taki gerilim).
- MVP: 2 bölüm (biyom). Sonra 3. bölüm ve zorluk kademeleri gelir.

### 1.3 Kontroller
| Eylem | PC | Mobil |
|---|---|---|
| Hareket | WASD | Sol yarıda yüzen joystick |
| Kamera | Mouse (pointer lock) | Sağ yarıda sürükle + hareket yönüne otomatik dönüş |
| Zıplama | Space | Sağ altta buton |
| Kayma | Shift / Ctrl | Sağ altta buton |
| Etkileşim (sandık/tapınak) | E (veya üzerine yürü) | Üzerine yürüyünce otomatik |
| Duraklat | Esc | Sol üst buton + uygulama arka plana gidince otomatik |

Silahlar **otomatik nişan alır**. Bu yüzden mobilde kamerayı kontrol etmek zorunlu değil.

### 1.4 Hareket (Megabonk hissi)
- Hızlanma/yavaşlama eğrisi, havada kısıtlı kontrol, **coyote time** ve **zıplama buffer'ı**.
- **Kayma (slide):** düzlükte kısa bir hamle. Yokuş aşağı kayınca eğim yönünde hız kazanılır.
  Kaymadan zıplanırsa momentum korunur (bunny-hop).
- **Çift zıplama:** eşya veya kitapla açılır.
- Hareket hızı bir stat'tır. Hız build'leri oyunun tarzının bir parçası.

### 1.5 İlerleme sistemleri
- **XP taşları:** renkleri değerine göre değişir. Yerde çok fazla taş birikirse yakındakiler
  birleşir (performans için). Mıknatıs pickup'ı tüm taşları çeker.
- **Seviye eğrisi:** `xpToNext(n) = round(8 * n^1.4)`. Değer `data/balance.ts` içinde, oynayarak ayarlanır.
- **Seviye atlama ekranı:** 3 kart (Şans stat'ı yüksekse 4). Her kart bir **nadirlik** taşır:
  Sıradan / Nadir / Epik / Efsanevi. Nadirlik bonusun büyüklüğünü çarpanla artırır (×1 / ×1.5 / ×2 / ×3).
  Kartlar üç tür olabilir: yeni silah, silah yükseltmesi, kitap (pasif stat).
  - **Yeniden çek (reroll)**, **yasakla (banish)**, **atla (skip)** hakları: run başına sınırlı,
    meta ile artırılır.
- **Slotlar:** 4 silah + 4 kitap (MVP). Meta ile 5'e çıkabilir.
- **Altın:** düşmanlardan ve kırılabilir vazolardan düşer. **Sandık** açmak altın ister ve her
  açılışta fiyatı artar. Sandıktan nadirlik zarı atılmış bir **eşya** çıkar.
- **Tapınak (Shrine):** haritaya dağılmış halkalar. İçinde 4 sn durunca 3 stat bonusundan biri seçilir.
  Her tapınak bir kez kullanılır.

### 1.6 MVP içerik listesi

**Silahlar (8).** Her silah veriyle tanımlanır, davranışı yeniden kullanılabilir bir modüldür.
Maksimum seviye 10. Her seviye atlama rastgele bir stat yükseltmesi getirir (nadirlikle ölçeklenir).

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

**Eşyalar (sandıktan, 10):** Vampir Dişi (can çalma), Tüy (+1 zıplama), Altın Sikke (+altın),
Dikenli Zırh (hasar yansıtma), Kalkan Muskası (her 12 sn'de 1 vuruşu engeller), Patlayan Kafatası
(öldürülen düşman %10 ihtimalle patlar), Yonca (+şans), Kum Saati (+süre), Çizme (+kayma hızı),
Lanetli Taç (+zorluk, +XP ve +altın).

**Düşmanlar (6 + elit + boss):**
| Düşman | Davranış |
|---|---|
| Balçık | Yavaş, basit kovalayıcı. İlk dakikaların kalabalığı |
| İskelet | Orta hızda kovalayıcı |
| Yarasa | Hızlı, düşük HP, uçar (yerden yüksekte) |
| Golem | Yavaş ve tank. Geri itilmeye dirençli |
| Okçu | Mesafe korur, ateş eder (mermi dodge edilebilir) |
| Patlayan | Yaklaşınca şişer ve patlar (telegraph'lı) |
| Elit (her tür) | Daha büyük, parlayan, ×8 HP. Sandık anahtarı/sandık düşürür |
| Boss (bölüm başına 1) | 3 saldırı: hücum (charge), uyarı halkalı yere vurma, minyon çağırma |

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
  elit doğuşu, boss.
- **Aktif düşman sınırı:** masaüstünde 600, mobilde 250. Sınıra ulaşılınca yeni düşman doğmaz,
  onun yerine mevcutların HP çarpanı artar (zorluk düşmez).
- **Geri dönüşüm:** oyuncudan 60 m'den uzak düşmanlar, oyuncunun önündeki halkaya ışınlanır.
- **Ölçekleme:** düşman HP'si `×(1 + 0.12·dk)`, hasarı `×(1 + 0.06·dk)`. Bölüm geçince taban çarpanlar artar.

### 1.8 Harita
- **Prosedürel yükseklik haritası (heightmap):** simplex noise + seed. Boyut 320×320 m ve sınırları
  sarp kayalık/çit. Tepe, çukur ve rampalar sayesinde kayma ve zıplama anlamlı olur.
- Dekor (ağaç, kaya, mezar taşı) instanced olarak çizilir. Engeller fizikte basit daire çarpıştırıcıdır.
- Tapınak, sandık, vazo ve boss portalı da seed'li olarak, birbirinden minimum mesafeyle yerleşir.
- Biyom 1: Çayır/Orman. Biyom 2: Mezarlık/Çöl (farklı renk paleti, sis rengi ve düşman havuzu).

### 1.9 Meta ilerleme
- Run sonunda **gümüş** kazanılır (kill, süre, bölüm, boss). Gümüşle kalıcı yükseltmeler alınır:
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
- **Düşman animasyonu:** SkinnedMesh instancing'i zor olduğu için MVP'de düşman modelinin statik
  pozu kullanılır. Animasyon vertex shader'da prosedüreldir (zıplama, sallanma, squash-stretch).
  Instance başına faz ve renk attribute'u vardır, **vuruş flaşı** da buradan yapılır. Low-poly
  "oyuncak" hissine uyar. Sonraki aşamada VAT (vertex animation texture) ile gerçek yürüme döngüleri gelir.
- **Oyuncu, elitler ve boss:** gerçek `SkinnedMesh` + `AnimationMixer` (idle/koş/zıpla/kay/öl).
- **Kamera rig'i:** orbit (yaw/pitch) ve yaylı kol. Araziye girmemesi için yükseklik kontrolü,
  yumuşak takip ve hafif ekran sarsıntısı (ayarlardan kapatılabilir).
- **Işık:** 1 directional (gölge sadece oyuncu çevresindeki dar frustum'da) + hemisphere + mesafe sisi.
  Düşük kalitede gölge yerine oyuncu altında "blob" gölge decal'i kullanılır.
- **Hasar sayıları:** rakam atlası texture'ı + instanced quad'lar (DOM yerine, yüzlercesi aynı anda).
- **VFX:** havuzlanmış instanced parçacıklar (vuruş kıvılcımı, ölüm "puf"u, seviye atlama ışığı, telegraph halkaları).

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
- HUD: HP barı, XP barı + seviye, sayaç, kill ve altın, silah/kitap ikonları ve seviyeleri, boss HP barı.
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
- **Quaternius:** Ultimate Animated Character Pack (oyuncu), Ultimate Monsters (düşman/boss),
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
               interactables/{Chest,Shrine,BossPortal,Vase}.ts · stage/StageRunner.ts              (M2, M4)
  data/        balance.ts, enemies.ts, weapons.ts, tomes.ts                                       ✔
               items.ts, characters.ts, stages.ts                                                 (M2, M4, M6)
  render/      Renderer3D.ts, CameraRig.ts, TerrainView.ts, WorldView.ts, PlayerView.ts,
               Quality.ts, shapes.ts (yer tutucu modeller)                                         ✔
               Assets.ts, BossView.ts, vfx/{Particles,DamageNumbers,Telegraphs}.ts                 (M2, M3, M4)
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

**M4 — Bölüm yapısı**
10 dk sayaç, boss portalı + şarj, boss (3 saldırı paterni), Son Dalga, zafer ekranı, 2. biyom
(Mezarlık), bölümler arası geçiş, oyun sonu istatistikleri.
✔ Kabul: 2 bölüm baştan sona oynanıp kazanılabiliyor.

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
hata/çökme koruması, itch.io build'i. Sonraki fikirler: silah evrimleri, VAT animasyonları,
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

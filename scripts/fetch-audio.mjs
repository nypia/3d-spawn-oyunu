// Oyunun seslerini indirir ve küçültür: Kenney (CC0) ses paketlerinden seçilen efektler ve
// OpenGameArt'tan Juhani Junkala'nın "Chiptune Adventures" müzikleri (CC0).
//  - Zip/ogg kaynakları .cache/audio/ altına bir kez indirilir (git'e girmez).
//  - ffmpeg ile mono MP3'e çevrilir (her tarayıcıda, Safari dahil, çalar); efektlerde baştaki ve
//    sondaki sessizlik kırpılır.
//  - Çıktılar src/assets/audio/{sfx,music}/ altına yazılır ve commit edilir; CREDITS.md'ye ses
//    bölümü eklenir. Kullanım: npm run fetch-audio (ffmpeg ve unzip gerekir).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE = '.cache/audio';
const OUT = 'src/assets/audio';
const KENNEY = 'https://kenney.nl/media/pages/assets';

const PACKS = {
  casino: {
    title: 'Casino Audio',
    page: 'https://kenney.nl/assets/casino-audio',
    path: 'casino-audio/2472606a04-1721639069/kenney_casino-audio.zip',
  },
  rpg: {
    title: 'RPG Audio',
    page: 'https://kenney.nl/assets/rpg-audio',
    path: 'rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip',
  },
  impact: {
    title: 'Impact Sounds',
    page: 'https://kenney.nl/assets/impact-sounds',
    path: 'impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
  },
  ui: {
    title: 'Interface Sounds',
    page: 'https://kenney.nl/assets/interface-sounds',
    path: 'interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
  },
  jingles: {
    title: 'Music Jingles',
    page: 'https://kenney.nl/assets/music-jingles',
    path: 'music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip',
  },
  digital: {
    title: 'Digital Audio',
    page: 'https://kenney.nl/assets/digital-audio',
    path: 'digital-audio/216eac4753-1677590265/kenney_digital-audio.zip',
  },
  scifi: {
    title: 'Sci-fi Sounds',
    page: 'https://kenney.nl/assets/sci-fi-sounds',
    path: 'sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip',
  },
};

/** Oyundaki ses kimliği → [paket, zip içindeki dosya adı]. Kimlikler src/audio/sounds.ts ile aynı. */
const SFX = {
  // Arayüz
  click: ['ui', 'click_002.ogg'],
  select: ['ui', 'select_002.ogg'],
  back: ['ui', 'back_002.ogg'],
  reroll: ['casino', 'card-shuffle.ogg'],
  banish: ['ui', 'scratch_002.ogg'],
  tick: ['ui', 'tick_002.ogg'],
  bong: ['ui', 'bong_001.ogg'],
  // Sandık ve açılış
  creak: ['rpg', 'creak1.ogg'],
  latch: ['rpg', 'metalLatch.ogg'],
  revealCommon: ['ui', 'confirmation_001.ogg'],
  revealRare: ['digital', 'powerUp3.ogg'],
  revealEpic: ['jingles', 'jingles_PIZZI07.ogg'],
  revealLegend: ['jingles', 'jingles_NES00.ogg'],
  levelUp: ['jingles', 'jingles_NES13.ogg'],
  gameOver: ['jingles', 'jingles_SAX07.ogg'],
  bossDead: ['jingles', 'jingles_STEEL07.ogg'],
  goblinCaught: ['jingles', 'jingles_PIZZI03.ogg'],
  // Dövüş
  hit1: ['impact', 'impactPunch_medium_000.ogg'],
  hit2: ['impact', 'impactPunch_medium_002.ogg'],
  crit: ['impact', 'impactPunch_heavy_000.ogg'],
  deathSoft: ['impact', 'impactSoft_medium_001.ogg'],
  deathBone: ['impact', 'impactWood_light_002.ogg'],
  deathHeavy: ['impact', 'impactPunch_heavy_002.ogg'],
  explosion: ['scifi', 'explosionCrunch_000.ogg'],
  boom: ['scifi', 'lowFrequency_explosion_000.ogg'],
  hurt: ['impact', 'impactSoft_heavy_000.ogg'],
  // Silahlar ve düşman atışları
  bolt: ['scifi', 'laserSmall_001.ogg'],
  axe: ['rpg', 'cloth3.ogg'],
  pellet: ['impact', 'impactMetal_light_001.ogg'],
  swing: ['rpg', 'knifeSlice.ogg'],
  zap: ['digital', 'zap1.ogg'],
  arrow: ['rpg', 'knifeSlice2.ogg'],
  orb: ['digital', 'phaserDown2.ogg'],
  // Toplama ve güçler
  gem: ['ui', 'glass_001.ogg'],
  coin: ['casino', 'chips-collide-1.ogg'],
  coins: ['rpg', 'handleCoins.ogg'],
  heal: ['digital', 'pepSound1.ogg'],
  magnet: ['digital', 'phaserUp2.ogg'],
  freeze: ['scifi', 'forceField_000.ogg'],
  bell: ['impact', 'impactBell_heavy_000.ogg'],
  vase: ['impact', 'impactPlate_light_001.ogg'],
  wood: ['impact', 'impactWood_medium_001.ogg'],
  // Oyuncu
  jump: ['digital', 'phaseJump1.ogg'],
  land: ['impact', 'footstep_grass_002.ogg'],
  step1: ['impact', 'footstep_grass_000.ogg'],
  step2: ['impact', 'footstep_grass_003.ogg'],
  slide: ['rpg', 'cloth2.ogg'],
  // Olaylar
  slime: ['scifi', 'slime_000.ogg'],
  force: ['scifi', 'forceField_002.ogg'],
  spikes: ['impact', 'impactMining_001.ogg'],
};

const MUSIC_PAGE = 'https://opengameart.org/content/4-chiptunes-adventure';
const MUSIC_BASE =
  'https://opengameart.org/sites/default/files/Juhani%20Junkala%20%5BChiptune%20Adventures%5D%20';
const MUSIC = {
  day: '1.%20Stage%201.ogg',
  blood: '2.%20Stage%202.ogg',
  boss: '3.%20Boss%20Fight.ogg',
  menu: '4.%20Stage%20Select.ogg',
};

const curl = (url, out) => execFileSync('curl', ['-sSfL', '--retry', '3', '-o', out, url]);
const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

mkdirSync(CACHE, { recursive: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'sfx'), { recursive: true });
mkdirSync(join(OUT, 'music'), { recursive: true });

// Kenney paketleri: lisans dosyası CC0 olmalı.
for (const p of Object.values(PACKS)) {
  p.zip = join(CACHE, p.path.split('/').pop());
  if (!existsSync(p.zip)) {
    console.log(`indiriliyor: ${p.title}`);
    curl(`${KENNEY}/${p.path}`, p.zip);
  }
  const names = execFileSync('unzip', ['-Z1', p.zip]).toString().split('\n');
  p.names = names;
  const lic = names.find((n) => /license/i.test(n));
  const text = lic ? execFileSync('unzip', ['-p', p.zip, lic]).toString() : '';
  if (!/CC0|Creative Commons Zero/i.test(text)) throw new Error(`${p.title}: CC0 lisansı bulunamadı`);
}

const tmp = join(CACHE, 'tmp.ogg');
let sfxBytes = 0;
for (const [id, [pack, file]] of Object.entries(SFX)) {
  const p = PACKS[pack];
  const entry = p.names.find((n) => n.endsWith(`/${file}`) || n === file);
  if (!entry) throw new Error(`${p.title}: ${file} yok`);
  writeFileSync(tmp, execFileSync('unzip', ['-p', p.zip, entry], { maxBuffer: 32 << 20 }));
  const out = join(OUT, 'sfx', `${id}.mp3`);
  // Sessizlik kırpma: baştan, sonra ters çevirip sondan.
  const trim = 'silenceremove=start_periods=1:start_threshold=-48dB';
  ffmpeg([
    '-i',
    tmp,
    '-ac',
    '1',
    '-ar',
    '44100',
    '-af',
    `${trim},areverse,${trim},areverse`,
    '-b:a',
    '64k',
    out,
  ]);
  sfxBytes += statSync(out).size;
}

// Müzik: indirmeden önce sayfanın lisansı CC0 mu?
const page = join(CACHE, 'music-page.html');
if (!existsSync(page)) curl(MUSIC_PAGE, page);
const pageText = readFileSync(page, 'utf8').replace(/<[^>]*>/g, ' ');
if (!/License\(s\):(?:&nbsp;|\s)*CC0/.test(pageText)) throw new Error('Müzik lisansı CC0 değil');
let musicBytes = 0;
for (const [id, file] of Object.entries(MUSIC)) {
  const src = join(CACHE, `music-${id}.ogg`);
  if (!existsSync(src)) curl(MUSIC_BASE + file, src);
  const out = join(OUT, 'music', `${id}.mp3`);
  ffmpeg(['-i', src, '-ac', '1', '-ar', '44100', '-b:a', '64k', out]);
  musicBytes += statSync(out).size;
}
rmSync(tmp, { force: true });
console.log(`efekt: ${Object.keys(SFX).length} dosya, ${(sfxBytes / 1024).toFixed(0)} KB`);
console.log(`müzik: ${Object.keys(MUSIC).length} parça, ${(musicBytes / 1024).toFixed(0)} KB`);

// CREDITS.md: ses bölümünü (yeniden) yaz.
const credits = readFileSync('CREDITS.md', 'utf8').split('\n## Sesler')[0].trimEnd();
const used = Object.values(PACKS).filter((p) => Object.values(SFX).some(([k]) => PACKS[k] === p));
writeFileSync(
  'CREDITS.md',
  `${credits}

## Sesler

Efektler [Kenney](https://kenney.nl) ses paketlerinden (**CC0 1.0**), müzikler Juhani Junkala'nın
"Chiptune Adventures" albümünden (**CC0 1.0**, OpenGameArt). \`npm run fetch-audio\` ile indirilip mono
MP3'e çevrilir.

| Kaynak | Kullanım | Lisans | Bağlantı |
|---|---|---|---|
${used.map((p) => `| Kenney ${p.title} | efektler | CC0 1.0 | ${p.page} |`).join('\n')}
| Juhani Junkala — Chiptune Adventures | menü, gündüz, Kan Ayı ve boss müzikleri | CC0 1.0 | ${MUSIC_PAGE} |
`,
);

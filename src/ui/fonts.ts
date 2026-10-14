import balooLatinExt from '@fontsource-variable/baloo-2/files/baloo-2-latin-ext-wght-normal.woff2?url&inline';
import balooLatin from '@fontsource-variable/baloo-2/files/baloo-2-latin-wght-normal.woff2?url&inline';
import nunitoLatinExt from '@fontsource-variable/nunito/files/nunito-latin-ext-wght-normal.woff2?url&inline';
import nunitoLatin from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url&inline';

/** Google Fonts alt kümeleri: Türkçe ç/ö/ü/ı latin'de, ğ/ş/İ latin-ext'te. */
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

/**
 * Yuvarlak hatlı yazı tipleri (SIL OFL): başlıklar Baloo 2, metin Nunito. Dosyalar JS'e gömülü
 * (tek dosyalık Artifact'ta da dış istek yok); açılış ekranı sırasında yüklenir, hata olursa sistem
 * yazı tipine düşülür.
 */
export async function loadFonts(): Promise<void> {
  if (typeof FontFace === 'undefined' || !document.fonts) return;
  const face = (family: string, url: string, weight: string, range: string) =>
    new FontFace(family, `url(${url}) format('woff2')`, { weight, unicodeRange: range, display: 'swap' });
  const faces = [
    face('Baloo 2', balooLatin, '400 800', LATIN),
    face('Baloo 2', balooLatinExt, '400 800', LATIN_EXT),
    face('Nunito', nunitoLatin, '200 1000', LATIN),
    face('Nunito', nunitoLatinExt, '200 1000', LATIN_EXT),
  ];
  for (const f of faces) document.fonts.add(f);
  await Promise.allSettled(faces.map((f) => f.load()));
}

/** Başlangıç ekranında seçilebilen maceracılar (Kenney Mini Characters). Yalnızca görünüş farkı var. */
export interface HeroDef {
  id: string;
  name: string;
  /** GameAssets anahtarı. */
  model: string;
}

export const HEROES: readonly HeroDef[] = [
  { id: 'can', name: 'Can', model: 'characters/character-male-f' },
  { id: 'ela', name: 'Ela', model: 'characters/character-female-f' },
  { id: 'bora', name: 'Bora', model: 'characters/character-male-b' },
  { id: 'su', name: 'Su', model: 'characters/character-female-b' },
];

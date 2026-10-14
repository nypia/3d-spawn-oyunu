import { it } from 'vitest';
import { World } from '../../src/sim/world/World';
import { playBot } from './bot';

/** `npm run diag`: dakika dakika denge raporu + farklı seed'lerde ölüm zamanları. */
it('denge raporu', () => {
  playBot(new World({ seed: 1234, godMode: true }), 600, (w, hurt) => {
    console.log(
      `${Math.round(w.time / 60)}dk kill=${w.kills} sv=${w.level} düşman=${w.enemies.count} taş=${w.gems.count} yerdeXP=${Math.round(w.gems.totalValue())} altın=${Math.floor(w.gold)} elit=${w.eliteKills} hasarAlınan=${Math.round(hurt)} silah=${w.weapons.map((x) => x.def.id + x.level).join(',')}`,
    );
  });
  const deaths: string[] = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const w = new World({ seed });
    const t = playBot(w, 900);
    deaths.push(`${(t / 60).toFixed(1)}dk(sv${w.level})`);
  }
  console.log('normal bot ölüm zamanları:', deaths.join(' '));
});

import { describe, expect, it } from 'vitest';
import { joystickAxes } from '../../src/ui/TouchControls';

describe('joystickAxes', () => {
  it('yukarı sürükleme = ileri, sağa = sağ', () => {
    const [f, r] = joystickAxes(0, -60, 60);
    expect(f).toBeCloseTo(1);
    expect(r).toBeCloseTo(0);
    const [f2, r2] = joystickAxes(60, 0, 60);
    expect(f2).toBeCloseTo(0);
    expect(r2).toBeCloseTo(1);
  });

  it('ölü bölgede sıfır, yarıçap dışında 1 ile sınırlı', () => {
    expect(joystickAxes(3, 3, 60)).toEqual([0, 0]);
    const [f, r] = joystickAxes(0, 300, 60);
    expect(Math.hypot(f, r)).toBeCloseTo(1);
    expect(f).toBeCloseTo(-1);
  });

  it('büyüklük mesafeyle artar', () => {
    const a = Math.hypot(...joystickAxes(0, -20, 60));
    const b = Math.hypot(...joystickAxes(0, -40, 60));
    expect(b).toBeGreaterThan(a);
  });
});

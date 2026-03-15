import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

describe('extension package', () => {
  it('declares main entry and contributed commands', () => {
    expect(pkg.main).toBe('./dist/extension.js');
    expect(Array.isArray(pkg.contributes?.commands)).toBe(true);
    expect(pkg.contributes.commands.length).toBeGreaterThan(5);
  });
});

import { describe, expect, it } from 'vitest';
import { createInitModel } from '../../init/model.js';

describe('init model', () => {
  it('adds, edits, removes aliases with deterministic counters', () => {
    const model = createInitModel({ routes: [] });

    expect(model.addRoute({ alias: 'api', target: { protocol: 'http', host: 'localhost', port: 3000 } }).ok).toBe(true);
    expect(model.editRoute('api', { target: { port: 3001 } }).ok).toBe(true);
    expect(model.removeRoute('api').ok).toBe(true);

    const summary = model.getSummary();
    expect(summary.added).toBe(0);
    expect(summary.updated).toBe(0);
    expect(summary.removed).toBe(0);
    expect(summary.changed).toBe(false);
  });

  it('preserves unknown top-level and untouched route keys', () => {
    const model = createInitModel({
      foo: 'bar',
      routes: [
        { alias: 'web', target: { protocol: 'http', host: 'localhost', port: 5173 }, custom: 1 }
      ]
    });

    expect(model.addRoute({ alias: 'api', target: { protocol: 'http', host: 'localhost', port: 3000 } }).ok).toBe(true);
    const out = model.toConfig();

    expect(out.foo).toBe('bar');
    expect(out.routes.find((route) => route.alias === 'web').custom).toBe(1);
  });

  it('preserves unknown keys on edited route when changing explicit fields only', () => {
    const model = createInitModel({
      routes: [
        { alias: 'api', target: { protocol: 'http', host: 'localhost', port: 3000 }, custom: 42 }
      ]
    });

    expect(model.editRoute('api', { target: { port: 3001 } }).ok).toBe(true);
    const api = model.toConfig().routes.find((route) => route.alias === 'api');

    expect(api.custom).toBe(42);
    expect(api.target.port).toBe(3001);
  });

  it('rejects duplicate alias and returns collision signal', () => {
    const model = createInitModel({
      routes: [{ alias: 'api', target: { protocol: 'http', host: 'localhost', port: 3000 } }]
    });

    const result = model.addRoute({ alias: 'api', target: { protocol: 'http', host: 'localhost', port: 3001 } });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('alias_exists');
  });
});

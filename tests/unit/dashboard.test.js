import { describe, it, expect } from 'vitest';
import { renderDashboard } from '../../dashboard/index.js';

const mockState = {
  runtime: {
    ready: true,
    isRunning: true,
    httpsPort: 443,
    httpRedirectPort: 80,
    ip: '192.168.1.10',
    hostnameStrategy: 'sslip',
    configPath: './devgate.json'
  },
  reload: {
    lastReloadAt: '2026-03-14T10:00:00.000Z',
    lastReloadStatus: 'failed',
    lastReloadError: 'parse_error',
    activeConfigVersion: 2
  },
  cert: {
    mode: 'mkcert',
    certPath: '/tmp/cert.pem',
    keyPath: '/tmp/key.pem',
    expiresAt: '2027-03-14T10:00:00.000Z'
  },
  routes: [
    {
      alias: 'api',
      target: 'http://localhost:3000',
      url: 'https://api.192-168-1-1.sslip.io',
      health: 'healthy'
    }
  ],
  health: {
    updatedAt: '2026-03-14T10:00:05.000Z',
    summary: 'healthy'
  }
};

describe('dashboard renderer', () => {
  it('renders reload status and last error details', () => {
    const html = renderDashboard({ runtimeState: mockState });

    expect(html).toContain('Last reload');
    expect(html).toContain('failed');
    expect(html).toContain('parse_error');
  });

  it('renders cert mode and expiration', () => {
    const html = renderDashboard({ runtimeState: mockState });

    expect(html).toContain('mkcert');
    expect(html).toContain('2027');
  });

  it('renders explicit never/success/failed reload states', () => {
    expect(renderDashboard({ runtimeState: { ...mockState, reload: { ...mockState.reload, lastReloadStatus: 'never' } } })).toContain('never');
    expect(renderDashboard({ runtimeState: { ...mockState, reload: { ...mockState.reload, lastReloadStatus: 'success' } } })).toContain('success');
    expect(renderDashboard({ runtimeState: { ...mockState, reload: { ...mockState.reload, lastReloadStatus: 'failed' } } })).toContain('failed');
  });

  it('escapes user-controlled fields to prevent HTML injection', () => {
    const html = renderDashboard({
      runtimeState: {
        ...mockState,
        routes: [{ alias: '<script>x</script>', target: 'http://localhost:3000', url: 'https://x', health: 'unknown' }]
      }
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });
});

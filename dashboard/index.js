function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderRuntimeDashboard(runtimeState) {
  const runtime = runtimeState.runtime || {};
  const reload = runtimeState.reload || {};
  const cert = runtimeState.cert || {};
  const routes = Array.isArray(runtimeState.routes) ? runtimeState.routes : [];
  const health = runtimeState.health || {};

  const routeRows = routes.length === 0
    ? '<tr><td colspan="4">No routes configured</td></tr>'
    : routes.map((route) => `
      <tr>
        <td>${escapeHtml(route.alias)}</td>
        <td>${escapeHtml(route.target)}</td>
        <td>${escapeHtml(route.url || '-')}</td>
        <td>${escapeHtml(route.health || 'unknown')}</td>
      </tr>
    `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DevGate Dashboard</title>
  <style>
    body { font-family: sans-serif; background: #f8fafc; color: #1f2937; margin: 0; padding: 24px; }
    .container { max-width: 1100px; margin: 0 auto; }
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
    h1 { margin: 0 0 14px; }
    h2 { margin: 0 0 10px; font-size: 18px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; }
    .label { color: #6b7280; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e5e7eb; }
    th { color: #6b7280; font-size: 12px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="container">
    <h1>DevGate Dashboard</h1>

    <div class="card">
      <h2>Runtime</h2>
      <div class="grid">
        <div class="label">Ready</div><div>${escapeHtml(runtime.ready)}</div>
        <div class="label">Running</div><div>${escapeHtml(runtime.isRunning)}</div>
        <div class="label">HTTPS port</div><div>${escapeHtml(runtime.httpsPort)}</div>
        <div class="label">HTTP redirect port</div><div>${escapeHtml(runtime.httpRedirectPort)}</div>
        <div class="label">IP</div><div>${escapeHtml(runtime.ip)}</div>
        <div class="label">Hostname strategy</div><div>${escapeHtml(runtime.hostnameStrategy)}</div>
      </div>
    </div>

    <div class="card">
      <h2>Last reload</h2>
      <div class="grid">
        <div class="label">Status</div><div>${escapeHtml(reload.lastReloadStatus)}</div>
        <div class="label">At</div><div>${escapeHtml(reload.lastReloadAt)}</div>
        <div class="label">Error</div><div>${escapeHtml(reload.lastReloadError)}</div>
        <div class="label">Config version</div><div>${escapeHtml(reload.activeConfigVersion)}</div>
      </div>
    </div>

    <div class="card">
      <h2>Certificate</h2>
      <div class="grid">
        <div class="label">Mode</div><div>${escapeHtml(cert.mode)}</div>
        <div class="label">Cert path</div><div>${escapeHtml(cert.certPath)}</div>
        <div class="label">Key path</div><div>${escapeHtml(cert.keyPath)}</div>
        <div class="label">Expires</div><div>${escapeHtml(cert.expiresAt)}</div>
      </div>
    </div>

    <div class="card">
      <h2>Health</h2>
      <div class="grid">
        <div class="label">Summary</div><div>${escapeHtml(health.summary)}</div>
        <div class="label">Updated</div><div>${escapeHtml(health.updatedAt)}</div>
      </div>
    </div>

    <div class="card">
      <h2>Routes</h2>
      <table>
        <thead><tr><th>Alias</th><th>Upstream</th><th>URL</th><th>Status</th></tr></thead>
        <tbody>${routeRows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

function renderLegacyDashboard({ routes = {}, health = {}, hostname = 'localhost' } = {}) {
  const routeEntries = Object.entries(routes);
  const rows = routeEntries.length === 0
    ? '<tr><td colspan="3">No routes configured</td></tr>'
    : routeEntries.map(([alias, config]) => {
        const upstream = config.target || config.upstream || '-';
        const status = health[alias]?.status === 'healthy' || health[alias]?.healthy === true
          ? 'Healthy'
          : health[alias]?.status === 'unhealthy' || health[alias]?.healthy === false
            ? 'Unhealthy'
            : 'Unknown';
        return `<tr><td>${escapeHtml(alias)}</td><td>${escapeHtml(upstream)}</td><td>${escapeHtml(status)}</td></tr>`;
      }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>DevGate Dashboard</title></head>
<body>
  <h1>DevGate Dashboard</h1>
  <p>Hostname: ${escapeHtml(hostname)}</p>
  <table>
    <thead><tr><th>Alias</th><th>Upstream</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

export function renderDashboard(options = {}) {
  if (options.runtimeState) {
    return renderRuntimeDashboard(options.runtimeState);
  }
  return renderLegacyDashboard(options);
}

export default { renderDashboard };

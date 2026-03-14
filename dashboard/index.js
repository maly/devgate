/**
 * Render the dashboard HTML page
 * @param {Object} options
 * @param {Object.<string, Object>} [options.routes={}] - Map of route aliases to route configs
 * @param {Object.<string, Object>} [options.health={}] - Map of route aliases to health status
 * @param {string} [options.hostname='localhost'] - Dashboard hostname
 * @returns {string} HTML string
 */
export function renderDashboard(options = {}) {
  const { routes = {}, health = {}, hostname = 'localhost' } = options;

  const routeEntries = Object.entries(routes);
  
  const escapeHtml = (str) => {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  const getHealthStatus = (alias) => {
    const status = health[alias];
    if (!status) {
      return { label: 'Unknown', class: 'unknown' };
    }
    if (status.healthy === true || status.status === 'healthy') {
      return { label: 'Healthy', class: 'healthy' };
    }
    if (status.healthy === false || status.status === 'unhealthy') {
      return { label: 'Unhealthy', class: 'unhealthy' };
    }
    return { label: 'Unknown', class: 'unknown' };
  };

  let routesHtml = '';
  
  if (routeEntries.length === 0) {
    routesHtml = '<p class="no-routes">No routes configured</p>';
  } else {
    routesHtml = '<table class="routes-table"><thead><tr><th>Alias</th><th>Upstream</th><th>Status</th></tr></thead><tbody>';
    
    for (const [alias, config] of routeEntries) {
      const upstream = config.target || config.upstream || '-';
      const healthStatus = getHealthStatus(alias);
      
      routesHtml += `<tr>
        <td class="alias">${escapeHtml(alias)}</td>
        <td class="upstream">${escapeHtml(upstream)}</td>
        <td><span class="status ${healthStatus.class}">${healthStatus.label}</span></td>
      </tr>`;
    }
    
    routesHtml += '</tbody></table>';
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DevGate Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
      padding: 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 10px;
      color: #222;
    }
    .hostname {
      font-size: 0.9rem;
      color: #666;
      margin-bottom: 30px;
    }
    .section {
      background: #fff;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .section h2 {
      font-size: 1.1rem;
      margin-bottom: 15px;
      color: #444;
    }
    .routes-table {
      width: 100%;
      border-collapse: collapse;
    }
    .routes-table th,
    .routes-table td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #eee;
    }
    .routes-table th {
      font-weight: 600;
      color: #555;
      font-size: 0.85rem;
      text-transform: uppercase;
    }
    .routes-table td.alias {
      font-weight: 500;
      color: #2563eb;
    }
    .routes-table td.upstream {
      font-family: monospace;
      font-size: 0.9rem;
      color: #666;
    }
    .status {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 500;
    }
    .status.healthy {
      background: #dcfce7;
      color: #166534;
    }
    .status.unhealthy {
      background: #fee2e2;
      color: #991b1b;
    }
    .status.unknown {
      background: #f3f4f6;
      color: #6b7280;
    }
    .no-routes {
      color: #666;
      font-style: italic;
    }
    .footer {
      margin-top: 20px;
      text-align: center;
      font-size: 0.8rem;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>DevGate Dashboard</h1>
    <p class="hostname">Hostname: ${escapeHtml(hostname)}</p>
    
    <div class="section">
      <h2>Registered Routes</h2>
      ${routesHtml}
    </div>
    
    <div class="footer">
      DevGate Proxy
    </div>
  </div>
</body>
</html>`;

  return html;
}

export default { renderDashboard };

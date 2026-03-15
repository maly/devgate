/**
 * Hostname builder module for sslip.io hostname generation.
 * Generates hostnames in format: <alias>.<ip-with-dashes>.sslip.io
 */

/**
 * Converts an IP address to dashes format for sslip.io
 * Example: 192.168.1.11 -> 192-168-1-11
 * @param {string} ip - IP address in dot notation
 * @returns {string} IP address with dashes
 */
function ipToDashes(ip) {
  if (!ip || typeof ip !== 'string') {
    throw new Error('Invalid IP address');
  }
  return ip.split('.').join('-');
}

/**
 * Builds hostnames for routes and dashboard using sslip.io
 * @param {Object} config - Configuration object with routes array and dashboardAlias
 * @param {Object} runtimeInfo - Runtime info containing local IP and selected strategy
 * @param {string} runtimeInfo.ip - Local IP address
 * @param {string} runtimeInfo.strategy - Hostname strategy (`sslip` or `devgate`)
 * @returns {Object} Object with routes and dashboard hostnames
 */
function buildHostnames(config, runtimeInfo) {
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be an object');
  }

  if (!runtimeInfo || !runtimeInfo.ip) {
    throw new Error('runtimeInfo with ip is required');
  }

  const { routes = [], dashboardAlias = 'dev' } = config;
  const strategy = runtimeInfo.strategy || 'sslip';

  const routeHostnames = routes.map(route => ({
    alias: route.alias,
    hostname: strategy === 'devgate' ? `${route.alias}.devgate` : `${route.alias}.${ipToDashes(runtimeInfo.ip)}.sslip.io`,
    target: route.target
  }));

  const dashboardHostname = {
    alias: dashboardAlias,
    hostname: strategy === 'devgate' ? `${dashboardAlias}.devgate` : `${dashboardAlias}.${ipToDashes(runtimeInfo.ip)}.sslip.io`
  };

  return {
    routes: routeHostnames,
    dashboard: dashboardHostname
  };
}

export { buildHostnames, ipToDashes };
export default { buildHostnames, ipToDashes };

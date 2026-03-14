import { loadConfig, validateConfig, resolveRuntimeConfig, getDefaultConfig } from '../config/index.js';
import { detectLocalIp } from '../api/ip-detection.js';
import { buildHostnames } from '../api/hostname-builder.js';
import { CertManager } from '../cert/index.js';
import { createProxy } from '../proxy/index.js';
import { renderDashboard } from '../dashboard/index.js';
import { HealthChecker } from '../health/index.js';
import os from 'os';
import { existsSync } from 'fs';
import { createServer } from 'net';

const DEFAULT_CONFIG_PATH = './devgate.json';

function parseArgs(args) {
  const options = {
    configPath: null,
    ip: null,
    httpsPort: null,
    httpPort: null,
    certDir: null,
    verbose: false,
    dashboardEnabled: true,
    selfSignedFallback: false
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--configure' || arg === '-configure') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options.configPath = args[i + 1];
        i += 2;
      } else {
        throw new Error('--configure requires a path argument');
      }
      continue;
    }

    if (arg === '--config' || arg === '-c') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options.configPath = args[i + 1];
        i += 2;
      } else {
        throw new Error('--config requires a path argument');
      }
      continue;
    }

    if (arg === '--ip' || arg === '-i') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options.ip = args[i + 1];
        i += 2;
      } else {
        throw new Error('--ip requires an IP address argument');
      }
      continue;
    }

    if (arg === '--https-port' || arg === '--https') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options.httpsPort = parseInt(args[i + 1], 10);
        if (isNaN(options.httpsPort) || options.httpsPort < 1 || options.httpsPort > 65535) {
          throw new Error('--https-port must be a number between 1 and 65535');
        }
        i += 2;
      } else {
        throw new Error('--https-port requires a port number');
      }
      continue;
    }

    if (arg === '--http-port' || arg === '--http') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options.httpPort = parseInt(args[i + 1], 10);
        if (isNaN(options.httpPort) || options.httpPort < 1 || options.httpPort > 65535) {
          throw new Error('--http-port must be a number between 1 and 65535');
        }
        i += 2;
      } else {
        throw new Error('--http-port requires a port number');
      }
      continue;
    }

    if (arg === '--cert-dir') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options.certDir = args[i + 1];
        i += 2;
      } else {
        throw new Error('--cert-dir requires a path argument');
      }
      continue;
    }

    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
      i++;
      continue;
    }

    if (arg === '--no-dashboard') {
      options.dashboardEnabled = false;
      i++;
      continue;
    }

    if (arg === '--self-signed-fallback' || arg === '--self-signed') {
      options.selfSignedFallback = true;
      i++;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      i++;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printCommandHelp(command) {
  const helpTexts = {
    start: `devgate start --config <path> [options]
  Start the proxy server

  Options:
    --config, -c <path>       Path to config file
    --configure <path>        Alias for --config
    --ip, -i <ipv4>          Override IP detection
    --https-port, --https <port>  HTTPS port (default: 443)
    --http-port, --http <port>   HTTP redirect port (default: 80)
    --cert-dir <path>        Certificate directory
    --verbose, -v            Enable verbose output
    --no-dashboard           Disable dashboard
    --self-signed-fallback   Allow self-signed certificates
    --help, -h              Show this help`,

    validate: `devgate validate --config <path> [options]
  Validate configuration file

  Options:
    --config, -c <path>       Path to config file
    --help, -h              Show this help`,

    'print-config': `devgate print-config --config <path> [options]
  Print effective configuration

  Options:
    --config, -c <path>       Path to config file
    --ip, -i <ipv4>          Override IP detection
    --https-port, --https <port>  HTTPS port
    --http-port, --http <port>   HTTP redirect port
    --cert-dir <path>        Certificate directory
    --verbose, -v            Show verbose output
    --no-dashboard           Disable dashboard
    --help, -h              Show this help`,

    'print-hosts': `devgate print-hosts --config <path> [options]
  Print generated hostnames

  Options:
    --config, -c <path>       Path to config file
    --ip, -i <ipv4>          Override IP detection
    --verbose, -v            Show verbose output
    --help, -h              Show this help`,

    doctor: `devgate doctor --config <path> [options]
  Run diagnostics

  Options:
    --config, -c <path>       Path to config file
    --ip, -i <ipv4>          Override IP detection
    --verbose, -v            Show verbose output
    --help, -h              Show this help`,

    'install-mkcert': `devgate install-mkcert
  Install mkcert automatically

  This command attempts to install mkcert using:
    - Windows: winget or Chocolatey
    - macOS: Homebrew
    - Linux: apt or dnf

  If automatic installation fails, you will receive
  manual installation instructions.

  After installation, run: mkcert -install

  Options:
    --help, -h              Show this help`,

    '': `devgate <command> [options]
  A local HTTPS reverse proxy tool for development

  Commands:
    start            Start the proxy server
    validate         Validate configuration file
    print-config     Print effective configuration
    print-hosts      Print generated hostnames
    doctor           Run diagnostics
    install-mkcert  Install mkcert automatically

  Options:
    --help, -h         Show help for a command

  Run 'devgate <command> --help' for more information on a command.`
  };

  console.log(helpTexts[command] || helpTexts['']);
}

async function prepareConfig(options) {
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;
  
  let fileConfig;
  try {
    fileConfig = await loadConfig(configPath);
  } catch (err) {
    if (options.configPath) {
      throw new Error(`Failed to load config: ${err.message}`);
    }
    fileConfig = { routes: [] };
  }

  const validation = validateConfig(fileConfig);
  if (!validation.valid) {
    throw new Error(`Config validation failed:\n  ${validation.errors.join('\n  ')}`);
  }

  const runtimeOptions = {};
  if (options.ip !== null) runtimeOptions.preferredIp = options.ip;
  if (options.httpsPort !== null) runtimeOptions.httpsPort = options.httpsPort;
  if (options.httpPort !== null) runtimeOptions.httpRedirectPort = options.httpPort;
  if (options.certDir !== null) runtimeOptions.certDir = options.certDir;
  if (options.dashboardEnabled !== true) runtimeOptions.dashboardEnabled = options.dashboardEnabled;

  const runtimeConfig = resolveRuntimeConfig(fileConfig, runtimeOptions);
  
  return { fileConfig, runtimeConfig };
}

async function startCommand(args) {
  const options = parseArgs(args);
  
  if (options.help) {
    printCommandHelp('start');
    return { exitCode: 0 };
  }

  const { runtimeConfig, fileConfig } = await prepareConfig(options);

  const ipResult = detectLocalIp({ preferredIp: options.ip || runtimeConfig.preferredIp });
  if (!ipResult) {
    throw new Error('Could not detect local IP address');
  }

  if (options.verbose) {
    console.log(`Detected local IP: ${ipResult.ip} (${ipResult.interface})`);
    console.log(`Starting devgate on https://${ipResult.ip}`);
  }

  console.log('Starting devgate proxy server...');
  console.log(`  HTTPS port: ${runtimeConfig.httpsPort}`);
  console.log(`  HTTP redirect port: ${runtimeConfig.httpRedirectPort || 'disabled'}`);
  console.log(`  Dashboard: ${runtimeConfig.dashboardEnabled ? 'enabled' : 'disabled'}`);
  console.log(`  Local IP: ${ipResult.ip}`);
  console.log('');

  const hostnames = buildHostnames(runtimeConfig, { ip: ipResult.ip });
  
  console.log('Hostnames:');
  console.log(`  Dashboard: https://${hostnames.dashboard.hostname}`);
  for (const route of hostnames.routes) {
    console.log(`  ${route.alias}: https://${route.hostname}`);
  }
  console.log('');

  const certManager = new CertManager({
    certDir: runtimeConfig.certDir,
    selfSignedFallback: options.selfSignedFallback || runtimeConfig.selfSignedFallback
  });

  const mkcertAvailable = await certManager.checkMkcert();
  if (!mkcertAvailable) {
    console.log('Warning: mkcert not found. Using self-signed certificates.');
    console.log('  Run "devgate install-mkcert" to install mkcert for trusted certificates.');
  }

  const allHostnames = [
    hostnames.dashboard.hostname,
    ...hostnames.routes.map(r => r.hostname)
  ];

  console.log('Ensuring certificates...');
  await certManager.ensureCertificates(allHostnames);
  const certInfo = certManager.getCertificateInfo();
  console.log(`  Certificate mode: ${certInfo.mode || 'self-signed'}`);
  console.log('');

  const routesMap = {};
  for (const route of runtimeConfig.routes) {
    const routeHostname = hostnames.routes.find(h => h.alias === route.alias);
    if (routeHostname) {
      routesMap[routeHostname.hostname] = {
        target: `${route.target.protocol}://${route.target.host}:${route.target.port}`,
        changeOrigin: true,
        headers: route.headers || {},
        stripPrefix: route.stripPrefix || ''
      };
    }
  }

  if (runtimeConfig.dashboardEnabled) {
    routesMap[hostnames.dashboard.hostname] = {
      target: null,
      isDashboard: true,
      dashboardConfig: runtimeConfig,
      dashboardHostnames: hostnames
    };
  }

  console.log('Starting proxy server...');
  
  const proxy = createProxy({
    port: runtimeConfig.httpsPort,
    defaultPort: runtimeConfig.httpRedirectPort,
    routes: routesMap,
    ssl: {
      cert: certInfo.cert,
      key: certInfo.key
    }
  });

  proxy.on('config-change', (newConfig) => {
    console.log('[devgate] Configuration reloaded');
  });

  await proxy.start();
  console.log(`  Proxy server running on https://localhost:${runtimeConfig.httpsPort}`);
  console.log('');

  let healthChecker = null;
  const routesWithHealthcheck = runtimeConfig.routes.filter(r => r.healthcheck);
  if (routesWithHealthcheck.length > 0) {
    console.log('Starting health checks...');
    healthChecker = new HealthChecker(routesWithHealthcheck, {
      interval: 30000,
      timeout: 5000
    });
    healthChecker.start();
  }

  console.log('Press Ctrl+C to stop the server');
  console.log('');

  const shutdown = async () => {
    console.log('\nShutting down...');
    if (healthChecker) {
      healthChecker.stop();
    }
    await proxy.stop();
    console.log('Server stopped.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('');
  console.log('Server is running. Press Ctrl+C to stop.');
  
  await new Promise(() => {});
}

/**
 * Validate command - Validate configuration file
 */
async function validateCommand(args) {
  const options = parseArgs(args);
  
  if (options.help) {
    printCommandHelp('validate');
    return { exitCode: 0 };
  }

  const configPath = options.configPath || DEFAULT_CONFIG_PATH;

  try {
    const config = await loadConfig(configPath);
    const validation = validateConfig(config);

    if (validation.valid) {
      console.log(`Configuration file '${configPath}' is valid.`);
      return { exitCode: 0 };
    } else {
      console.error(`Configuration file '${configPath}' has errors:`);
      validation.errors.forEach(err => console.error(`  - ${err}`));
      return { exitCode: 1 };
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return { exitCode: 1 };
  }
}

async function printConfigCommand(args) {
  const options = parseArgs(args);
  
  if (options.help) {
    printCommandHelp('print-config');
    return { exitCode: 0 };
  }

  const { runtimeConfig } = await prepareConfig(options);

  const ipResult = detectLocalIp({ preferredIp: options.ip || runtimeConfig.preferredIp });
  const effectiveIp = ipResult ? ipResult.ip : 'unknown';

  console.log(JSON.stringify({
    ...runtimeConfig,
    detectedIp: effectiveIp
  }, null, 2));

  return { exitCode: 0 };
}

async function printHostsCommand(args) {
  const options = parseArgs(args);
  
  if (options.help) {
    printCommandHelp('print-hosts');
    return { exitCode: 0 };
  }

  const { runtimeConfig } = await prepareConfig(options);

  const ipResult = detectLocalIp({ preferredIp: options.ip || runtimeConfig.preferredIp });
  if (!ipResult) {
    throw new Error('Could not detect local IP address');
  }

  const hostnames = buildHostnames(runtimeConfig, { ip: ipResult.ip });

  console.log('Generated hostnames:');
  console.log('');
  
  if (runtimeConfig.dashboardEnabled) {
    console.log(`  Dashboard: https://${hostnames.dashboard.hostname}`);
  }
  
  hostnames.routes.forEach(route => {
    console.log(`  ${route.alias}: https://${route.hostname}`);
  });

  if (options.verbose) {
    console.log('');
    console.log(`IP: ${ipResult.ip}`);
    console.log(`Interface: ${ipResult.interface}`);
    console.log(`Reason: ${ipResult.reason}`);
  }

  return { exitCode: 0 };
}

async function doctorCommand(args) {
  const options = parseArgs(args);
  
  if (options.help) {
    printCommandHelp('doctor');
    return { exitCode: 0 };
  }

  console.log('Running diagnostics...\n');
  let hasErrors = false;

  console.log('System:');
  console.log(`  Platform: ${process.platform}`);
  console.log(`  OS: ${os.type()} ${os.release()}`);
  console.log(`  Node.js version: ${process.version}`);
  console.log(`  Architecture: ${process.arch}`);
  const nodeMajor = parseInt(process.version.slice(1).split('.')[0], 10);
  if (nodeMajor < 18) {
    console.log('  Warning: Node.js 18+ recommended');
  } else {
    console.log('  OK');
  }
  console.log('');

  console.log('mkcert:');
  const certManager = new CertManager();
  const mkcertAvailable = await certManager.checkMkcert();
  if (mkcertAvailable) {
    console.log('  Status: Available');
    console.log('  OK');
  } else {
    console.log('  Status: Not found');
    console.log('  Warning: mkcert not found. Will use self-signed certificates.');
    console.log('  Tip: Run "devgate install-mkcert" to install automatically');
  }
  console.log('');

  console.log('Configuration:');
  try {
    const { runtimeConfig } = await prepareConfig(options);
    const configPath = options.configPath || DEFAULT_CONFIG_PATH;
    console.log(`  Config file: ${configPath} (${options.configPath ? 'provided' : 'using defaults'})`);
    console.log(`  OK`);
    console.log('');
  } catch (err) {
    console.log(`  Error: ${err.message}`);
    hasErrors = true;
    console.log('');
  }

  console.log('Network:');
  const ipResult = detectLocalIp({ preferredIp: options.ip });
  if (ipResult) {
    console.log(`  Local IP: ${ipResult.ip}`);
    console.log(`  Interface: ${ipResult.interface}`);
    console.log(`  Reason: ${ipResult.reason}`);
    console.log('  OK');
  } else {
    console.log('  Error: Could not detect local IP');
    hasErrors = true;
  }
  console.log('');

  console.log('Port binding:');
  const testPort = (port) => {
    return new Promise((resolve) => {
      const server = createServer();
      server.once('error', (err) => {
        resolve({ port, available: false, error: err.message });
      });
      server.once('listening', () => {
        server.close();
        resolve({ port, available: true });
      });
      server.listen(port, '0.0.0.0');
    });
  };

  const portsToCheck = [80, 443, 8080, 8443];
  for (const port of portsToCheck) {
    const result = await testPort(port);
    if (result.available) {
      console.log(`  Port ${port}: Available`);
    } else {
      console.log(`  Port ${port}: In use (${result.error})`);
    }
  }
  console.log('  OK');
  console.log('');

  try {
    const { runtimeConfig } = await prepareConfig(options);
    console.log('Routes:');
    if (runtimeConfig.routes.length === 0) {
      console.log('  No routes configured');
    } else {
      runtimeConfig.routes.forEach(route => {
        console.log(`  - ${route.alias} -> ${route.target.protocol}://${route.target.host}:${route.target.port}`);
        if (route.healthcheck) {
          console.log(`    Healthcheck: ${route.healthcheck}`);
        }
      });
    }
    console.log('  OK');
    console.log('');

    console.log('Certificate cache:');
    const certDir = runtimeConfig.certDir || certManager.certDir;
    const certPath = `${certDir}/devgate.pem`;
    const keyPath = `${certDir}/devgate.key`;
    
    console.log(`  Certificate directory: ${certDir}`);
    
    if (existsSync(certPath) && existsSync(keyPath)) {
      console.log('  Cached certificates: Yes');
      try {
        const certInfo = certManager.getCertificateInfo();
        console.log(`  Certificate mode: ${certInfo.mode || 'unknown'}`);
        if (certInfo.expiration) {
          const expiryDate = new Date(certInfo.expiration);
          const now = new Date();
          const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
          console.log(`  Expires: ${expiryDate.toISOString().split('T')[0]} (${daysUntilExpiry} days)`);
          if (daysUntilExpiry < 30) {
            console.log('  Warning: Certificate expires soon');
          }
        }
      } catch (err) {
        console.log('  Error reading certificate info');
      }
    } else {
      console.log('  Cached certificates: No');
    }
    console.log('  OK');
    console.log('');
  } catch (err) {
  }

  if (ipResult) {
    try {
      const { runtimeConfig } = await prepareConfig(options);
      const hostnames = buildHostnames(runtimeConfig, { ip: ipResult.ip });
      console.log('Hostnames:');
      if (runtimeConfig.dashboardEnabled) {
        console.log(`  Dashboard: https://${hostnames.dashboard.hostname}`);
      }
      hostnames.routes.forEach(route => {
        console.log(`  ${route.alias}: https://${route.hostname}`);
      });
      console.log('  OK');
    } catch (err) {
      console.log(`  Error generating hostnames: ${err.message}`);
      hasErrors = true;
    }
  }

  console.log('');
  if (hasErrors) {
    console.log('Diagnostics completed with errors.');
    return { exitCode: 1 };
  } else {
    console.log('Diagnostics completed successfully.');
    return { exitCode: 0 };
  }
}

async function installMkcertCommand(args) {
  const options = parseArgs(args);
  
  if (options.help) {
    printCommandHelp('install-mkcert');
    return { exitCode: 0 };
  }

  console.log('mkcert Installation\n');
  
  const certManager = new CertManager();
  const isAvailable = await certManager.checkMkcert();
  
  if (isAvailable) {
    console.log('mkcert is already installed!');
    const result = execSync('mkcert --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`Version: ${result.trim()}`);
    return { exitCode: 0 };
  }

  console.log('mkcert not found. Attempting to install...\n');
  
  const result = await certManager.installMkcert();
  
  if (result.success) {
    console.log(`\n${result.message}`);
    console.log('\nNote: You may need to restart your terminal for mkcert to be available in PATH.');
    console.log('After restarting, run: mkcert -install');
  } else {
    console.log(`\n${result.message}`);
  }
  
  return { exitCode: result.success ? 0 : 1 };
}

async function run(args = process.argv.slice(2)) {
  const command = args[0];

  if (!command) {
    printCommandHelp('');
    return { exitCode: 0 };
  }

  if (command === '--help' || command === '-h') {
    printCommandHelp('');
    return { exitCode: 0 };
  }

  const commandMap = {
    'start': startCommand,
    'validate': validateCommand,
    'print-config': printConfigCommand,
    'print-hosts': printHostsCommand,
    'doctor': doctorCommand,
    'install-mkcert': installMkcertCommand
  };

  if (command.startsWith('--configure') || command === '-configure') {
    const configArg = command.replace(/^--?configure/, '');
    if (configArg) {
      args = ['start', `--config`, configArg, ...args.slice(1)];
    } else if (args[1] && !args[1].startsWith('-')) {
      // --configure <path> format
      args = ['start', '--config', args[1], ...args.slice(2)];
    } else {
      args = ['start', ...args.slice(1)];
    }
    return run(args);
  }

  const commandFn = commandMap[command];
  if (!commandFn) {
    console.error(`Unknown command: ${command}`);
    console.error("Run 'devgate --help' for usage information.");
    return { exitCode: 1 };
  }

  try {
    return await commandFn(args.slice(1));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return { exitCode: 1 };
  }
}

export default { run };

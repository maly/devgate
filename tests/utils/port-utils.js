import { createServer } from 'node:net';

export async function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    
    server.listen(port, '127.0.0.1');
  });
}

export async function waitForPort(port, timeout = 5000) {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    const inUse = await isPortInUse(port);
    if (!inUse) {
      return true;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  
  return false;
}

export async function findFreePort(startPort = 18000, maxAttempts = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const inUse = await isPortInUse(port);
    if (!inUse) {
      return port;
    }
  }
  throw new Error(`Could not find free port after ${maxAttempts} attempts`);
}

export async function killProcessOnPort(port) {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);
  
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`);
      const pids = stdout.trim().split('\n').filter(p => p && !isNaN(parseInt(p.trim())));
      
      for (const pid of pids) {
        const pidNum = parseInt(pid.trim());
        if (pidNum && pidNum !== process.pid) {
          try {
            await execAsync(`powershell -Command "Stop-Process -Id ${pidNum} -Force -ErrorAction SilentlyContinue"`);
            console.log(`[port-utils] Killed process ${pidNum} on port ${port}`);
          } catch {
          }
        }
      }
    } else {
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pids = stdout.trim().split('\n').filter(p => p);
      
      for (const pid of pids) {
        try {
          await execAsync(`kill -9 ${pid}`);
          console.log(`[port-utils] Killed process ${pid} on port ${port}`);
        } catch {
        }
      }
    }
  } catch {
  }
}

export async function ensurePortFree(port, forceKill = true) {
  const inUse = await isPortInUse(port);
  
  if (inUse) {
    console.log(`[port-utils] Port ${port} is in use, attempting to free it...`);
    
    if (forceKill) {
      await killProcessOnPort(port);
      await new Promise(r => setTimeout(r, 500));
    }
    
    const stillInUse = await isPortInUse(port);
    if (stillInUse) {
      throw new Error(`Port ${port} is still in use after cleanup attempt`);
    }
    
    console.log(`[port-utils] Port ${port} is now free`);
  }
  
  return true;
}

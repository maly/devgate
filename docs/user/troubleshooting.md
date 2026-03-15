# Troubleshooting

Solutions to common issues you may encounter when using devgate.

## Installation Issues

### "command not found" after global installation

Make sure npm's global bin directory is in your PATH.

**Windows:**
```cmd
npm config get prefix
```

Add the output path (usually `C:\Users\<username>\AppData\Roaming\npm`) to your system PATH.

**macOS/Linux:**
Add to your shell profile (`~/.bashrc`, `~/.zshrc`):
```bash
export PATH="$PATH:$(npm config get prefix)/bin"
```

### mkcert not recognized

After installing mkcert, restart your terminal or computer for PATH changes to take effect.

On Windows, you may need to run:
```cmd
refreshenv
```

## Port Binding Issues

### EACCES: permission denied for port 443

On Unix-like systems (including macOS and Linux), binding to ports below 1024 requires root privileges.

**Solutions:**
1. Use a higher port: `devgate start --https-port 8443`
2. Use port forwarding: `sudo iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 8443`
3. Run with sudo (not recommended for development)

### EADDRINUSE: port already in use

Another process is using the port.

**Find the process:**
```bash
# Windows
netstat -ano | findstr :443

# macOS/Linux
lsof -i :443
```

**Kill the process:**
```bash
# Windows
taskkill /PID <PID> /F

# macOS/Linux
kill -9 <PID>
```

Or use a different port:
```bash
devgate start --https-port 8443
```

## Certificate Issues

### Browser shows "Your connection is not private"

This happens when using self-signed certificates without mkcert.

**Solutions:**

1. **Install mkcert** (recommended):
   ```bash
   choco install mkcert  # Windows
   brew install mkcert   # macOS
   ```

2. **Initialize mkcert**:
   ```bash
   mkcert -install
   ```

3. **Restart your browser** after installing mkcert

4. **If using Chrome**, enable "chrome://flags/#allow-insecure-localhost"

### Certificate trust issues even with mkcert

Try reinstalling the mkcert root CA:
```bash
mkcert -uninstall
mkcert -install
```

### NET::ERR_CERT_INVALID in Chrome

1. Click "Advanced"
2. Click "Proceed to localhost (unsafe)"

This is expected for self-signed certificates. The connection is still encrypted; it's just not validated by a trusted CA.

## DNS Resolution Issues

### Native `.devgate` not working on macOS/Linux

If `devgate start` prints resolver warning and uses `sslip`, resolver setup is missing or inactive.

Run:

```bash
devgate domain status
sudo devgate domain setup
```

Then restart:

```bash
devgate start
```

If setup is unavailable on your distro/environment, devgate keeps working with automatic `sslip` fallback.

### sslip.io not resolving

1. **Check your internet connection** - sslip.io requires external DNS
2. **Try a different DNS** - Use Google (8.8.8.8) or Cloudflare (1.1.1.1)
3. **Check for VPN** - Some VPNs bypass system DNS settings

### Wrong IP in hostname

If devgate is detecting the wrong IP:

```bash
# Override with CLI flag
devgate start --ip 192.168.1.100

# Or set in config
devgate.json:
{
  "preferredIp": "192.168.1.100"
}
```

### Cannot access services from other devices

1. Ensure your firewall allows incoming connections on port 443
2. Make sure you're using a private IP (not 127.0.0.1)
3. Other devices must be on the same network

## Connection Issues

### Connection refused

The target service is not running or not accessible.

1. **Verify the service is running:**
   ```bash
   curl http://localhost:<port>
   ```

2. **Check the port in your config** matches the service port

3. **Verify the target host** - use `localhost` for services on the same machine

### 502 Bad Gateway

The proxy cannot reach the target service.

1. **Check the service is running**
2. **Verify target protocol** (http vs https)
3. **Check for firewall issues**

### Timeout errors

1. **Check if the target service is responding:**
   ```bash
   curl -m 5 http://localhost:<port>
   ```

2. **Increase timeout** in route config (not currently supported - use healthcheck)

## Dashboard Issues

### Dashboard not loading

1. **Check if dashboard is enabled:**
   ```bash
   devgate doctor
   ```

2. **Try accessing via IP:**
   ```
   https://dev.<YOUR-IP>.sslip.io
   ```

### Dashboard shows all services as down

1. **Add health checks** to your routes:
   ```json
   {
     "alias": "api",
     "target": {
       "protocol": "http",
       "host": "localhost",
       "port": 3000
     },
     "healthcheck": "/health"
   }
   ```

2. **Ensure health endpoint returns 200**

### Dashboard shows reload status `failed`

Most common causes:

1. Invalid JSON/YAML syntax in config file.
2. Validation error (for example, invalid alias or missing target fields).
3. Temporary partial write while editor is saving.

What to do:

1. Run `devgate validate --config ./devgate.json`.
2. Fix the reported parse/validation errors.
3. Save the file again and verify the dashboard moves from `failed` to `success`.

Note: while status is `failed`, devgate keeps the last-known-good configuration active.

### Dashboard `ready` remains false

`ready` becomes `true` only after runtime, routes, cert, and health snapshots have been initialized.

If it stays false:

1. Check startup logs for initialization errors.
2. Run `devgate doctor --verbose`.
3. Confirm certificate setup and route bootstrap completed successfully.

## Windows-Specific Issues

### Windows Defender Firewall

If prompted, allow Node.js through the firewall. Or manually add an exception:

1. Open Windows Security
2. Go to Firewall & network protection
3. Click "Allow an app through firewall"
4. Browse to your Node.js executable (e.g., `C:\Program Files\nodejs\node.exe`)

### Hyper-V virtual adapter

If using Hyper-V, you may have multiple network adapters. Specify the IP explicitly:

```bash
devgate start --ip 192.168.1.100
```

## Debugging

### Enable verbose output

```bash
devgate start --verbose
```

### Check configuration

```bash
devgate validate
devgate print-config --verbose
devgate print-hosts
```

### Run diagnostics

```bash
devgate doctor --verbose
```

## Getting Help

If you're still having issues:

1. Check the GitHub issues: https://github.com/yourusername/devgate/issues
2. Search for similar problems
3. Create a new issue with:
   - Your operating system
   - Node.js version (`node --version`)
   - Output of `devgate doctor`
   - Your configuration file (remove sensitive data)
   - Steps to reproduce

# Quick Start

This guide will get you up and running with devgate in 5 minutes.

## Step 1: Create a Configuration File

Create a file named `devgate.json` in your project root:

```json
{
  "routes": [
    {
      "alias": "api",
      "target": {
        "protocol": "http",
        "host": "localhost",
        "port": 3000
      }
    },
    {
      "alias": "web",
      "target": {
        "protocol": "http",
        "host": "localhost",
        "port": 5173
      }
    },
    {
      "alias": "admin",
      "target": {
        "protocol": "http",
        "host": "localhost",
        "port": 8080
      }
    }
  ]
}
```

## Step 2: Prepare Your Environment

Run setup once:

```bash
devgate setup
```

Optional checks:

```bash
devgate setup --dry-run
devgate setup --json
```

## Step 3: Start Your Backend Services

Make sure your services are running on the ports specified in your config:

```bash
# Example: Start your API on port 3000
npm run dev  # or whatever command starts your service
```

## Step 4: Start devgate

Run:

```bash
devgate start
```

You should see output like:

```
Starting devgate proxy server...
  HTTPS port: 443
  HTTP redirect port: 80
  Dashboard: enabled
  Local IP: 192.168.1.100

Proxy server started. Access your services at:
  https://api.192-168-1-100.sslip.io
  https://web.192-168-1-100.sslip.io
  https://admin.192-168-1-100.sslip.io
  https://dev.192-168-1-100.sslip.io (dashboard)
```

## Step 5: Access Your Services

Open your browser and navigate to:

- **API**: https://api.192-168-1-100.sslip.io
- **Web App**: https://web.192-168-1-100.sslip.io
- **Dashboard**: https://dev.192-168-1-100.sslip.io

## How It Works

### sslip.io DNS Resolution

devgate uses [sslip.io](https://sslip.io), a DNS service that resolves hostnames containing IP addresses. When you access `https://api.192-168-1-100.sslip.io`:

1. Your browser queries DNS for `api.192-168-1-100.sslip.io`
2. sslip.io extracts the IP `192.168.1.100` from the hostname
3. DNS resolves to your local machine's IP
4. devgate receives the request and routes it to your configured service

### No Hosts File Required

Traditional approaches require adding entries to your hosts file:

```
127.0.0.1 api.local
127.0.0.1 web.local
```

With devgate and sslip.io, no hosts file modification is needed. The DNS resolution happens remotely at sslip.io.

## Quick Configuration Examples

### Basic HTTP Proxy

```json
{
  "routes": [
    {
      "alias": "myapp",
      "target": {
        "protocol": "http",
        "host": "localhost",
        "port": 3000
      }
    }
  ]
}
```

### With Health Checks

```json
{
  "routes": [
    {
      "alias": "api",
      "target": {
        "protocol": "http",
        "host": "localhost",
        "port": 3000
      },
      "healthcheck": "/health"
    }
  ]
}
```

### With Custom Headers

```json
{
  "routes": [
    {
      "alias": "api",
      "target": {
        "protocol": "http",
        "host": "localhost",
        "port": 3000
      },
      "headers": {
        "X-Forwarded-Host": "${host}",
        "X-Forwarded-Proto": "https"
      }
    }
  ]
}
```

### With Prefix Stripping

```json
{
  "routes": [
    {
      "alias": "api",
      "target": {
        "protocol": "http",
        "host": "localhost",
        "port": 3000
      },
      "stripPrefix": "/api"
    }
  ]
}
```

When accessing `https://api.example.sslip.io/users`, the request is proxied to `http://localhost:3000/users`.

## Next Steps

- Read the [Configuration Reference](./configuration.md) for all options
- Learn about [CLI Commands](./cli-commands.md)
- See [Troubleshooting](./troubleshooting.md) if you encounter issues

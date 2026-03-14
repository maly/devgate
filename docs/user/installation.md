# Installation Guide

This guide covers how to install devgate on different operating systems.

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- mkcert (optional, for trusted local certificates)

## Global Installation

The recommended way to install devgate is globally via npm:

```bash
npm install -g devgate
```

After installation, verify it works:

```bash
devgate --version
```

## Local Installation

If you prefer to install locally in your project:

```bash
npm install devgate
```

Then you can run it with:

```bash
node cli/bin/devgate.js <command>
```

Or add scripts to your `package.json`:

```json
{
  "scripts": {
    "devgate": "devgate",
    "devgate:start": "devgate start",
    "devgate:validate": "devgate validate"
  }
}
```

## Installing mkcert

mkcert is recommended for generating locally-trusted development certificates. Without mkcert, devgate will fall back to self-signed certificates which cause browser warnings.

### Windows (with Chocolatey)

```bash
choco install mkcert
```

### Windows (Manual)

1. Download the latest release from https://github.com/FiloSottile/mkcert/releases
2. Extract the ZIP file
3. Add the directory to your PATH, or run from the same directory

### macOS

```bash
brew install mkcert
```

### Linux

```bash
# Debian/Ubuntu
sudo apt install libnss3-tools
brew install mkcert
```

### Initialize mkcert

After installation, run:

```bash
mkcert -install
```

This creates a local certificate authority that your browser will trust.

## Verifying Installation

Run the doctor command to verify your setup:

```bash
devgate doctor
```

This checks:
- Node.js version
- mkcert availability
- Configuration validity
- Local IP detection
- Port availability

## Updating devgate

To update to the latest version:

```bash
npm update -g devgate
```

Or reinstall:

```bash
npm uninstall -g devgate
npm install -g devgate
```

## Uninstalling

To remove devgate:

```bash
npm uninstall -g devgate
```

You may also want to remove the certificate cache:

```bash
rm -rf ~/.devgate
```

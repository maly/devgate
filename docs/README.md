# devgate Documentation

Welcome to the devgate documentation. This directory contains comprehensive guides for users and developers.

## Quick Links

### For Users
- [Installation Guide](./user/installation.md)
- [Quick Start](./user/quick-start.md)
- [Configuration Reference](./user/configuration.md)
- [CLI Commands](./user/cli-commands.md)
- [Troubleshooting](./user/troubleshooting.md)

### For Developers
- [Architecture Overview](./dev/architecture.md)
- [Contributing Guide](./dev/contributing.md)
- [Testing Guide](./dev/testing.md)
- [API Reference](./api/reference.md)

## What is devgate?

devgate is a local HTTPS reverse proxy tool designed for development environments. It allows you to access multiple local services through meaningful hostnames without modifying your system's hosts file.

### Key Features

- **Automatic DNS Resolution**: Uses sslip.io to resolve hostnames containing IP addresses
- **HTTPS Support**: Automatic TLS certificate generation with mkcert or self-signed fallback
- **WebSocket Proxying**: Full WebSocket support for real-time applications
- **Dashboard**: Built-in dashboard showing all configured routes and their health status
- **Hot Reload**: Configuration changes are automatically detected and applied
- **ESM Module**: Can be used as a Node.js library or CLI tool

## Project Structure

```
devgate/
├── api/               # Core API modules
│   ├── ip-detection.js    # Local IP detection
│   └── hostname-builder.js # Hostname generation
├── cert/              # Certificate management
├── cli/               # CLI interface
├── config/            # Configuration loading
├── dashboard/         # Dashboard UI
├── fixtures/          # Test fixtures
├── health/            # Health check system
├── proxy/             # HTTPS reverse proxy
└── docs/              # This documentation
    ├── user/              # User guides
    ├── dev/               # Developer guides
    └── api/               # API reference
```

## Getting Help

- For issues: https://github.com/yourusername/devgate/issues
- For questions: https://github.com/yourusername/devgate/discussions

## License

MIT

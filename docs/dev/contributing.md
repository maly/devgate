# Contributing Guide

Thank you for your interest in contributing to devgate!

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Git

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/devgate.git
   cd devgate
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run tests to verify setup:**
   ```bash
   npm run test:run
   ```

4. **Run the CLI:**
   ```bash
   node cli/bin/devgate.js doctor
   ```

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
├── fixtures/          # Test fixtures (ports 10001-10003)
├── health/            # Health check system
├── proxy/             # HTTPS reverse proxy
├── tests/             # Test suites
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   └── e2e/              # End-to-end tests
└── docs/              # Documentation
```

## Code Style

This project uses:

- **ESM modules** (import/export)
- **No TypeScript** (pure JavaScript)
- **ES2022+ features**
- **2-space indentation**

### Naming Conventions

- **Files**: kebab-case (`ip-detection.js`)
- **Classes**: PascalCase (`CertManager`)
- **Functions**: camelCase (`detectLocalIp`)
- **Constants**: SCREAMING_SNAKE_CASE (`DEFAULT_CERT_DIR`)

### Best Practices

1. **Use async/await** for asynchronous operations
2. **Handle errors explicitly** with try/catch
3. **Validate inputs** at function boundaries
4. **Document exported functions** with JSDoc
5. **Keep functions small** and focused

## Making Changes

### 1. Create a Branch

```bash
git checkout -b feature/my-new-feature
# or
git checkout -b fix/bug-description
```

### 2. Make Your Changes

- Follow the code style guidelines
- Add tests for new functionality
- Update documentation if needed

### 3. Test Your Changes

```bash
# Run all tests
npm run test:run

# Run specific test file
npm run test:run tests/unit/ip-detection.test.js

# Run tests in watch mode
npm test
```

### 4. Commit Your Changes

Follow conventional commits:

```bash
# Feature
git commit -m "feat: add timeout option to routes"

# Bug fix
git commit -m "fix: handle missing healthcheck gracefully"

# Documentation
git commit -m "docs: update troubleshooting guide"

# Refactoring
git commit -m "refactor: simplify hostname matching logic"
```

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `refactor` - Code refactoring
- `test` - Tests
- `chore` - Maintenance

## Pull Request Process

1. **Ensure all tests pass**
2. **Update documentation** if needed
3. **Push your branch**
4. **Create a Pull Request**
5. **Describe your changes**

### PR Description Template

```markdown
## Summary
Brief description of the changes.

## Changes
- Change 1
- Change 2

## Testing
How was this tested?

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No lint errors
```

## Test Guidelines

### Unit Tests

Test individual functions in isolation:

```javascript
import { describe, it, expect } from 'vitest';
import { detectLocalIp } from '../api/ip-detection.js';

describe('detectLocalIp', () => {
  it('should detect local IP', () => {
    const result = detectLocalIp();
    expect(result).toBeDefined();
    expect(result.ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });
});
```

### Integration Tests

Test module interactions:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Proxy Routing', () => {
  // Setup test fixtures
  beforeAll(async () => {
    // Start test servers
  });

  afterAll(async () => {
    // Stop test servers
  });

  it('should route to correct upstream', async () => {
    // Test routing logic
  });
});
```

### Running Specific Tests

```bash
# Unit tests only
npm run test:run tests/unit/

# Integration tests only
npm run test:run tests/integration/

# E2E tests only
npm run test:run tests/e2e/
```

## Documentation

### User Documentation (`docs/user/`)

- installation.md
- quick-start.md
- configuration.md
- cli-commands.md
- troubleshooting.md

### Developer Documentation (`docs/dev/`)

- architecture.md
- contributing.md
- testing.md

### API Reference (`docs/api/`)

- reference.md

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Accept constructive criticism gracefully
- Focus on what's best for the community

## Getting Help

- Open an issue for bugs or questions
- Use discussions for general questions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

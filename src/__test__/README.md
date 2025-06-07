# Testing Documentation

This directory contains the comprehensive testing suite for the Tailscale MCP Server, implementing a dual-strategy approach with separate unit and integration test configurations.

## Testing Philosophy

The project follows a **separation of concerns** testing strategy:

- **Unit Tests**: Fast, isolated testing of individual components
- **Integration Tests**: Real-world testing with Tailscale CLI integration
- **Security Tests**: Validation of CLI input sanitization and security measures

## Test Structure

```
src/__test__/
├── README.md                           # This documentation
├── setup.ts                           # Global test setup
├── setup.integration.ts               # Integration test setup
├── utils/
│   ├── logger.test.ts                 # Unit tests for utilities
│   └── types.test.ts                  # Type validation tests
├── tailscale/
│   └── cli-security.integration.test.ts  # CLI security integration tests
└── tools/
    └── *.test.ts                      # Tool unit tests
```

## Test Configurations

### Base Configuration (`jest.config.ts`)
- **Purpose**: Default configuration for all tests
- **Coverage**: Comprehensive coverage reporting
- **Timeout**: 15 seconds for integration tests
- **Environment**: Node.js with ESM support

### Unit Test Configuration (`jest.config.unit.ts`)
- **Purpose**: Fast, isolated component testing
- **Pattern**: `**/*.test.ts` (excludes integration tests)
- **Requirements**: No external dependencies
- **Speed**: Optimized for rapid feedback
- **Coverage**: Business logic, utilities, pure functions

### Integration Test Configuration (`jest.config.integration.ts`)
- **Purpose**: End-to-end testing with real Tailscale CLI
- **Pattern**: `**/*.integration.test.ts`
- **Requirements**: Tailscale CLI installed
- **Speed**: Slower execution due to external calls
- **Coverage**: CLI integration, security validation, workflows

## Running Tests

### Quick Commands

```bash
# Run all tests
npm test

# Unit tests only (fast)
npm run test:unit

# Integration tests only (requires Tailscale CLI)
npm run test:integration

# Watch mode for development
npm run test:watch
npm run test:unit:watch
npm run test:integration:watch

# Coverage reports
npm run test:coverage
npm run test:unit:coverage
npm run test:integration:coverage

# CI mode (non-interactive)
npm run test:ci
npm run test:unit:ci
npm run test:integration:ci
```

### Environment Setup

#### Prerequisites for Integration Tests

**macOS:**
```bash
brew install tailscale
```

**Ubuntu/Debian:**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

**Verification:**
```bash
tailscale version
```

#### Environment Variables

```bash
# Optional: Enable debug logging
export LOG_LEVEL=0

# Optional: Custom log files
export MCP_SERVER_LOG_FILE="test-server-{timestamp}.log"
export MCP_LOG_FILE="test-mcp-{timestamp}.log"

# CI mode (auto-set in GitHub Actions)
export TAILSCALE_TEST_MODE="ci"
```

## Test Categories

### Unit Tests

**Location**: `**/*.test.ts`
**Purpose**: Test individual components in isolation

#### Characteristics
- ✅ **Fast execution** (< 1 second per test)
- ✅ **No external dependencies**
- ✅ **Deterministic results**
- ✅ **High coverage** of business logic
- ✅ **Cross-platform compatibility**

#### Example Structure
```typescript
// src/__test__/utils/logger.test.ts
import { Logger } from "../../logger";

describe("Logger", () => {
  test("should format messages correctly", () => {
    const logger = new Logger();
    expect(logger.format("test")).toBe("expected");
  });
});
```

### Integration Tests

**Location**: `**/*.integration.test.ts`
**Purpose**: Test real Tailscale CLI integration

#### Characteristics
- ⏱️ **Slower execution** (may take several seconds)
- 🔧 **Requires Tailscale CLI**
- 🔒 **Security validation**
- 🌐 **Real network interactions** (when authenticated)
- 🧪 **End-to-end workflows**

#### Example Structure
```typescript
// src/__test__/tailscale/cli-security.integration.test.ts
import { TailscaleCLI } from "../../tailscale/tailscale-cli";

describe("TailscaleCLI Security", () => {
  test("should reject malicious input", async () => {
    const cli = new TailscaleCLI();
    await expect(cli.ping("invalid; rm -rf /")).rejects.toThrow();
  });
});
```

## Test Utilities

### Global Setup

#### `setup.ts`
- **Purpose**: Common setup for all tests
- **Features**:
  - Environment variable configuration
  - Global test utilities
  - Mock configurations

#### `setup.integration.ts`
- **Purpose**: Integration-specific setup
- **Features**:
  - Tailscale CLI availability checking
  - Authentication status validation
  - Conditional test execution utilities

### Conditional Test Execution

The integration setup provides utilities for smart test execution:

```typescript
// Skip tests if Tailscale CLI is not available
global.integrationTestUtils.skipIfNoTailscale()("should test CLI", () => {
  // Test implementation
});

// Skip tests if not logged into Tailscale
global.integrationTestUtils.skipIfNotLoggedIn()("should test network", () => {
  // Test implementation
});

// Skip tests in CI mode without authentication
global.integrationTestUtils.skipIfCIWithoutAuth()("should test API", () => {
  // Test implementation
});
```

## Coverage Reporting

### Coverage Targets

| Test Type | Target | Focus |
|-----------|--------|-------|
| Unit | 90%+ | Business logic, utilities |
| Integration | 70%+ | CLI integration, security |
| Combined | 85%+ | Overall project coverage |

### Coverage Configuration

```javascript
// jest.config.ts
collectCoverageFrom: [
  "src/**/*.ts",
  "!src/**/*.d.ts",
  "!src/index.ts"  // Entry point excluded
]
```

### Coverage Reports

- **Text**: Console output for quick feedback
- **LCOV**: For CI integration (Codecov)
- **HTML**: Detailed browser-viewable reports

## CI/CD Integration

### GitHub Actions

The testing strategy integrates with GitHub Actions workflows:

#### Unit Tests
- **Matrix**: Node.js 18, 20, 22
- **Speed**: Fast feedback on all platforms
- **Coverage**: Uploaded to Codecov

#### Integration Tests
- **Environment**: Ubuntu with Tailscale CLI
- **Authentication**: Optional via `TAILSCALE_AUTH_KEY`
- **Cleanup**: Automatic Tailscale logout/cleanup

### CI Test Modes

```bash
# CI-optimized test execution
npm run test:unit:ci      # Unit tests for CI
npm run test:integration:ci  # Integration tests for CI
npm run test:ci           # All tests for CI
```

## Writing Tests

### Unit Test Guidelines

1. **Isolation**: Mock external dependencies
2. **Speed**: Keep tests under 1 second
3. **Clarity**: Descriptive test names and assertions
4. **Coverage**: Test edge cases and error conditions

```typescript
describe("ToolRegistry", () => {
  beforeEach(() => {
    // Setup for each test
  });

  test("should register tools correctly", () => {
    // Test implementation
  });

  test("should handle duplicate registrations", () => {
    // Error case testing
  });
});
```

### Integration Test Guidelines

1. **Security**: Always test input sanitization
2. **Cleanup**: Ensure proper resource cleanup
3. **Conditional**: Use skip utilities for missing dependencies
4. **Realistic**: Test real-world scenarios

```typescript
describe("Tailscale CLI Integration", () => {
  beforeAll(async () => {
    // Integration setup
  });

  afterAll(async () => {
    // Cleanup
  });

  global.integrationTestUtils.skipIfNoTailscale()(
    "should execute CLI commands safely",
    async () => {
      // Test implementation
    }
  );
});
```

## Debugging Tests

### Debug Configuration

```bash
# Enable debug logging
export LOG_LEVEL=0

# Run specific test file
npm test -- --testPathPattern=logger.test.ts

# Run with verbose output
npm test -- --verbose

# Debug integration tests
npm run test:integration -- --testNamePattern="security"
```

### Common Issues

#### Integration Tests Skipped
```bash
# Check Tailscale CLI installation
which tailscale
tailscale version

# Check authentication status
tailscale status
```

#### Coverage Issues
```bash
# Generate detailed coverage report
npm run test:coverage

# Open HTML coverage report
open coverage/lcov-report/index.html
```

#### Test Timeouts
```bash
# Increase timeout for specific tests
test("slow test", async () => {
  // Test implementation
}, 30000); // 30 second timeout
```

## Performance Optimization

### Test Execution Speed

1. **Parallel Execution**: Jest runs tests in parallel by default
2. **Test Isolation**: Unit tests run independently
3. **Smart Skipping**: Integration tests skip when dependencies unavailable
4. **Caching**: Jest caches transformed files

### CI Optimization

1. **Matrix Strategy**: Unit tests on multiple Node.js versions
2. **Dependency Caching**: npm dependencies cached between runs
3. **Artifact Reuse**: Build artifacts shared between jobs
4. **Conditional Execution**: Skip unnecessary test runs

## Best Practices

### Test Organization
1. **Mirror Structure**: Test files mirror source structure
2. **Clear Naming**: Use descriptive test and file names
3. **Logical Grouping**: Group related tests in describe blocks
4. **Setup/Teardown**: Use appropriate Jest lifecycle hooks

### Test Quality
1. **Single Responsibility**: One concept per test
2. **Readable Assertions**: Clear, descriptive expectations
3. **Error Testing**: Test both success and failure cases
4. **Documentation**: Comment complex test logic

### Maintenance
1. **Regular Updates**: Keep test dependencies current
2. **Coverage Monitoring**: Track coverage trends
3. **Performance Monitoring**: Watch for slow tests
4. **Cleanup**: Remove obsolete tests

## Contributing

### Adding New Tests

1. **Choose Type**: Unit vs integration based on dependencies
2. **Follow Patterns**: Use existing test structure
3. **Add Documentation**: Update this README if needed
4. **Verify Coverage**: Ensure adequate test coverage

### Test Review Checklist

- [ ] Tests follow naming conventions
- [ ] Appropriate test type (unit vs integration)
- [ ] Proper setup and cleanup
- [ ] Edge cases covered
- [ ] Security considerations addressed
- [ ] Documentation updated if needed

For more information about Jest testing framework, see the [Jest documentation](https://jestjs.io/docs/getting-started).
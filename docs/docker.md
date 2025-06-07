# Docker Documentation

This documentation covers Docker containerization for the Tailscale MCP Server, including development workflows, production deployment, and configuration management.

## Overview

The project uses a **multi-stage Docker build** strategy optimized for:
- **Security**: Non-root user, minimal attack surface
- **Performance**: Optimized layer caching and minimal image size
- **Reliability**: Health checks and proper signal handling
- **Development**: Separate development and production configurations

## Container Architecture

### Multi-Stage Build Process

```dockerfile
# Stage 1: Builder
FROM node:20-alpine AS builder
# - Installs all dependencies (including devDependencies)
# - Builds TypeScript to JavaScript
# - Prunes to production dependencies only

# Stage 2: Production
FROM node:20-alpine AS production
# - Copies only production artifacts
# - Sets up non-root user
# - Configures security and health checks
```

### Security Features

- **Non-root execution**: Dedicated `appuser` (UID 1001)
- **Minimal base image**: Alpine Linux for reduced attack surface
- **Signal handling**: `dumb-init` for proper PID 1 management
- **Health checks**: Built-in container health monitoring

## Quick Start

### Using Pre-built Images

#### GitHub Container Registry (Recommended)
```bash
docker run -d \
  --name tailscale-mcp \
  -e TAILSCALE_API_KEY=your_api_key \
  -e TAILSCALE_TAILNET=your_tailnet \
  ghcr.io/hexsleeves/tailscale-mcp-server:latest
```

#### Docker Hub
```bash
docker run -d \
  --name tailscale-mcp \
  -e TAILSCALE_API_KEY=your_api_key \
  -e TAILSCALE_TAILNET=your_tailnet \
  hexsleeves/tailscale-mcp-server:latest
```

### Using Docker Compose

#### Production Deployment
```bash
# Use the included docker-compose.yml
docker-compose up -d
```

#### Development Environment
```bash
# Create development compose file
docker-compose -f docker-compose.dev.yml up
```

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `TAILSCALE_API_KEY` | Tailscale API key | Yes* | - |
| `TAILSCALE_TAILNET` | Tailscale tailnet name | Yes* | - |
| `TAILSCALE_API_BASE_URL` | API base URL | No | `https://api.tailscale.com` |
| `LOG_LEVEL` | Logging level (0-3) | No | `1` (INFO) |
| `MCP_SERVER_LOG_FILE` | Server log file path | No | - |
| `NODE_ENV` | Node environment | No | `production` |

*Required for API-based operations. CLI operations work without API credentials.

### Volume Mounts

#### Log Persistence
```bash
docker run -d \
  --name tailscale-mcp \
  -v ./logs:/app/logs \
  -e MCP_SERVER_LOG_FILE=/app/logs/server.log \
  ghcr.io/hexsleeves/tailscale-mcp-server:latest
```

#### Development Volume Mounting
```bash
docker run -it --rm \
  -v $(pwd):/app \
  -v /app/node_modules \
  -w /app \
  node:20-alpine \
  npm run dev
```

## Docker Compose Configurations

### Production (`docker-compose.yml`)

```yaml
version: "3.8"

services:
  tailscale-mcp:
    build: .
    restart: unless-stopped
    container_name: tailscale-mcp-server
    networks:
      - mcp-network
    volumes:
      - ./logs:/app/logs
    environment:
      - TAILSCALE_API_KEY=${TAILSCALE_API_KEY}
      - TAILSCALE_TAILNET=${TAILSCALE_TAILNET}
      - MCP_SERVER_LOG_FILE=/app/logs/server.log
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "node", "-e", "process.exit(0)"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  mcp-network:
    driver: bridge
```

### Development (`docker-compose.dev.yml`)

```yaml
version: "3.8"

services:
  tailscale-mcp-dev:
    build:
      context: .
      target: builder  # Use builder stage for development
    container_name: tailscale-mcp-dev
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - TAILSCALE_API_KEY=${TAILSCALE_API_KEY}
      - TAILSCALE_TAILNET=${TAILSCALE_TAILNET}
      - LOG_LEVEL=0  # Debug logging
      - NODE_ENV=development
    command: npm run dev:watch
    ports:
      - "3000:3000"  # Expose for debugging
```

## Building Images

### Local Development Build

```bash
# Build development image
docker build -t tailscale-mcp-dev .

# Build with specific target
docker build --target builder -t tailscale-mcp-builder .
```

### Production Build

```bash
# Build production image
docker build -t tailscale-mcp-prod .

# Build with build args
docker build \
  --build-arg NODE_VERSION=20 \
  -t tailscale-mcp-prod .
```

### Multi-Platform Build

```bash
# Setup buildx (if not already done)
docker buildx create --use

# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t tailscale-mcp-multi \
  --push .
```

## Development Workflows

### Local Development with Docker

#### Option 1: Volume Mounting
```bash
# Mount source code for live development
docker run -it --rm \
  -v $(pwd):/app \
  -v /app/node_modules \
  -e TAILSCALE_API_KEY=your_key \
  -e TAILSCALE_TAILNET=your_tailnet \
  -e LOG_LEVEL=0 \
  node:20-alpine \
  sh -c "cd /app && npm run dev:watch"
```

#### Option 2: Development Container
```bash
# Use development compose configuration
docker-compose -f docker-compose.dev.yml up
```

#### Option 3: Interactive Development
```bash
# Start interactive container
docker run -it --rm \
  -v $(pwd):/app \
  -w /app \
  node:20-alpine \
  sh

# Inside container
npm install
npm run dev
```

### Testing in Docker

#### Unit Tests
```bash
docker run --rm \
  -v $(pwd):/app \
  -w /app \
  node:20-alpine \
  sh -c "npm ci && npm run test:unit"
```

#### Integration Tests (with Tailscale CLI)
```bash
# Build test image with Tailscale CLI
docker build -f Dockerfile.test -t tailscale-mcp-test .

# Run integration tests
docker run --rm \
  -v $(pwd):/app \
  -w /app \
  tailscale-mcp-test \
  npm run test:integration
```

## Production Deployment

### Container Orchestration

#### Docker Swarm
```yaml
version: "3.8"

services:
  tailscale-mcp:
    image: ghcr.io/hexsleeves/tailscale-mcp-server:latest
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    environment:
      - TAILSCALE_API_KEY_FILE=/run/secrets/tailscale_api_key
      - TAILSCALE_TAILNET=${TAILSCALE_TAILNET}
    secrets:
      - tailscale_api_key

secrets:
  tailscale_api_key:
    external: true
```

#### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tailscale-mcp-server
spec:
  replicas: 2
  selector:
    matchLabels:
      app: tailscale-mcp-server
  template:
    metadata:
      labels:
        app: tailscale-mcp-server
    spec:
      containers:
      - name: tailscale-mcp-server
        image: ghcr.io/hexsleeves/tailscale-mcp-server:latest
        env:
        - name: TAILSCALE_API_KEY
          valueFrom:
            secretKeyRef:
              name: tailscale-secrets
              key: api-key
        - name: TAILSCALE_TAILNET
          value: "your-tailnet"
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"
```

### Health Monitoring

#### Health Check Configuration
```bash
# Custom health check
docker run -d \
  --name tailscale-mcp \
  --health-cmd="node -e 'process.exit(0)'" \
  --health-interval=30s \
  --health-timeout=3s \
  --health-retries=3 \
  ghcr.io/hexsleeves/tailscale-mcp-server:latest
```

#### Monitoring Health Status
```bash
# Check container health
docker ps --format "table {{.Names}}\t{{.Status}}"

# View health check logs
docker inspect --format='{{json .State.Health}}' tailscale-mcp
```

## Security Considerations

### Container Security

#### Non-Root Execution
```dockerfile
# Dockerfile security configuration
RUN addgroup -S appgroup -g 1001 && \
    adduser -S appuser -u 1001 -G appgroup
USER appuser
```

#### Secrets Management
```bash
# Use Docker secrets (recommended)
echo "your-api-key" | docker secret create tailscale_api_key -

# Use environment files
docker run --env-file .env.production ghcr.io/hexsleeves/tailscale-mcp-server:latest
```

#### Network Security
```bash
# Run with custom network
docker network create --driver bridge mcp-network
docker run --network mcp-network ghcr.io/hexsleeves/tailscale-mcp-server:latest
```

### Image Security

#### Vulnerability Scanning
```bash
# Scan with Trivy
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy:latest image ghcr.io/hexsleeves/tailscale-mcp-server:latest

# Scan with Docker Scout
docker scout cves ghcr.io/hexsleeves/tailscale-mcp-server:latest
```

#### Image Verification
```bash
# Verify image signatures (when available)
docker trust inspect ghcr.io/hexsleeves/tailscale-mcp-server:latest
```

## Troubleshooting

### Common Issues

#### Container Won't Start
```bash
# Check container logs
docker logs tailscale-mcp

# Check container configuration
docker inspect tailscale-mcp

# Run interactively for debugging
docker run -it --rm ghcr.io/hexsleeves/tailscale-mcp-server:latest sh
```

#### Permission Issues
```bash
# Check user/group configuration
docker run --rm ghcr.io/hexsleeves/tailscale-mcp-server:latest id

# Fix volume permissions
sudo chown -R 1001:1001 ./logs
```

#### Network Connectivity
```bash
# Test network connectivity
docker run --rm ghcr.io/hexsleeves/tailscale-mcp-server:latest \
  sh -c "ping -c 3 api.tailscale.com"

# Check DNS resolution
docker run --rm ghcr.io/hexsleeves/tailscale-mcp-server:latest \
  sh -c "nslookup api.tailscale.com"
```

### Debug Mode

#### Enable Debug Logging
```bash
docker run -d \
  --name tailscale-mcp-debug \
  -e LOG_LEVEL=0 \
  -e MCP_SERVER_LOG_FILE=/app/logs/debug.log \
  -v ./logs:/app/logs \
  ghcr.io/hexsleeves/tailscale-mcp-server:latest
```

#### Interactive Debugging
```bash
# Start container with shell
docker run -it --rm \
  -e TAILSCALE_API_KEY=your_key \
  -e TAILSCALE_TAILNET=your_tailnet \
  ghcr.io/hexsleeves/tailscale-mcp-server:latest \
  sh

# Inside container, run manually
node dist/index.js
```

## Performance Optimization

### Image Size Optimization

The multi-stage build reduces image size by:
- Excluding development dependencies
- Using Alpine Linux base image
- Copying only necessary artifacts

### Runtime Optimization

```bash
# Limit container resources
docker run -d \
  --name tailscale-mcp \
  --memory=128m \
  --cpus=0.5 \
  ghcr.io/hexsleeves/tailscale-mcp-server:latest
```

### Build Optimization

```bash
# Use build cache
docker build --cache-from ghcr.io/hexsleeves/tailscale-mcp-server:latest .

# Parallel builds with buildx
docker buildx build --platform linux/amd64,linux/arm64 .
```

## Best Practices

### Development
1. **Use volume mounts** for live code reloading
2. **Enable debug logging** for development containers
3. **Use development compose files** for consistent environments
4. **Mount node_modules** to avoid reinstalling dependencies

### Production
1. **Use specific image tags** instead of `latest`
2. **Implement health checks** for container monitoring
3. **Use secrets management** for sensitive data
4. **Set resource limits** to prevent resource exhaustion
5. **Enable logging** with persistent volumes

### Security
1. **Run as non-root user** (already configured)
2. **Use minimal base images** (Alpine Linux)
3. **Scan images regularly** for vulnerabilities
4. **Keep base images updated** with security patches
5. **Use secrets** instead of environment variables for sensitive data

For more information about Docker best practices, see the [Docker documentation](https://docs.docker.com/develop/dev-best-practices/).

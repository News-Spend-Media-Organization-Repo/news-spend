# Migration Guide

This guide helps you migrate from the old `payload-cpanel-storage` plugin to the improved version.

## What's New

### Major Improvements

1. **Connection Pooling** - Reuses connections instead of creating new ones for every operation
2. **Automatic Retry** - Exponential backoff for transient network failures
3. **Better Error Handling** - Custom error types with detailed context
4. **Path Sanitization** - Security improvements to prevent path traversal
5. **Health Checks** - Automatic connection health monitoring
6. **Graceful Shutdown** - Proper cleanup on process termination
7. **Better Logging** - Structured logging with `@news-spend-media/logger`
8. **Type Safety** - Improved TypeScript types and validation
9. **Performance** - Redirect-based static file serving by default

### Breaking Changes

1. **Package Name**: Changed from `@nsm/payload-cpanel-storage` to `@news-spend-media/payload-cpanel-storage`
2. **Import Path**: Update your imports
3. **Configuration**: New `pool` and `static` configuration options
4. **Dependencies**: Now requires `@news-spend-media/logger`

## Step-by-Step Migration

### 1. Update Dependencies

```bash
# Remove old package
bun remove @nsm/payload-cpanel-storage

# Install new package
bun add @news-spend-media/payload-cpanel-storage
bun add @news-spend-media/logger
```

### 2. Update Imports

**Before:**

```typescript
import { cpanelSftpStorage } from "@nsm/payload-cpanel-storage";
```

**After:**

```typescript
import { cpanelSftpStorage } from "@news-spend-media/payload-cpanel-storage";
```

### 3. Update Configuration

**Before (Old Version):**

```typescript
cpanelSftpStorage({
  collections: {
    media: true,
  },
  connection: {
    host: process.env.SFTP_HOST,
    username: process.env.SFTP_USERNAME,
    password: process.env.SFTP_PASSWORD,
  },
  baseUrl: process.env.STORAGE_BASE_URL,
  uploadDir: process.env.STORAGE_UPLOAD_DIR,
});
```

**After (New Version):**

```typescript
cpanelSftpStorage({
  collections: {
    media: true,
  },
  connection: {
    host: process.env.SFTP_HOST!,
    username: process.env.SFTP_USERNAME!,
    password: process.env.SFTP_PASSWORD!,
  },
  baseUrl: process.env.STORAGE_BASE_URL!,
  uploadDir: process.env.STORAGE_UPLOAD_DIR!,
  // New optional configuration
  pool: {
    minConnections: 1,
    maxConnections: 10,
    idleTimeoutMs: 60_000,
  },
});
```

### 4. Update Environment Variables (Optional)

The new version validates configuration more strictly. Ensure your environment variables are set:

```env
SFTP_HOST=ftp.example.com
SFTP_USERNAME=username
SFTP_PASSWORD=password
STORAGE_BASE_URL=https://example.com/uploads
STORAGE_UPLOAD_DIR=/home/username/public_html/uploads
```

### 5. Test Your Configuration

Run type checking to catch any issues:

```bash
bun run check-types
```

### 6. Deploy

Deploy your application with the new plugin. The connection pool will initialize automatically.

## Configuration Comparison

### Old Plugin (Minimal Config)

```typescript
{
  collections: { media: true },
  connection: {
    host: 'ftp.example.com',
    username: 'user',
    password: 'pass',
  },
  baseUrl: 'https://example.com/uploads',
  uploadDir: '/uploads',
}
```

### New Plugin (With Defaults)

```typescript
{
  collections: { media: true },
  enabled: true, // New: can disable plugin
  connection: {
    host: 'ftp.example.com',
    username: 'user',
    password: 'pass',
  },
  baseUrl: 'https://example.com/uploads',
  uploadDir: '/uploads',
  pool: { // New: connection pool config
    minConnections: 1,
    maxConnections: 10,
    idleTimeoutMs: 60_000,
    connectionTimeoutMs: 30_000,
    healthCheckIntervalMs: 30_000,
    debug: false,
  },
  static: { // New: static file serving config
    proxyFiles: false, // Default: redirect
    cacheControl: 'public, max-age=31536000, immutable',
  },
}
```

## Error Handling Changes

### Old Version

Errors were often swallowed or logged without proper context:

```typescript
// Old version would silently fail or throw generic errors
catch (error) {
  // console.error('Error uploading file:', error)
  throw new Error('Error uploading file');
}
```

### New Version

Custom error types with detailed context:

```typescript
import {
  SftpUploadError,
  SftpDeleteError,
  SftpConnectionError,
} from "@news-spend-media/payload-cpanel-storage";

try {
  // Upload file
} catch (error) {
  if (error instanceof SftpUploadError) {
    console.error("Upload failed:", {
      filename: error.filename,
      code: error.code,
      message: error.message,
      cause: error.cause,
    });
  }
}
```

## Performance Improvements

### Static File Handling

**Old Version:**

- Always proxied files through the server
- Fetched file from storage for every request
- No caching headers

**New Version:**

- Redirects to public URL by default (no server load)
- Optional proxying with cache headers
- Configurable cache control

```typescript
// Enable proxying if needed (e.g., for private files)
static: {
  proxyFiles: true,
  cacheControl: 'private, max-age=3600',
}
```

### Connection Management

**Old Version:**

- Created new SFTP connection for every operation
- No connection reuse
- No health checks

**New Version:**

- Connection pooling with configurable size
- Connection reuse across operations
- Automatic health checks
- Idle timeout handling

## Security Improvements

The new version includes comprehensive path sanitization:

### Prevented Attacks

1. **Directory Traversal**: `../../../etc/passwd` → sanitized
2. **Path Injection**: `file<>:?.jpg` → `file.jpg`
3. **Invalid Characters**: Removed automatically
4. **Path Validation**: All paths validated before use

### Example

```typescript
// Input
filename: "../../../etc/passwd";
prefix: "../../sensitive/";

// Old version: Might allow traversal
// New version: Sanitized to safe paths
filename: "etc-passwd";
prefix: "sensitive";
```

## Monitoring & Debugging

### Old Version

Limited visibility into plugin operation.

### New Version

Full observability:

```typescript
import { getConnectionPool } from "@news-spend-media/payload-cpanel-storage";

// Get pool statistics
const pool = getConnectionPool();
if (pool) {
  const stats = pool.getStats();
  console.log({
    total: stats.totalConnections,
    active: stats.activeConnections,
    idle: stats.idleConnections,
    healthy: stats.healthyConnections,
  });
}

// Enable debug logging
cpanelSftpStorage({
  // ... other config
  pool: {
    debug: true, // Detailed connection pool logs
  },
});
```

## Troubleshooting Migration Issues

### Issue: "Module not found"

**Solution:** Update import paths:

```typescript
// Old
import { cpanelSftpStorage } from "@nsm/payload-cpanel-storage";

// New
import { cpanelSftpStorage } from "@news-spend-media/payload-cpanel-storage";
```

### Issue: "Logger not found"

**Solution:** Install logger package:

```bash
bun add @news-spend-media/logger
```

### Issue: Connection timeouts

**Solution:** Increase timeouts in pool config:

```typescript
pool: {
  connectionTimeoutMs: 60_000, // 60 seconds
}
```

### Issue: "Too many connections"

**Solution:** Adjust pool size:

```typescript
pool: {
  maxConnections: 5, // Reduce max connections
  idleTimeoutMs: 30_000, // Close idle connections faster
}
```

### Issue: Files not accessible

**Solution:** Check baseUrl configuration:

```typescript
// Ensure baseUrl is publicly accessible
baseUrl: 'https://example.com/uploads', // No trailing slash
```

### Issue: Permission denied

**Solution:** Check SFTP user permissions:

```bash
# On the server
chmod 755 /path/to/uploads
chown sftpuser:sftpgroup /path/to/uploads
```

## Rollback Plan

If you need to rollback to the old version:

```bash
# Reinstall old version
bun remove @news-spend-media/payload-cpanel-storage
bun add @nsm/payload-cpanel-storage

# Revert imports and configuration
# Use old configuration format
```

## Testing Checklist

After migration, test the following:

- [ ] File uploads work correctly
- [ ] File deletions work correctly
- [ ] Files are accessible via public URL
- [ ] Connection pool initializes without errors
- [ ] Health checks run successfully
- [ ] Graceful shutdown works (test with `SIGTERM`)
- [ ] Error handling provides useful information
- [ ] Performance is improved (check logs)
- [ ] No connection leaks (monitor pool stats)

## Getting Help

If you encounter issues during migration:

1. Enable debug logging: `pool: { debug: true }`
2. Check connection pool stats: `getConnectionPool()?.getStats()`
3. Review error messages for specific error types
4. Check environment variables are set correctly
5. Verify SFTP server is accessible and permissions are correct

## Summary

The new version provides significant improvements in:

- **Reliability**: Connection pooling and retry logic
- **Security**: Comprehensive path sanitization
- **Performance**: Redirect-based file serving
- **Observability**: Detailed logging and monitoring
- **Developer Experience**: Better types and error messages

The migration is straightforward and should take less than 30 minutes for most projects.

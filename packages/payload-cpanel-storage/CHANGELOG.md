# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-XX

### Added

#### Core Features
- **Connection Pooling**: Efficient SFTP connection management with configurable pool size
- **Automatic Retry Logic**: Exponential backoff for transient network failures
- **Health Checks**: Automatic connection health monitoring and replacement
- **Graceful Shutdown**: Proper cleanup on process termination (SIGTERM, SIGINT)
- **Path Sanitization**: Comprehensive security against directory traversal and path injection
- **Structured Logging**: Integration with `@news-spend-media/logger` for observability
- **TypeScript Support**: Full type safety with comprehensive type definitions

#### Security
- Path traversal attack prevention
- Filename sanitization
- Dangerous character filtering
- Path validation before operations
- Support for SSH key authentication (recommended over passwords)
- Support for SSH agent authentication

#### Performance
- Redirect-based static file serving (default) - no server load
- Optional file proxying with cache headers
- Connection reuse across operations
- Configurable connection pool sizes
- Idle timeout handling

#### Error Handling
- Custom error types for different failure scenarios:
  - `SftpConnectionError` - Connection failures
  - `SftpUploadError` - Upload failures
  - `SftpDeleteError` - Deletion failures
  - `SftpConfigError` - Configuration errors
  - `SftpPathError` - Path validation errors
- Detailed error context for debugging
- Retry logic with configurable attempts

#### Monitoring & Observability
- Pool statistics API (`getStats()`)
- Connection health tracking
- Detailed logging at all levels (trace, debug, info, warn, error)
- Debug mode for development

#### Configuration
- Flexible collection configuration
- Connection pool tuning options
- Static file handler configuration
- Environment-based configuration support
- Enable/disable plugin per environment

### Changed

#### Breaking Changes from Previous Version
- **Package Name**: Changed from `@nsm/payload-cpanel-storage` to `@news-spend-media/payload-cpanel-storage`
- **Import Path**: Update imports to use new package name
- **Configuration Structure**: Added new `pool` and `static` configuration options
- **Dependencies**: Now requires `@news-spend-media/logger`

#### Improvements
- **Connection Management**: No longer creates a new connection for every operation
- **Error Messages**: More descriptive error messages with full context
- **Static File Handling**: Changed from always proxying to redirect-by-default
- **Type Safety**: Improved TypeScript types throughout
- **Code Quality**: Follows Ultracite/Biome standards

### Deprecated
- None

### Removed
- Removed silent error swallowing - all errors are now properly thrown
- Removed unsafe path operations

### Fixed
- Connection leaks (connections are now properly pooled and closed)
- Missing error handling in upload/delete operations
- Path traversal vulnerabilities
- Type safety issues
- Missing health checks

### Security
- Added comprehensive path sanitization
- SSH key authentication support
- Proper error handling to prevent information leakage
- Validation of all configuration options

## Migration from 0.x

See [MIGRATION.md](./MIGRATION.md) for detailed migration instructions.

### Quick Migration Steps

1. Update package name:
   ```bash
   bun remove @nsm/payload-cpanel-storage
   bun add @news-spend-media/payload-cpanel-storage @news-spend-media/logger
   ```

2. Update imports:
   ```typescript
   // Old
   import { cpanelSftpStorage } from '@nsm/payload-cpanel-storage';
   
   // New
   import { cpanelSftpStorage } from '@news-spend-media/payload-cpanel-storage';
   ```

3. Add optional pool configuration (uses smart defaults if omitted):
   ```typescript
   cpanelSftpStorage({
     collections: { media: true },
     connection: { /* ... */ },
     baseUrl: '...',
     uploadDir: '...',
     // Optional - uses defaults if omitted
     pool: {
       minConnections: 1,
       maxConnections: 10,
     },
   })
   ```

4. Test your configuration and deploy

## [0.x] - Previous Version

Initial implementation with basic SFTP functionality. See old repository for details.

### Known Issues (Fixed in 1.0.0)
- Created new connection for every operation
- No connection pooling
- Limited error handling
- No retry logic
- Potential path traversal vulnerabilities
- Always proxied files (server load)
- No health checks
- Poor observability

---

## Roadmap

Future enhancements under consideration:

- [ ] Batch operations for multiple file uploads/deletes
- [ ] Progress callbacks for large file uploads
- [ ] Optional local caching layer
- [ ] Support for file metadata storage
- [ ] Compression support for uploads
- [ ] Multi-region support
- [ ] Integration with Payload Cloud Storage dashboard
- [ ] WebDAV protocol support
- [ ] S3-compatible API support

## Support

For issues and feature requests, please open an issue in the repository.

## License

MIT

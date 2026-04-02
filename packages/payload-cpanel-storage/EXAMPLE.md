# Example Usage

This document provides real-world examples of using the `@news-spend-media/payload-cpanel-storage` plugin.

## Table of Contents

- [Basic Setup](#basic-setup)
- [Production Configuration](#production-configuration)
- [Development vs Production](#development-vs-production)
- [Multiple Collections](#multiple-collections)
- [SSH Key Authentication](#ssh-key-authentication)
- [Custom Pool Configuration](#custom-pool-configuration)
- [Error Handling](#error-handling)
- [Monitoring](#monitoring)

## Basic Setup

The simplest configuration for a single media collection:

```typescript
// payload.config.ts
import { buildConfig } from "payload/config";
import { cpanelSftpStorage } from "@news-spend-media/payload-cpanel-storage";

export default buildConfig({
  // ... other config
  plugins: [
    cpanelSftpStorage({
      collections: {
        media: true,
      },
      connection: {
        host: process.env.SFTP_HOST!,
        port: 22,
        username: process.env.SFTP_USERNAME!,
        password: process.env.SFTP_PASSWORD!,
      },
      baseUrl: process.env.STORAGE_BASE_URL!,
      uploadDir: process.env.STORAGE_UPLOAD_DIR!,
    }),
  ],
});
```

**.env:**

```env
SFTP_HOST=ftp.example.com
SFTP_USERNAME=your_username
SFTP_PASSWORD=your_secure_password
STORAGE_BASE_URL=https://example.com/uploads
STORAGE_UPLOAD_DIR=/home/username/public_html/uploads
```

## Production Configuration

Full production setup with optimized settings:

```typescript
// payload.config.ts
import { buildConfig } from "payload/config";
import { cpanelSftpStorage } from "@news-spend-media/payload-cpanel-storage";

export default buildConfig({
  // ... other config
  plugins: [
    cpanelSftpStorage({
      enabled: process.env.NODE_ENV === "production",
      collections: {
        media: {
          disableLocalStorage: true,
        },
        documents: {
          disableLocalStorage: true,
        },
        avatars: {
          disableLocalStorage: true,
        },
      },
      connection: {
        host: process.env.SFTP_HOST!,
        port: Number.parseInt(process.env.SFTP_PORT || "22", 10),
        username: process.env.SFTP_USERNAME!,
        password: process.env.SFTP_PASSWORD!,
        readyTimeout: 30_000, // 30 seconds
        retries: 2,
        retry_minTimeout: 2000,
      },
      baseUrl: process.env.STORAGE_BASE_URL!,
      uploadDir: process.env.STORAGE_UPLOAD_DIR!,
      pool: {
        minConnections: 2,
        maxConnections: 20,
        idleTimeoutMs: 120_000, // 2 minutes
        connectionTimeoutMs: 45_000, // 45 seconds
        healthCheckIntervalMs: 60_000, // 1 minute
        debug: false,
      },
      static: {
        proxyFiles: false, // Use redirects for CDN
        cacheControl: "public, max-age=31536000, immutable",
      },
    }),
  ],
});
```

**.env (Production):**

```env
NODE_ENV=production
SFTP_HOST=ftp.example.com
SFTP_PORT=22
SFTP_USERNAME=production_user
SFTP_PASSWORD=very_secure_password
STORAGE_BASE_URL=https://cdn.example.com/uploads
STORAGE_UPLOAD_DIR=/home/production/public_html/uploads
```

## Development vs Production

Different configurations for different environments:

```typescript
// payload.config.ts
import { buildConfig } from "payload/config";
import { cpanelSftpStorage } from "@news-spend-media/payload-cpanel-storage";

const isDevelopment = process.env.NODE_ENV !== "production";

export default buildConfig({
  // ... other config
  plugins: [
    // Only use SFTP in production
    ...(isDevelopment
      ? []
      : [
          cpanelSftpStorage({
            collections: {
              media: true,
              documents: true,
            },
            connection: {
              host: process.env.SFTP_HOST!,
              username: process.env.SFTP_USERNAME!,
              password: process.env.SFTP_PASSWORD!,
            },
            baseUrl: process.env.STORAGE_BASE_URL!,
            uploadDir: process.env.STORAGE_UPLOAD_DIR!,
            pool: {
              debug: isDevelopment,
            },
          }),
        ]),
  ],
});
```

Or use different settings:

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
  pool: {
    minConnections: isDevelopment ? 1 : 2,
    maxConnections: isDevelopment ? 5 : 20,
    debug: isDevelopment,
  },
});
```

## Multiple Collections

Configure multiple collections with different settings:

```typescript
cpanelSftpStorage({
  collections: {
    // Basic configuration
    media: true,

    // Custom configuration
    documents: {
      disableLocalStorage: true,
    },

    // Another collection
    avatars: true,

    // Yet another
    attachments: {
      disableLocalStorage: true,
    },
  },
  connection: {
    host: process.env.SFTP_HOST!,
    username: process.env.SFTP_USERNAME!,
    password: process.env.SFTP_PASSWORD!,
  },
  baseUrl: process.env.STORAGE_BASE_URL!,
  uploadDir: "/home/username/public_html/uploads",
});
```

Files will be organized as:

- `/home/username/public_html/uploads/media/`
- `/home/username/public_html/uploads/documents/`
- `/home/username/public_html/uploads/avatars/`
- `/home/username/public_html/uploads/attachments/`

## SSH Key Authentication

Using SSH keys instead of passwords (recommended):

```typescript
import { readFileSync } from "node:fs";
import { cpanelSftpStorage } from "@news-spend-media/payload-cpanel-storage";

cpanelSftpStorage({
  collections: {
    media: true,
  },
  connection: {
    host: process.env.SFTP_HOST!,
    port: 22,
    username: process.env.SFTP_USERNAME!,
    // Use SSH key instead of password
    privateKey: readFileSync(process.env.SSH_KEY_PATH || "/path/to/id_rsa"),
    passphrase: process.env.SSH_KEY_PASSPHRASE, // If key is encrypted
  },
  baseUrl: process.env.STORAGE_BASE_URL!,
  uploadDir: process.env.STORAGE_UPLOAD_DIR!,
});
```

**.env:**

```env
SFTP_HOST=ftp.example.com
SFTP_USERNAME=your_username
SSH_KEY_PATH=/home/user/.ssh/id_rsa
SSH_KEY_PASSPHRASE=key_passphrase_if_any
STORAGE_BASE_URL=https://example.com/uploads
STORAGE_UPLOAD_DIR=/home/username/public_html/uploads
```

Or use SSH agent:

```typescript
cpanelSftpStorage({
  collections: { media: true },
  connection: {
    host: process.env.SFTP_HOST!,
    username: process.env.SFTP_USERNAME!,
    agent: process.env.SSH_AUTH_SOCK, // Use SSH agent
  },
  baseUrl: process.env.STORAGE_BASE_URL!,
  uploadDir: process.env.STORAGE_UPLOAD_DIR!,
});
```

## Custom Pool Configuration

Fine-tuning the connection pool for your needs:

### High Traffic Site

```typescript
cpanelSftpStorage({
  collections: { media: true },
  connection: {
    host: process.env.SFTP_HOST!,
    username: process.env.SFTP_USERNAME!,
    password: process.env.SFTP_PASSWORD!,
  },
  baseUrl: process.env.STORAGE_BASE_URL!,
  uploadDir: process.env.STORAGE_UPLOAD_DIR!,
  pool: {
    minConnections: 5, // Keep 5 connections ready
    maxConnections: 30, // Allow up to 30 concurrent uploads
    idleTimeoutMs: 300_000, // Keep idle connections for 5 minutes
    connectionTimeoutMs: 60_000, // 1 minute timeout
    healthCheckIntervalMs: 30_000, // Check health every 30 seconds
  },
});
```

### Low Traffic / Resource Constrained

```typescript
cpanelSftpStorage({
  collections: { media: true },
  connection: {
    host: process.env.SFTP_HOST!,
    username: process.env.SFTP_USERNAME!,
    password: process.env.SFTP_PASSWORD!,
  },
  baseUrl: process.env.STORAGE_BASE_URL!,
  uploadDir: process.env.STORAGE_UPLOAD_DIR!,
  pool: {
    minConnections: 1, // Only maintain 1 connection
    maxConnections: 3, // Max 3 concurrent uploads
    idleTimeoutMs: 30_000, // Close idle connections after 30 seconds
    connectionTimeoutMs: 30_000,
    healthCheckIntervalMs: 60_000,
  },
});
```

## Error Handling

Handle errors in your application:

```typescript
import {
  SftpUploadError,
  SftpConnectionError,
  getConnectionPool,
} from "@news-spend-media/payload-cpanel-storage";

// In your upload handler or API route
try {
  // Upload operation
  await payload.create({
    collection: "media",
    data: {
      alt: "Example image",
    },
    file: fileData,
  });
} catch (error) {
  if (error instanceof SftpUploadError) {
    console.error("Upload failed:", {
      filename: error.filename,
      code: error.code,
      message: error.message,
    });

    // Retry or handle gracefully
    return { error: "File upload failed, please try again" };
  }

  if (error instanceof SftpConnectionError) {
    console.error("Connection issue:", error.message);

    // Check pool health
    const pool = getConnectionPool();
    if (pool) {
      const stats = pool.getStats();
      console.log("Pool stats:", stats);
    }

    return { error: "Storage connection issue, please try again later" };
  }

  throw error; // Unknown error
}
```

## Monitoring

Monitor the connection pool in production:

```typescript
// pages/api/admin/storage-stats.ts
import { getConnectionPool } from "@news-spend-media/payload-cpanel-storage";
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Add authentication check here

  const pool = getConnectionPool();

  if (!pool) {
    return res.status(503).json({
      error: "Storage pool not initialized",
    });
  }

  const stats = pool.getStats();

  return res.json({
    pool: stats,
    healthy: stats.healthyConnections === stats.totalConnections,
    utilization:
      stats.totalConnections > 0
        ? (stats.activeConnections / stats.totalConnections) * 100
        : 0,
  });
}
```

Health check endpoint:

```typescript
// pages/api/health.ts
import { getConnectionPool } from "@news-spend-media/payload-cpanel-storage";

export default async function handler(req, res) {
  const checks = {
    database: true, // Your DB health check
    storage: false,
  };

  const pool = getConnectionPool();
  if (pool) {
    const stats = pool.getStats();
    checks.storage = stats.healthyConnections > 0;
  }

  const isHealthy = Object.values(checks).every(Boolean);

  return res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "healthy" : "unhealthy",
    checks,
    timestamp: new Date().toISOString(),
  });
}
```

Scheduled task to monitor pool health:

```typescript
// lib/monitoring.ts
import { logger } from "@news-spend-media/logger";
import { getConnectionPool } from "@news-spend-media/payload-cpanel-storage";

export function startStorageMonitoring() {
  setInterval(() => {
    const pool = getConnectionPool();

    if (!pool) {
      return;
    }

    const stats = pool.getStats();

    // Log stats
    logger.info(
      {
        total: stats.totalConnections,
        active: stats.activeConnections,
        idle: stats.idleConnections,
        healthy: stats.healthyConnections,
      },
      "Storage pool stats"
    );

    // Alert if unhealthy
    if (stats.healthyConnections < stats.totalConnections) {
      logger.warn(
        {
          unhealthy: stats.totalConnections - stats.healthyConnections,
          total: stats.totalConnections,
        },
        "Some storage connections are unhealthy"
      );
    }

    // Alert if utilization is high
    const utilization =
      stats.totalConnections > 0
        ? (stats.activeConnections / stats.totalConnections) * 100
        : 0;

    if (utilization > 80) {
      logger.warn(
        { utilization: `${utilization.toFixed(1)}%` },
        "High storage connection utilization"
      );
    }
  }, 60_000); // Every minute
}

// In your app startup
startStorageMonitoring();
```

## Complete Example

Full example with all features:

```typescript
// payload.config.ts
import { readFileSync } from "node:fs";
import { buildConfig } from "payload/config";
import { cpanelSftpStorage } from "@news-spend-media/payload-cpanel-storage";

const isDevelopment = process.env.NODE_ENV !== "production";

export default buildConfig({
  collections: [
    {
      slug: "media",
      upload: {
        staticURL: "/media",
        staticDir: "media", // Used in development
        imageSizes: [
          {
            name: "thumbnail",
            width: 400,
            height: 300,
            position: "centre",
          },
          {
            name: "card",
            width: 768,
            height: 1024,
            position: "centre",
          },
          {
            name: "tablet",
            width: 1024,
            height: undefined,
            position: "centre",
          },
        ],
        mimeTypes: ["image/*"],
      },
      fields: [
        {
          name: "alt",
          type: "text",
          required: true,
        },
      ],
    },
  ],

  plugins: [
    // Only use SFTP in production
    ...(isDevelopment
      ? []
      : [
          cpanelSftpStorage({
            collections: {
              media: {
                disableLocalStorage: true,
              },
            },
            connection: {
              host: process.env.SFTP_HOST!,
              port: Number.parseInt(process.env.SFTP_PORT || "22", 10),
              username: process.env.SFTP_USERNAME!,
              // Use SSH key in production
              privateKey: process.env.SSH_KEY_PATH
                ? readFileSync(process.env.SSH_KEY_PATH)
                : undefined,
              passphrase: process.env.SSH_KEY_PASSPHRASE,
              // Fallback to password
              password: process.env.SFTP_PASSWORD,
              readyTimeout: 30_000,
              retries: 2,
            },
            baseUrl: process.env.STORAGE_BASE_URL!,
            uploadDir: process.env.STORAGE_UPLOAD_DIR!,
            pool: {
              minConnections: 2,
              maxConnections: 15,
              idleTimeoutMs: 120_000,
              connectionTimeoutMs: 45_000,
              healthCheckIntervalMs: 60_000,
              debug: false,
            },
            static: {
              proxyFiles: false,
              cacheControl: "public, max-age=31536000, immutable",
            },
          }),
        ]),
  ],
});
```

**.env.local (Development):**

```env
NODE_ENV=development
```

**.env.production:**

```env
NODE_ENV=production
SFTP_HOST=ftp.example.com
SFTP_PORT=22
SFTP_USERNAME=production_user
SSH_KEY_PATH=/secrets/id_rsa
SSH_KEY_PASSPHRASE=secure_passphrase
STORAGE_BASE_URL=https://cdn.example.com/uploads
STORAGE_UPLOAD_DIR=/home/production/public_html/uploads
```

import type {
  BasePayload,
  CollectionAfterOperationHook,
  CollectionConfig,
  GlobalAfterChangeHook,
  GlobalConfig,
  Plugin,
} from "payload";

// Collections to audit and which operations to track
const AUDIT_TARGETS: Record<string, Array<"create" | "read" | "update" | "delete">> = {
  posts: ["create", "update", "delete"],
  media: ["create", "update", "delete"],
  categories: ["create", "update", "delete"],
  // Audit user account lifecycle, but not reads (too noisy)
  users: ["create", "delete"],
};

// Globals are singletons — only "update" is meaningful
const GLOBAL_AUDIT_TARGETS: string[] = ["news-category"];

// admin collection
const ADMIN_COLLECTION = "admins";

// Fields to strip from logged data (sensitive / noisy)
const OMIT_FIELDS = ["password", "salt", "hash", "tokens", "updatedAt", "__v"];

function sanitize(data: unknown): unknown {
  if (!data || typeof data !== "object") {
    return data;
  }
  const obj = data as Record<string, unknown>;
  return Object.fromEntries(Object.entries(obj).filter(([key]) => !OMIT_FIELDS.includes(key)));
}

const auditLogsCollection: CollectionConfig = {
  slug: "audit-logs",
  labels: { singular: "Audit Log", plural: "Audit Logs" },
  admin: {
    hidden: false,
    useAsTitle: "operation",
    defaultColumns: ["collection", "operation", "documentId", "performedBy", "createdAt"],
    group: "System",
  },
  access: {
    // Only the plugin internals can create/mutate logs
    create: () => false,
    update: () => false,
    delete: () => false,
    // Any authenticated admin can read
    read: ({ req }) => !!req.user,
  },
  fields: [
    {
      name: "collection",
      type: "text",
      required: true,
      index: true,
      admin: {
        description: "The collection slug where the operation occurred",
      },
    },
    {
      name: "documentId",
      type: "text",
      required: true,
      index: true,
    },
    {
      name: "operation",
      type: "select",
      required: true,
      index: true,
      options: ["create", "read", "update", "delete"],
    },
    {
      name: "performedBy",
      type: "relationship",
      index: true,
      relationTo: ADMIN_COLLECTION,
      admin: { description: "The admin who performed this action" },
    },
    {
      name: "originalData",
      type: "json",
      admin: {
        description: "Document state before the change (update only — absent for bulk operations)",
      },
    },
    {
      name: "newData",
      type: "json",
      admin: {
        description: "Document state after the change (create/update only)",
      },
    },
    {
      name: "ip",
      type: "text",
      admin: { description: "IP address of the request" },
    },
  ],
};

type LogEntry = {
  collection: string;
  documentId: string;
  ip?: string;
  newData?: unknown;
  operation: "create" | "read" | "update" | "delete";
  originalData?: unknown;
  performedBy?: string | number | null;
};

async function writeLog(payload: BasePayload, entry: LogEntry) {
  try {
    await payload.db.create({
      collection: "audit-logs",
      data: {
        ...entry,
        originalData: entry.originalData ? sanitize(entry.originalData) : undefined,
        newData: entry.newData ? sanitize(entry.newData) : undefined,
      },
    });
  } catch (err) {
    payload.logger?.error?.(
      {
        err,
        entry: {
          collection: entry.collection,
          documentId: entry.documentId,
          operation: entry.operation,
        },
      },
      "[audit-log] Failed to write log",
    );
  }
}

function extractIp(req: unknown): string | undefined {
  if (!req || typeof req !== "object") {
    return;
  }

  const r = req as Record<string, unknown>;
  const headers = r.headers as Record<string, string | string[] | undefined> | undefined;
  const socket = r.socket as Record<string, unknown> | undefined;

  // 1. Handle x-forwarded-for (can be string or array)
  const forwardedFor = headers?.["x-forwarded-for"];
  if (forwardedFor) {
    const rawIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    if (typeof rawIp === "string") {
      return rawIp.split(",")[0]?.trim();
    }
  }

  // 2. Fallback to x-real-ip
  if (typeof headers?.["x-real-ip"] === "string") {
    return headers["x-real-ip"];
  }

  // 3. Fallback to direct socket address
  if (socket && typeof socket.remoteAddress === "string") {
    return socket.remoteAddress;
  }

  return;
}

export const auditLogPlugin: Plugin = (incomingConfig) => {
  const config = { ...incomingConfig };

  // --- Inject collection hooks ---
  const patchedCollections = (config.collections ?? []).map((collection) => {
    const ops = AUDIT_TARGETS[collection.slug];
    if (!ops) {
      return collection;
    }

    const hook: CollectionAfterOperationHook = async ({ operation, result, args, req }) => {
      if (!ops.includes(operation as LogEntry["operation"])) {
        return result;
      }

      const userId = req?.user?.id ?? null;
      const ip = extractIp(req);

      const resultObj = result as Record<string, unknown> | null;
      const bulkDocs = resultObj?.docs as
        | Array<{ id: unknown; [key: string]: unknown }>
        | undefined;

      if (bulkDocs) {
        for (const doc of bulkDocs) {
          if (doc?.id === undefined) {
            continue;
          }
          await writeLog(req.payload, {
            collection: collection.slug,
            documentId: String(doc.id),
            operation: operation as LogEntry["operation"],
            performedBy: userId,
            // Bulk results don't carry originalDoc per document
            newData: operation === "delete" ? undefined : sanitize(doc),
            ip,
          });
        }
      } else {
        const documentId =
          (result as { id?: unknown } | null)?.id ??
          (args as { id?: unknown } | null)?.id ??
          "unknown";

        await writeLog(req.payload, {
          collection: collection.slug,
          documentId: String(documentId),
          operation: operation as LogEntry["operation"],
          performedBy: userId,
          originalData:
            operation === "update"
              ? (args as { originalDoc?: unknown } | null)?.originalDoc
              : undefined,
          newData: operation === "delete" ? undefined : result,
          ip,
        });
      }

      return result;
    };

    return {
      ...collection,
      hooks: {
        ...collection.hooks,
        afterOperation: [...(collection.hooks?.afterOperation ?? []), hook],
      },
    };
  });

  // --- Inject global hooks ---
  const patchedGlobals = (config.globals ?? []).map((global) => {
    const slug = (global as GlobalConfig).slug;
    if (!GLOBAL_AUDIT_TARGETS.includes(slug)) {
      return global;
    }

    const hook: GlobalAfterChangeHook = async ({ doc, previousDoc, req }) => {
      const userId = req?.user?.id ?? null;
      const ip = extractIp(req);

      await writeLog(req.payload, {
        collection: slug,
        documentId: slug,
        operation: "update",
        performedBy: userId,
        originalData: previousDoc ?? undefined,
        newData: doc,
        ip,
      });

      return doc;
    };

    return {
      ...(global as GlobalConfig),
      hooks: {
        ...(global as GlobalConfig).hooks,
        afterChange: [
          ...((Array.isArray((global as GlobalConfig).hooks?.afterChange)
            ? (global as GlobalConfig).hooks!.afterChange!
            : (global as GlobalConfig).hooks?.afterChange
              ? [(global as GlobalConfig).hooks!.afterChange!]
              : []) as GlobalAfterChangeHook[]),
          hook,
        ],
      },
    } as GlobalConfig;
  });

  return {
    ...config,
    collections: [...patchedCollections, auditLogsCollection],
    globals: patchedGlobals,
  };
};

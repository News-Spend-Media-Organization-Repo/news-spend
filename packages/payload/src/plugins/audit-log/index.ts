import type { BasePayload, CollectionAfterOperationHook, CollectionConfig, Plugin } from "payload";

// Collections to audit and which operations to track
const AUDIT_TARGETS: Record<string, Array<"create" | "read" | "update" | "delete">> = {
  posts: ["create", "update", "delete"],
  media: ["create", "update", "delete"],
  categories: ["create", "update", "delete"],
  // Audit user account lifecycle, but not reads (too noisy)
  users: ["create", "delete"],
};

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
  const socket = r.socket as Record<string, string | undefined> | undefined;

  return (
    (typeof headers?.["x-forwarded-for"] === "string"
      ? headers["x-forwarded-for"].split(",")[0]?.trim()
      : undefined) ??
    (headers?.["x-real-ip"] as string | undefined) ??
    socket?.remoteAddress ??
    undefined
  );
}

export const auditLogPlugin: Plugin = (incomingConfig) => {
  const config = { ...incomingConfig };

  const patchedCollections = (config.collections ?? []).map((collection) => {
    const ops = AUDIT_TARGETS[collection.slug];
    if (!ops) {
      return collection;
    }

    const hook: CollectionAfterOperationHook = async ({ operation, result, args, req }) => {
      if (!ops.includes(operation as "create" | "read" | "update" | "delete")) {
        return result;
      }

      const userId = req?.user?.id ?? null;
      const ip = extractIp(req);

      // Check for bulk operation (delete/update with `where` clause)
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

  return {
    ...config,
    collections: [...patchedCollections, auditLogsCollection],
  };
};

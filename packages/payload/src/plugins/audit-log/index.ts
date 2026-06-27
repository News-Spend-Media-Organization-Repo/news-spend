import type {
  BasePayload,
  CollectionAfterOperationHook,
  CollectionConfig,
  GlobalAfterChangeHook,
  GlobalConfig,
  Plugin,
} from "payload";

import { cleanupAuditLogsTask } from "./cleanup";

// Collections to audit and which operations to track
const AUDIT_TARGETS: Record<string, Array<"create" | "read" | "update" | "delete">> = {
  // Content — editorial accountability
  news: ["create", "update", "delete"],
  comments: ["create", "update", "delete"],
  categories: ["create", "update", "delete"],
  media: ["create", "update", "delete"],
  "partner-content": ["create", "update", "delete"],
  contentReports: ["create", "update", "delete"],

  // Admin — privilege & role tracking
  admins: ["create", "update", "delete"],

  // Compliance — KYC, lottery, financial
  "identity-verification": ["create", "update", "delete"],
  lottery: ["create", "update", "delete"],
  "lottery-winners": ["create", "update", "delete"],
  "ticket-purchase-log": ["create"],

  // User account lifecycle
  users: ["create", "update", "delete"],
};

// Globals are singletons — only "update" is meaningful
const GLOBAL_AUDIT_TARGETS: string[] = ["news-category"];

const ADMIN_COLLECTION = "admins";
const USER_COLLECTION = "users";

// Fields to strip from logged data (sensitive / noisy)
const OMIT_FIELDS = new Set(["password", "salt", "hash", "tokens", "updatedAt", "__v"]);

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function sanitize(data: unknown): Record<string, unknown> | unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).filter(([key]) => !OMIT_FIELDS.has(key)),
  );
}

/**
 * Compute a shallow diff between two objects.
 * Returns only the keys whose values changed, with { from, to } pairs.
 * Keeps logs lean — especially important for large `news` documents.
 */
function diff(
  original: Record<string, unknown>,
  updated: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(original), ...Object.keys(updated)]);

  for (const key of keys) {
    if (OMIT_FIELDS.has(key)) {
      continue;
    }
    // JSON stringify for stable deep equality without a dependency
    if (JSON.stringify(original[key]) !== JSON.stringify(updated[key])) {
      changes[key] = { from: original[key], to: updated[key] };
    }
  }

  return changes;
}

function extractIp(req: unknown): string | undefined {
  if (!req || typeof req !== "object") {
    return;
  }

  const r = req as Record<string, unknown>;
  const headers = r.headers as Record<string, string | string[] | undefined> | undefined;
  const socket = r.socket as Record<string, unknown> | undefined;

  const forwardedFor = headers?.["x-forwarded-for"];
  if (forwardedFor) {
    const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    if (typeof raw === "string") {
      return raw.split(",")[0]?.trim();
    }
  }

  if (typeof headers?.["x-real-ip"] === "string") {
    return headers["x-real-ip"];
  }
  if (socket && typeof socket.remoteAddress === "string") {
    return socket.remoteAddress;
  }
}

/**
 * Determine which collection the actor belongs to.
 * Admins come from the CMS panel; users come from the app via oRPC.
 * Falls back to admins if the collection can't be determined.
 */
function resolveActor(req: unknown): {
  performedBy: string | number | null;
  performedByCollection: typeof ADMIN_COLLECTION | typeof USER_COLLECTION;
} {
  if (!req || typeof req !== "object") {
    return { performedBy: null, performedByCollection: ADMIN_COLLECTION };
  }

  const user = (req as Record<string, unknown>).user as Record<string, unknown> | null | undefined;
  if (!user?.id) {
    return { performedBy: null, performedByCollection: ADMIN_COLLECTION };
  }

  // Payload sets `collection` on the user object when using local API / JWT
  const collection = (user.collection as string) ?? ADMIN_COLLECTION;
  const performedByCollection = collection === USER_COLLECTION ? USER_COLLECTION : ADMIN_COLLECTION;

  return {
    performedBy: user.id as string | number,
    performedByCollection,
  };
}

// -------------------------------------------------------------------
// Audit logs collection
// -------------------------------------------------------------------

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
    create: () => false,
    update: () => false,
    delete: () => false,
    read: ({ req }) => !!req.user,
  },
  timestamps: true,
  fields: [
    {
      name: "collection",
      type: "text",
      required: true,
      index: true,
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
      // Polymorphic — could be a CMS admin or an app user
      name: "performedBy",
      type: "relationship",
      index: true,
      relationTo: [ADMIN_COLLECTION, USER_COLLECTION],
    },
    {
      name: "diff",
      type: "json",
      admin: {
        description: "Changed fields only — { field: { from, to } } (update operations)",
      },
    },
    {
      name: "snapshot",
      type: "json",
      admin: {
        description: "Full document snapshot (create only). Absent on update/delete to save space.",
      },
    },
    {
      name: "ip",
      type: "text",
    },
  ],
};

// -------------------------------------------------------------------
// Log writer
// -------------------------------------------------------------------

type LogEntry = {
  collection: string;
  documentId: string;
  operation: "create" | "read" | "update" | "delete";
  performedBy?: string | number | null;
  performedByCollection?: typeof ADMIN_COLLECTION | typeof USER_COLLECTION;
  diff?: Record<string, { from: unknown; to: unknown }>;
  snapshot?: unknown;
  ip?: string;
};

async function writeLog(payload: BasePayload, entry: LogEntry): Promise<void> {
  try {
    await payload.db.create({
      collection: "audit-logs",
      data: entry,
    });
  } catch (err) {
    payload.logger?.error?.(
      {
        err,
        collection: entry.collection,
        documentId: entry.documentId,
        operation: entry.operation,
      },
      "[audit-log] Failed to write log",
    );
  }
}

// -------------------------------------------------------------------
// Plugin
// -------------------------------------------------------------------

export const auditLogPlugin: Plugin = (incomingConfig) => {
  const config = { ...incomingConfig };

  // Register cleanup task (guard against missing export)
  if (cleanupAuditLogsTask) {
    config.jobs = {
      ...config.jobs,
      tasks: [...(config.jobs?.tasks ?? []), cleanupAuditLogsTask],
    };
  }

  // --- Collection hooks ---
  const patchedCollections = (config.collections ?? []).map((collection) => {
    const ops = AUDIT_TARGETS[collection.slug];
    if (!ops) {
      return collection;
    }

    const hook: CollectionAfterOperationHook = async ({ operation, result, args, req }) => {
      if (!ops.includes(operation as LogEntry["operation"])) {
        return result;
      }

      const { performedBy, performedByCollection } = resolveActor(req);
      const ip = extractIp(req);
      const op = operation as LogEntry["operation"];

      const resultObj = result as Record<string, unknown> | null;
      const bulkDocs = resultObj?.docs as Record<string, unknown>[] | undefined;

      if (bulkDocs) {
        // Bulk operations — no per-doc originalDoc available
        for (const doc of bulkDocs) {
          if (doc?.id === undefined) {
            continue;
          }
          await writeLog(req.payload, {
            collection: collection.slug,
            documentId: String(doc.id),
            operation: op,
            performedBy,
            performedByCollection,
            snapshot: op === "create" ? sanitize(doc) : undefined,
            ip,
          });
        }
      } else {
        const documentId =
          (result as { id?: unknown } | null)?.id ??
          (args as { id?: unknown } | null)?.id ??
          "unknown";

        const originalDoc = (args as { originalDoc?: Record<string, unknown> } | null)?.originalDoc;

        const logEntry: LogEntry = {
          collection: collection.slug,
          documentId: String(documentId),
          operation: op,
          performedBy,
          performedByCollection,
          ip,
        };

        if (op === "create") {
          logEntry.snapshot = sanitize(result as Record<string, unknown>);
        } else if (op === "update" && originalDoc) {
          // Store only the diff — not full before/after — keeps storage lean
          logEntry.diff = diff(
            sanitize(originalDoc) as Record<string, unknown>,
            sanitize(result as Record<string, unknown>) as Record<string, unknown>,
          );
        }
        // delete: documentId is enough, no data stored

        await writeLog(req.payload, logEntry);
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

  // --- Global hooks ---
  const patchedGlobals = (config.globals ?? []).map((global) => {
    const g = global as GlobalConfig;
    if (!GLOBAL_AUDIT_TARGETS.includes(g.slug)) {
      return g;
    }

    const hook: GlobalAfterChangeHook = async ({ doc, previousDoc, req }) => {
      const { performedBy, performedByCollection } = resolveActor(req);
      const ip = extractIp(req);

      const changes =
        previousDoc && doc
          ? diff(
              sanitize(previousDoc) as Record<string, unknown>,
              sanitize(doc) as Record<string, unknown>,
            )
          : undefined;

      await writeLog(req.payload, {
        collection: g.slug,
        documentId: g.slug, // globals are singletons — slug is the stable ID
        operation: "update",
        performedBy,
        performedByCollection,
        diff: changes,
        ip,
      });

      return doc;
    };

    return {
      ...g,
      hooks: {
        ...g.hooks,
        // Payload always provides afterChange as an array — no defensive spread needed
        afterChange: [...(g.hooks?.afterChange ?? []), hook],
      },
    } as GlobalConfig;
  });

  return {
    ...config,
    collections: [...patchedCollections, auditLogsCollection],
    globals: patchedGlobals,
  };
};

import type {
  MigrateDownArgs,
  MigrateUpArgs,
} from "@payloadcms/db-postgres";

import { FAQ_SEED } from "../lib/faqSeed";
import { seedFaqIfEmpty } from "../lib/seedFaq";

/**
 * Data only, no DDL. Writes the owner's FAQ into an empty CMS; a no-op when
 * either collection already has rows.
 */
export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  await seedFaqIfEmpty(payload, req);
}

/**
 * Removes only rows whose text exactly matches a seed entry, questions first
 * (they reference their category), so anything the owner added or reworded
 * survives.
 */
export async function down({ payload, req }: MigrateDownArgs): Promise<void> {
  for (const category of FAQ_SEED) {
    for (const { question } of category.questions) {
      await payload.delete({
        collection: "faqs",
        where: { question: { equals: question } },
        req,
      });
    }
  }

  for (const { name } of FAQ_SEED) {
    await payload.delete({
      collection: "faq-categories",
      where: { name: { equals: name } },
      req,
    });
  }
}

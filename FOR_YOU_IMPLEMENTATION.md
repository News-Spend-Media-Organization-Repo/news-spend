# For You implementation and verification

This branch adds the document's For You app and CMS workflows to the existing application. It has not been deployed to production and is not a certification of error-free production operation.

## Added

- Home, Live, For You, Discover, Shop and Me navigation, preserving existing Shop and app functionality. Live supports an administrator-configured HTTPS stream through expo-video and truthful offline/unavailable/error states.
- Multiple interest selection across all 13 listed categories; optional category-specific refinement and consent.
- A personalized/discovery feed, category filtering, keyword search, explanations, expiry exclusion and canonical-URL deduplication.
- Detail pages, saving/removal, sharing, official-source handoff, reporting and recommendation feedback.
- Opportunity DNA, consent-aware Insights, emerging-interest editing, interest editing, personalization opt-out and notification controls. Foreground reading generates a learning signal only after 15 seconds and with consent.
- Saved-opportunity deadline reminders and the application-status/dashboard features requested in the later epics.
- Source-grounded detail questions and goal-based guidance with links to current published opportunities. These are rule-based, not an LLM, an immigration adviser or an eligibility evaluator.
- Authenticated oRPC endpoints, seven Payload collections, a settings global, staff-only monitoring at `/admin/for-you`, content/source management and owner-scoped private records.
- Bounded JSON Feed, RSS, Atom and structured-HTML ingestion, explicit metadata/deadline extraction, multi-category and refinement classification, linked-feed discovery into a staff approval queue, source quality/ownership review fields, expiry processing, reminder jobs and configurable daily discovery digests.
- Cross-source duplicate consolidation for matching normalized titles, locations and deadlines, preferring trusted/more complete versions. This is conservative structured matching, not a semantic embedding model.
- Configurable recommendation/discovery proportions, featured-content boost, candidate window, source discovery threshold, digest interval and Live settings.
- Opt-in, production-blocked fictional demo data for the documented five-item sample journey; it is never used as a normal feed fallback.
- Notification preference checks at delivery time for For You campaigns.
- Database migration, generated collection types/schema, and automated tests.

## Requirements decisions

The document both forbids and requests application tracking and personalized search. The user subsequently requested all features, including the later epics, so this draft includes tracking and keyword search. Existing Shop functionality and navigation are retained.

## Configuration and release gates

- An authorized Live stream must be supplied by staff before a real broadcast is available. No URL or broadcast has been invented.
- Staff must approve production sources and review ownership/trust labels. Discovery is bounded and does not execute arbitrary web-page scripts or crawl unrelated domains.
- Ranking considers the latest 1,000 eligible candidates by default, configurable up to 5,000; this is not a production-scale vector index or trained machine-learning recommender.
- Guidance is source-grounded and rule-based. No LLM-backed conversation or claim of eligibility verification is made.
- Full repository TypeScript checks report existing errors in unrelated native components, backend tests and CMS seed scripts. Passing runtime tests must not be described as a clean full-repository typecheck.
- Physical-device/emulator playback, accessibility, real push delivery and deployed-worker ingestion still require release validation. No paid provider transactions were executed.
- Railway API authentication and public health checks succeeded, and sampled API/CMS production logs showed no flagged errors. This is not proof that all production features work.
- Railway currently deploys `dhatGuy/news-spend` on `main`; this PR targets `News-Spend-Media-Organization-Repo/news-spend`. Production did not expose the For You endpoint during inspection. No Railway source setting, production database migration or release was changed.

## Verified in this environment

- API, discovery-source, ranking, lifecycle and portability regression run: **748 passed, 17 skipped, 0 failed** across 60 files.
- Complete native Jest run: **389 passed** across **53 suites**, including Live, guidance, Insights and navigation, using existing mocks and test-only Detour placeholders.
- Isolated PostgreSQL 16: existing-code baseline schema → feature migration up → insert/read → down → up; existing tables remained available.
- Actual Payload/PostgreSQL creation, source approval, multi-category filtering, duplicate-identity hook and CMS Live configuration round-trip passed. The database check caught and fixed an unsupported JSON-text filter that fake fixtures would not detect.
- CMS optimized build passed against the isolated local database using test-only configuration. The repository already disables TypeScript build blocking; this build result does not override the full-typecheck failures above.
- New/changed feature source files passed Biome error checks; informational complexity suggestions remain.

The skipped API tests were not counted as verified. Native tests do not substitute for real-device testing.

## Database and rollout

- Migration: `packages/payload/src/migrations/20261115_122930_for_you_discovery.ts`.
- Apply on a backed-up staging database first; it has **not** been applied to production.
- A stale pre-existing migration snapshot included unrelated historical schema changes. The feature migration was scoped against the current pre-feature source schema to avoid recreating existing tables.
- Rollback removes the new feature's records and queued feature jobs. Back up before using it.
- Backend/CMS schema changes must be deployed before enabling the new mobile experience.
- Configure and approve sources in Payload's **For You** section. Empty production feeds show a truthful empty state rather than fictional opportunities.

## Feed contract

Sources support JSON Feed with an `items` array, RSS, Atom, or HTML pages containing supported JSON-LD opportunities and declared alternate feeds. Each imported item requires a title, a safe URL and summary/content text. Published dates and tags are supported. Optional JSON Feed `_newsspend` metadata supplies `kind`, `deadline`, `location`, `provider` and `details`. Only explicitly stated absolute deadlines are extracted. Source labels remain staff-controlled. Item URLs must use the same hostname as the approved source.

An optional top-level `_newsspend_sources` array containing `feed_url` entries allows bounded discovery of linked feeds. Valid candidates remain pending until staff approve them.

Requests enforce HTTPS, public IPv4 DNS pinning, no redirects, a 15-second deadline and a 2 MB response cap. XML document types/entities are rejected; HTML scripts are not executed. New candidates never self-assign official or verified status.

## Fictional demonstration

`seedOpportunityDemo(payload, dedicatedTestUserId)` in `packages/payload/src/opportunities/demo.ts` seeds the five sample items and the documented Jobs/Technology/Immigration profile for an existing dedicated non-production account. It is idempotent and refuses production execution. Every item is explicitly marked as fictional; no application, email, purchase or push delivery is performed.

## Dependency setup

The original locked Next.js, Sentry and DOMPurify versions were blocked by the package firewall. This branch updates Next.js to 16.4.6, the main Sentry packages to 10.78.0 and DOMPurify to 3.4.18 so dependencies can install. The lockfile was regenerated with the repository-declared Bun 1.4.3. These changes also require normal application build/regression validation.

External GitHub/Docker builds prepare public npm tarball addresses with `tooling/portable-lockfile.mjs` before dependency installation. This preserves package versions and integrity hashes. Inside Replit the script retains the package firewall addresses.

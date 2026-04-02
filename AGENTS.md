# AGENTS.md — Coding Agent Guide for turbo-payload

## Project Overview

Monorepo: **Next.js + Payload CMS** (web), **Bun server** (API), **React Native/Expo** (mobile).

- **Package manager**: `bun` (v1.3.9) — use `bun` for all commands, NOT npm/yarn/pnpm
- **Task runner**: Turborepo (`turbo.json` at root)
- **Workspace roots**: `apps/*`, `packages/*`, `tooling/*`

## Build / Lint / Test Commands

| Task                   | Command                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| Lint (check)           | `bun x ultracite check` or `bun run lint`                            |
| Lint (auto-fix)        | `bun x ultracite fix` or `bun run lint:fix`                          |
| Format (check)         | `bun run format`                                                     |
| Format (fix)           | `bun run format:fix`                                                 |
| Typecheck (all)        | `bun run typecheck`                                                  |
| Typecheck (single app) | `bun --filter @news-spend-media/cms typecheck`                       |
| Build (CMS)            | `bun run build` (root) or `bun --filter @news-spend-media/cms build` |
| Dev (CMS)              | `bun run dev` or `bun --filter @news-spend-media/cms dev`            |
| Dev (Server)           | `bun --filter @news-spend-media/server dev`                          |
| Test (single package)  | `cd packages/api && bun x vitest run`                                |
| Test (watch mode)      | `cd packages/api && bun x vitest`                                    |
| Test (single file)     | `cd packages/api && bun x vitest run path/to/file.test.ts`           |
| Generate Payload types | `cd apps/cms && bun run generate:types`                              |
| DB push                | `cd packages/db && bun run db:push`                                  |
| DB migrate             | `cd packages/db && bun run db:migrate`                               |
| DB studio              | `cd packages/db && bun run db:studio`                                |

Run `bun x ultracite fix` before committing — pre-commit hooks (lefthook) enforce this.

## Linting & Formatting (Ultracite)

This project uses **Ultracite** (oxlint + oxfmt) — NOT ESLint/Prettier.

Config files: `.oxlintrc.json`, `.oxfmtrc.jsonc` at repo root.

Key rules:

- `reactHooks: "error"` — enforces Rules of Hooks
- Most import/export rules disabled (monorepo flexibility)
- React version: 19

Formatting:

- Double quotes (`singleQuote: false`)
- Semicolons: yes
- Trailing commas: `es5`
- Tab width: 2 spaces, spaces (no tabs)
- Print width: 80
- `endOfLine: "lf"`
- Arrow parens: always
- Bracket spacing: yes
- Sorted imports (experimental, ascending)

## TypeScript Config

All packages extend `@news-spend-media/config/tsconfig.base.json`:

- `strict: true`, `strictNullChecks: true`
- `target: "ESNext"`, `module: "ESNext"`, `moduleResolution: "bundler"`
- `verbatimModuleSyntax: true` — use `import type` for type-only imports
- `noUncheckedIndexedAccess: true` — array/object access returns `T | undefined`
- `noFallthroughCasesInSwitch: true`
- `isolatedModules: true`

CMS tsconfig uses `~/*` path alias → `./src/*`.

## Code Style Guidelines

### Imports

- Use `import type` for type-only imports (enforced by `verbatimModuleSyntax`)
- Prefer named exports; avoid default exports where possible
- Use specific imports, not namespace imports (`import * as X`)
- Workspace packages use `workspace:*` in package.json

### Types & Safety

- Prefer `unknown` over `any` when type is genuinely unknown
- Use `as const` for immutable literal values
- Leverage TypeScript narrowing over type assertions
- Never use `as any`, `@ts-ignore`, `@ts-expect-error` to suppress errors

### JavaScript/TypeScript

- `const` by default; `let` only when reassignment needed; never `var`
- Arrow functions for callbacks and short functions
- `for...of` loops over `.forEach()` and indexed `for`
- Optional chaining (`?.`) and nullish coalescing (`??`)
- Template literals over string concatenation
- Destructuring for object/array assignments

### Async

- Always `await` promises in async functions
- `async/await` over `.then()` chains
- Use try-catch for error handling in async code
- Never use async functions as Promise executors

### React

- Function components, not class components
- Hooks at top level only, never conditional
- Complete dependency arrays for hooks
- `key` prop on iterables (prefer unique IDs over array indices)
- Semantic HTML + ARIA for accessibility
- React 19: use `ref` as prop (not `React.forwardRef`)

### Error Handling

- Remove `console.log`/`debugger`/`alert` from production code
- Throw `Error` objects with descriptive messages
- Early returns over nested conditionals for error cases
- Don't catch errors just to rethrow them

### API Layer (orpc)

- Procedures: `publicProcedure`, `protectedProcedure`, `protectedNoGuestProcedure`, `rateLimitedPublicProcedure`
- Validation: Zod schemas
- Context: `packages/api/src/context.ts`

### Payload CMS

- Collections/fields/hooks in `packages/payload/src/`
- Components in `packages/payload/src/components/`
- Use `cn()` utility (clsx + tailwind-merge) for class merging

## Project Structure

```
apps/
  cms/          # Next.js + Payload admin + frontend
  server/       # Bun HTTP server (orpc API, auth, health)
  native/       # React Native / Expo mobile app
packages/
  api/          # orpc router, procedures, middlewares (vitest tests here)
  auth/         # Better Auth config
  config/       # Shared tsconfig bases
  db/           # Drizzle ORM schema + migrations
  env/          # Environment variable validation (@t3-oss/env-nextjs)
  logger/       # Logging utilities
  mail/         # Email sending
  payload/      # Payload CMS config, collections, fields, blocks, hooks
  payload-cpanel-storage/  # Custom Payload storage adapter
  transactional/  # Email templates (react-email)
  utils/        # Shared utilities
tooling/
  tailwind/     # Shared Tailwind config
```

## Key Libraries & Frameworks

| Library             | Purpose                         |
| ------------------- | ------------------------------- |
| Payload CMS v3      | Headless CMS, admin panel       |
| Next.js 15          | CMS frontend (React 19)         |
| orpc                | Type-safe API layer (tRPC-like) |
| Zod v4              | Schema validation               |
| Drizzle ORM         | Database (PostgreSQL)           |
| Better Auth         | Authentication                  |
| Tailwind CSS        | Styling                         |
| React Native / Expo | Mobile app                      |
| Vitest              | Unit testing                    |
| Turborepo           | Monorepo task orchestration     |
| Sentry              | Error tracking                  |

## Git Hooks (Lefthook)

Pre-commit: runs `oxlint` and `oxfmt --write` on staged `.js/.jsx/.ts/.tsx` files, auto-stages fixes.

## What Ultracite Won't Catch

1. Business logic correctness
2. Meaningful naming and self-documentation
3. Architecture decisions (component structure, data flow)
4. Edge cases and boundary conditions
5. UX/accessibility beyond linting rules
6. Performance implications of algorithmic choices

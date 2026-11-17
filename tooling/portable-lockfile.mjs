import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Replit's package mirror is only reachable inside Replit. Keep it there, but
 * translate generated public npm tarball addresses before external CI/builds.
 * Versions, dependency edges and integrity hashes are deliberately untouched.
 */
export function portableLockfile(contents) {
  return contents.replaceAll(
    /https?:\/\/package-firewall\.replit\.internal\/npm\//g,
    "https://registry.npmjs.org/"
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  if (process.env.REPL_ID || process.env.REPLIT_DEV_DOMAIN) {
    process.stdout.write(
      "Keeping the Replit package firewall registry in Replit.\n"
    );
  } else {
    const filename = resolve("bun.lock");
    const original = await readFile(filename, "utf8");
    const portable = portableLockfile(original);
    if (portable !== original) {
      await writeFile(filename, portable);
    }
    process.stdout.write(
      "Public npm lockfile addresses prepared for the external build.\n"
    );
  }
}

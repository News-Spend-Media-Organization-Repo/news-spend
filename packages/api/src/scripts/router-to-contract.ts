// READ BEFORE RUNNING. Overwriting src/contract.json with this script's output is
// not safe, even though it runs. The native app uses that file for exactly one
// call (the witness-report upload, `openapi.report.create`), and a current export
// writes each route in a different shape (`meta["~openapi"]`, not `route`) from
// the committed one that call works with. See apps/native/src/lib/orpc.ts. The
// committed contract is deliberately left behind the router; if you must
// regenerate, diff `report.create` first and test the upload on a preview build.
import "dotenv/config";
import { writeFileSync } from "node:fs";

import { minifyContractRouter } from "@orpc/contract";
import { unlazyRouter } from "@orpc/server";

import router from "../router";

const resolved = await unlazyRouter(router);

const minified = minifyContractRouter(resolved);

writeFileSync("./src/contract.json", JSON.stringify(minified, null, 2));

console.log("✅ Contract exported to ./src/contract.json");

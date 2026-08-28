import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../dist/server/wrangler.json", import.meta.url);
const config = JSON.parse(await readFile(path, "utf8"));
delete config.compatibility_flags;
await writeFile(path, `${JSON.stringify(config)}\n`, "utf8");
console.log("Prepared Sites artifact metadata.");

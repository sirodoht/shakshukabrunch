import { join } from "node:path";
import { BrunchStore } from "../src/data";

const args = Bun.argv.slice(2);
const activate = args.includes("--activate");
const positional = args.filter((arg) => arg !== "--activate");
if (positional.length !== 1 || positional[0].startsWith("-")) {
  console.error("Usage: bun run brunch:create <brunch-id> [--activate]");
  process.exit(1);
}
const store = new BrunchStore(join(import.meta.dir, "..", "data"));
await store.initialize();
await store.create(positional[0], activate);
console.log(`Created ${positional[0]}${activate ? " and selected it for the main page" : ""}.`);

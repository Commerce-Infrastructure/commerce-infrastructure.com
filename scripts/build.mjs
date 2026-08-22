import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const output = resolve(root, "dist");
const publicFiles = ["404.html", "CNAME", "index.html", "index.md", "llms.txt", "robots.txt", "sitemap.xml"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(publicFiles.map((file) => cp(resolve(root, file), resolve(output, file))));

console.log(`Built ${publicFiles.length} public files in ${output}`);

// Builds the app for Vercel and proxies same-origin /api/* to the Voice Verse API,
// so cookies and fetches work exactly as they do in development.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const API = (process.env.VV_API ?? "https://voiceverse-rose.vercel.app").replace(/\/$/, "");

const build = spawnSync("npx", ["vite", "build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NITRO_PRESET: "vercel" },
});
if (build.status !== 0) process.exit(build.status ?? 1);

const file = ".vercel/output/config.json";
const config = JSON.parse(readFileSync(file, "utf8"));
config.routes = [{ src: "/api/(.*)", dest: `${API}/api/$1` }, ...config.routes];
writeFileSync(file, JSON.stringify(config, null, 2));
console.log(`[vv] proxying /api/* -> ${API}`);

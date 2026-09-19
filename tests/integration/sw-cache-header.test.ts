// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildApp } from "../../server/app.js";
import { makeTestDirectory, removeTestDirectory } from "../helpers.js";

let directory = "";
afterEach(() => { if (directory) removeTestDirectory(directory); directory = ""; });

describe("static service worker cache headers", () => {
  it("serves sw.js and manifest with no-cache so browser always revalidates the SW", async () => {
    directory = makeTestDirectory("sw-cache");
    const app = await buildApp({ dataDir: directory, autoBackup: false, serveStatic: true });
    try {
      const sw = await app.inject({ method: "GET", url: "/sw.js" });
      expect(sw.statusCode).toBe(200);
      expect(sw.headers["cache-control"]).toContain("no-cache");

      const manifest = await app.inject({ method: "GET", url: "/manifest.webmanifest" });
      expect(manifest.statusCode).toBe(200);
      expect(manifest.headers["cache-control"]).toContain("no-cache");

      const html = await app.inject({ method: "GET", url: "/" });
      expect(html.statusCode).toBe(200);
      expect(html.headers["cache-control"]).toContain("no-cache");
    } finally {
      await app.close();
    }
  });

  it("still long-caches hashed static assets", async () => {
    directory = makeTestDirectory("sw-cache-assets");
    const app = await buildApp({ dataDir: directory, autoBackup: false, serveStatic: true });
    try {
      // 动态发现一个真实存在的 hashed 资源，避免硬编码 hash 在重新构建后 404
      const assetsDir = path.resolve("dist/assets");
      const hashed = fs.existsSync(assetsDir)
        ? fs.readdirSync(assetsDir).find((f) => /^index-.*\.js$/.test(f))
        : undefined;
      expect(hashed, "需要先构建前端（dist/assets 下存在 index-*.js）").toBeTruthy();
      const js = await app.inject({ method: "GET", url: `/assets/${hashed}` });
      expect(js.statusCode).toBe(200);
      expect(js.headers["cache-control"]).toContain("max-age=31536000");
    } finally {
      await app.close();
    }
  });
});

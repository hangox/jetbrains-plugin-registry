import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestApp } from "../helpers/test-app";
import { fullPluginXml, createJarPlugin, bufferToFile } from "../helpers/fixtures";
import type { Hono } from "hono";
import type { PluginService } from "../../src/service/plugin-service";

describe("Repository Routes", () => {
  let app: Hono;
  let service: PluginService;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ app, service, cleanup } = await createTestApp());
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("GET /updatePlugins.xml", () => {
    it("returns empty XML when no plugins", async () => {
      const res = await app.request("/updatePlugins.xml");

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("application/xml");

      const body = await res.text();
      expect(body).toContain("<plugins>");
      expect(body).toContain("</plugins>");
      expect(body).not.toContain("<plugin ");
    });

    it("returns plugins after upload", async () => {
      await service.upload(bufferToFile(createJarPlugin(fullPluginXml())), false);

      const res = await app.request("/updatePlugins.xml");
      const body = await res.text();

      expect(body).toContain('id="com.example.test"');
      expect(body).toContain('version="1.0.0"');
    });

    it("strips product prefix from build parameter", async () => {
      await service.upload(
        bufferToFile(createJarPlugin(fullPluginXml({
          sinceBuild: "222",
          untilBuild: "241.*",
        }))),
        false,
      );

      const res = await app.request("/updatePlugins.xml?build=IC-241.15989.150");
      const body = await res.text();

      expect(body).toContain('id="com.example.test"');
    });

    it("filters out incompatible plugins", async () => {
      await service.upload(
        bufferToFile(createJarPlugin(fullPluginXml({
          sinceBuild: "222",
          untilBuild: "232.*",
        }))),
        false,
      );

      const res = await app.request("/updatePlugins.xml?build=IC-241.15989");
      const body = await res.text();

      expect(body).not.toContain("com.example.test");
    });
  });

  describe("GET /plugins/:pluginId/:version", () => {
    it("downloads plugin file", async () => {
      await service.upload(bufferToFile(createJarPlugin(fullPluginXml())), false);

      const res = await app.request("/plugins/com.example.test/1.0.0");

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/zip");
      expect(res.headers.get("Content-Disposition")).toContain("com.example.test-1.0.0.zip");
    });

    it("returns 404 for non-existent plugin", async () => {
      const res = await app.request("/plugins/non.existent/1.0.0");

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Plugin version not found");
    });
  });
});

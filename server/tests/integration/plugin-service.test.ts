import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { PluginService } from "../../src/service/plugin-service";
import { PluginParser } from "../../src/service/plugin-parser";
import { createTestRepository } from "../helpers/test-repository";
import {
  minimalPluginXml,
  fullPluginXml,
  createJarPlugin,
  createZipPlugin,
  createInvalidZip,
  createTempDataDir,
  bufferToFile,
} from "../helpers/fixtures";

describe("PluginService", () => {
  let service: PluginService;
  let dataDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ path: dataDir, cleanup } = await createTempDataDir());
    const { mkdir } = await import("fs/promises");
    await mkdir(`${dataDir}/plugins`, { recursive: true });
    await mkdir(`${dataDir}/tmp`, { recursive: true });

    const repo = createTestRepository();
    const parser = new PluginParser();
    service = new PluginService(repo, parser, dataDir, "http://localhost:3000");
  });

  afterEach(async () => {
    await cleanup();
  });

  // -- 上传 --

  describe("upload", () => {
    it("uploads JAR plugin and stores file", async () => {
      const buffer = createJarPlugin(fullPluginXml());
      const file = bufferToFile(buffer);

      const result = await service.upload(file, false);

      expect(result.pluginId).toBe("com.example.test");
      expect(result.version).toBe("1.0.0");
      expect(result.sinceBuild).toBe("222");
      expect(result.fileSha256).toBeTruthy();

      const stored = Bun.file(`${dataDir}/plugins/com.example.test/1.0.0.zip`);
      expect(await stored.exists()).toBe(true);
    });

    it("uploads ZIP plugin (Format B)", async () => {
      const buffer = createZipPlugin(fullPluginXml({
        id: "com.example.zip",
        name: "ZIP Plugin",
      }));
      const file = bufferToFile(buffer);

      const result = await service.upload(file, false);

      expect(result.pluginId).toBe("com.example.zip");
    });

    it("rejects duplicate version without force", async () => {
      const buffer = createJarPlugin(fullPluginXml());
      const file = bufferToFile(buffer);

      await service.upload(file, false);

      const file2 = bufferToFile(buffer);
      expect(service.upload(file2, false)).rejects.toThrow("already exists");
    });

    it("allows duplicate version with force=true", async () => {
      const buffer = createJarPlugin(fullPluginXml());

      await service.upload(bufferToFile(buffer), false);
      const result = await service.upload(bufferToFile(buffer), true);

      expect(result.pluginId).toBe("com.example.test");
    });

    it("rejects invalid ZIP", async () => {
      const file = bufferToFile(Buffer.from("not a zip"));

      expect(service.upload(file, false)).rejects.toThrow("Not a valid ZIP/JAR file");
    });

    it("cleans up temp file on failure", async () => {
      const file = bufferToFile(createInvalidZip());

      try {
        await service.upload(file, false);
      } catch {
        // expected
      }

      const { readdir } = await import("fs/promises");
      const tmpFiles = await readdir(`${dataDir}/tmp`);
      expect(tmpFiles).toHaveLength(0);
    });
  });

  // -- 查询 --

  describe("getPlugin", () => {
    it("returns plugin with versions after upload", async () => {
      await service.upload(bufferToFile(createJarPlugin(fullPluginXml())), false);

      const plugin = service.getPlugin("com.example.test");

      expect(plugin).not.toBeNull();
      expect(plugin!.info.name).toBe("Test Plugin");
      expect(plugin!.versions).toHaveLength(1);
    });
  });

  describe("listPlugins", () => {
    it("returns paginated results", async () => {
      for (let i = 1; i <= 3; i++) {
        const xml = fullPluginXml({
          id: `com.example.plugin${i}`,
          name: `Plugin ${i}`,
        });
        await service.upload(bufferToFile(createJarPlugin(xml)), false);
      }

      const result = service.listPlugins(null, 1, 2);

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
    });
  });

  // -- 删除 --

  describe("deleteVersion", () => {
    it("deletes version and removes file", async () => {
      await service.upload(bufferToFile(createJarPlugin(fullPluginXml())), false);

      const remaining = await service.deleteVersion("com.example.test", "1.0.0");

      expect(remaining).toBe(0);

      const file = Bun.file(`${dataDir}/plugins/com.example.test/1.0.0.zip`);
      expect(await file.exists()).toBe(false);
    });
  });

  describe("deletePlugin", () => {
    it("deletes all versions and files", async () => {
      await service.upload(bufferToFile(createJarPlugin(fullPluginXml())), false);
      await service.upload(
        bufferToFile(createJarPlugin(fullPluginXml({ version: "1.1.0" }))),
        false,
      );

      await service.deletePlugin("com.example.test");

      expect(service.getPlugin("com.example.test")).toBeNull();

      const { readdir } = await import("fs/promises");
      try {
        await readdir(`${dataDir}/plugins/com.example.test`);
        expect(true).toBe(false); // should not reach
      } catch {
        // directory deleted, as expected
      }
    });
  });

  // -- XML 生成 --

  describe("getUpdatePluginsXml", () => {
    it("generates XML with uploaded plugins", async () => {
      await service.upload(bufferToFile(createJarPlugin(fullPluginXml())), false);

      const xml = service.getUpdatePluginsXml(null);

      expect(xml).toContain('id="com.example.test"');
      expect(xml).toContain('version="1.0.0"');
      expect(xml).toContain("http://localhost:3000/plugins/com.example.test/1.0.0");
    });

    it("filters by build number", async () => {
      await service.upload(
        bufferToFile(createJarPlugin(fullPluginXml({
          sinceBuild: "222",
          untilBuild: "232.*",
        }))),
        false,
      );

      const xml = service.getUpdatePluginsXml("241.15989");

      expect(xml).toContain("<plugins>");
      expect(xml).not.toContain("com.example.test");
    });
  });

  // -- 运维方法 --

  describe("getUptime / getStartTime", () => {
    it("returns non-empty uptime string", () => {
      expect(service.getUptime()).toMatch(/\d+d \d+h \d+m/);
    });

    it("returns ISO start time", () => {
      expect(service.getStartTime()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});

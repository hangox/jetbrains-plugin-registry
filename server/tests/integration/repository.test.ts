import { describe, it, expect, beforeEach } from "bun:test";
import { createTestRepository } from "../helpers/test-repository";
import type { SqlitePluginRepository } from "../../src/repository/sqlite";
import type { PluginMetadata, FileInfo } from "../../src/repository/types";

describe("SqlitePluginRepository", () => {
  let repo: SqlitePluginRepository;

  const metadata: PluginMetadata = {
    id: "com.example.test",
    name: "Test Plugin",
    version: "1.0.0",
    sinceBuild: "222",
    untilBuild: "241.*",
    description: "<p>A test plugin</p>",
    vendor: { name: "Test Inc", url: "https://test.com", email: "dev@test.com" },
    changeNotes: "<ul><li>Initial</li></ul>",
    depends: ["com.intellij.modules.platform"],
  };

  const fileInfo: FileInfo = {
    fileName: "com.example.test-1.0.0.zip",
    fileSize: 12345,
    fileSha256: "abc123",
  };

  beforeEach(() => {
    repo = createTestRepository();
  });

  // -- 保存与查询 --

  describe("savePluginVersion & findVersion", () => {
    it("saves and retrieves a plugin version", () => {
      repo.savePluginVersion(metadata, fileInfo);

      const result = repo.findVersion("com.example.test", "1.0.0");

      expect(result).not.toBeNull();
      expect(result!.pluginId).toBe("com.example.test");
      expect(result!.version).toBe("1.0.0");
      expect(result!.sinceBuild).toBe("222");
      expect(result!.untilBuild).toBe("241.*");
      expect(result!.fileSize).toBe(12345);
      expect(result!.fileSha256).toBe("abc123");
    });

    it("returns null for non-existent version", () => {
      expect(repo.findVersion("com.example.test", "9.9.9")).toBeNull();
    });

    it("upserts on conflict (force upload)", () => {
      repo.savePluginVersion(metadata, fileInfo);
      repo.savePluginVersion(metadata, {
        ...fileInfo,
        fileSize: 99999,
        fileSha256: "updated",
      });

      const result = repo.findVersion("com.example.test", "1.0.0");
      expect(result!.fileSize).toBe(99999);
      expect(result!.fileSha256).toBe("updated");
    });
  });

  // -- 插件查询 --

  describe("findPlugin", () => {
    it("returns plugin with all versions (sorted by version desc)", () => {
      repo.savePluginVersion(metadata, fileInfo);
      repo.savePluginVersion(
        { ...metadata, version: "1.1.0" },
        { ...fileInfo, fileName: "test-1.1.0.zip" },
      );
      repo.savePluginVersion(
        { ...metadata, version: "0.9.0" },
        { ...fileInfo, fileName: "test-0.9.0.zip" },
      );

      const result = repo.findPlugin("com.example.test");

      expect(result).not.toBeNull();
      expect(result!.info.id).toBe("com.example.test");
      expect(result!.versions).toHaveLength(3);
      expect(result!.versions[0].version).toBe("1.1.0");
      expect(result!.versions[1].version).toBe("1.0.0");
      expect(result!.versions[2].version).toBe("0.9.0");
    });

    it("returns null for non-existent plugin", () => {
      expect(repo.findPlugin("non.existent")).toBeNull();
    });
  });

  // -- 列表查询 --

  describe("listPlugins", () => {
    it("lists all plugins with pagination", () => {
      for (let i = 1; i <= 3; i++) {
        repo.savePluginVersion(
          { ...metadata, id: `plugin-${i}`, name: `Plugin ${i}` },
          fileInfo,
        );
      }

      const page1 = repo.listPlugins(null, 1, 2);
      expect(page1.total).toBe(3);
      expect(page1.items).toHaveLength(2);

      const page2 = repo.listPlugins(null, 2, 2);
      expect(page2.items).toHaveLength(1);
    });

    it("filters by query (name or id)", () => {
      repo.savePluginVersion(
        { ...metadata, id: "com.acme.foo", name: "Foo Plugin" },
        fileInfo,
      );
      repo.savePluginVersion(
        { ...metadata, id: "com.acme.bar", name: "Bar Plugin" },
        fileInfo,
      );

      const result = repo.listPlugins("foo", 1, 20);
      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe("com.acme.foo");
    });
  });

  // -- 删除 --

  describe("deleteVersion", () => {
    it("deletes a single version and returns remaining count", () => {
      repo.savePluginVersion(metadata, fileInfo);
      repo.savePluginVersion(
        { ...metadata, version: "1.1.0" },
        { ...fileInfo, fileName: "test-1.1.0.zip" },
      );

      const remaining = repo.deleteVersion("com.example.test", "1.0.0");

      expect(remaining).toBe(1);
      expect(repo.findVersion("com.example.test", "1.0.0")).toBeNull();
      expect(repo.findVersion("com.example.test", "1.1.0")).not.toBeNull();
    });

    it("deletes plugin record when last version is removed", () => {
      repo.savePluginVersion(metadata, fileInfo);

      const remaining = repo.deleteVersion("com.example.test", "1.0.0");

      expect(remaining).toBe(0);
      expect(repo.findPlugin("com.example.test")).toBeNull();
    });
  });

  describe("deletePlugin", () => {
    it("deletes all versions and plugin record", () => {
      repo.savePluginVersion(metadata, fileInfo);
      repo.savePluginVersion(
        { ...metadata, version: "1.1.0" },
        { ...fileInfo, fileName: "test-1.1.0.zip" },
      );

      const deletedCount = repo.deletePlugin("com.example.test");

      expect(deletedCount).toBe(2);
      expect(repo.findPlugin("com.example.test")).toBeNull();
    });
  });

  // -- 兼容性查询 --

  describe("findCompatiblePlugins", () => {
    it("returns latest compatible version per plugin", () => {
      repo.savePluginVersion(
        { ...metadata, version: "1.0.0", sinceBuild: "222", untilBuild: "232.*" },
        fileInfo,
      );
      repo.savePluginVersion(
        { ...metadata, version: "2.0.0", sinceBuild: "231", untilBuild: "241.*" },
        { ...fileInfo, fileName: "test-2.0.0.zip" },
      );

      const result = repo.findCompatiblePlugins("241.15989");

      expect(result).toHaveLength(1);
      expect(result[0].version).toBe("2.0.0");
    });

    it("returns all latest versions when buildNumber is null", () => {
      repo.savePluginVersion(metadata, fileInfo);
      repo.savePluginVersion(
        { ...metadata, id: "plugin-b", name: "Plugin B" },
        fileInfo,
      );

      const result = repo.findCompatiblePlugins(null);

      expect(result).toHaveLength(2);
    });

    it("returns empty when no plugins are compatible", () => {
      repo.savePluginVersion(
        { ...metadata, sinceBuild: "300", untilBuild: "300.*" },
        fileInfo,
      );

      const result = repo.findCompatiblePlugins("222");
      expect(result).toHaveLength(0);
    });
  });

  // -- 统计 --

  describe("getStats", () => {
    it("returns correct counts", () => {
      repo.savePluginVersion(metadata, fileInfo);
      repo.savePluginVersion(
        { ...metadata, version: "1.1.0" },
        { ...fileInfo, fileName: "test-1.1.0.zip" },
      );
      repo.savePluginVersion(
        { ...metadata, id: "plugin-b", name: "B" },
        fileInfo,
      );

      const stats = repo.getStats();

      expect(stats.pluginCount).toBe(2);
      expect(stats.versionCount).toBe(3);
      expect(stats.totalStorageBytes).toBe(12345 * 3);
    });
  });
});

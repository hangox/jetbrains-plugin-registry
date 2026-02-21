import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, and, like, or, sql, desc } from "drizzle-orm";
import { plugins, pluginVersions } from "./schema";
import type {
  PluginRepository,
  PluginMetadata,
  FileInfo,
  PluginVersion,
  PluginWithVersions,
  PluginSummary,
  PagedResult,
  CompatiblePlugin,
  RegistryStats,
  RecentUpload,
} from "./types";
import { isCompatible, compareVersions } from "../lib/build-number";

export class SqlitePluginRepository implements PluginRepository {
  private db;

  constructor(dbPath: string) {
    const sqlite = new Database(dbPath);
    sqlite.exec("PRAGMA journal_mode = WAL;");      // 并发读优化
    sqlite.exec("PRAGMA foreign_keys = ON;");        // 启用外键约束
    this.db = drizzle(sqlite, { schema: { plugins, pluginVersions } });
  }

  initialize(): void {
    const sqlite = this.db.$client;
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS plugins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        vendor_name TEXT,
        vendor_url TEXT,
        vendor_email TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS plugin_versions (
        plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
        version TEXT NOT NULL,
        since_build TEXT NOT NULL,
        until_build TEXT,
        change_notes TEXT,
        depends TEXT,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (plugin_id, version)
      );
    `);
  }

  savePluginVersion(metadata: PluginMetadata, fileInfo: FileInfo): void {
    const now = new Date().toISOString();

    // Upsert 插件主记录
    this.db.insert(plugins).values({
      id: metadata.id,
      name: metadata.name,
      description: metadata.description,
      vendorName: metadata.vendor?.name ?? null,
      vendorUrl: metadata.vendor?.url ?? null,
      vendorEmail: metadata.vendor?.email ?? null,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: plugins.id,
      set: {
        name: metadata.name,
        description: metadata.description,
        vendorName: metadata.vendor?.name ?? null,
        vendorUrl: metadata.vendor?.url ?? null,
        vendorEmail: metadata.vendor?.email ?? null,
        updatedAt: now,
      },
    }).run();

    // Upsert 版本记录
    this.db.insert(pluginVersions).values({
      pluginId: metadata.id,
      version: metadata.version,
      sinceBuild: metadata.sinceBuild,
      untilBuild: metadata.untilBuild,
      changeNotes: metadata.changeNotes,
      depends: JSON.stringify(metadata.depends),
      fileName: fileInfo.fileName,
      fileSize: fileInfo.fileSize,
      fileSha256: fileInfo.fileSha256,
      createdAt: now,
    }).onConflictDoUpdate({
      target: [pluginVersions.pluginId, pluginVersions.version],
      set: {
        sinceBuild: metadata.sinceBuild,
        untilBuild: metadata.untilBuild,
        changeNotes: metadata.changeNotes,
        depends: JSON.stringify(metadata.depends),
        fileName: fileInfo.fileName,
        fileSize: fileInfo.fileSize,
        fileSha256: fileInfo.fileSha256,
        createdAt: now,
      },
    }).run();
  }

  findPlugin(pluginId: string): PluginWithVersions | null {
    const pluginRow = this.db.select()
      .from(plugins)
      .where(eq(plugins.id, pluginId))
      .get();
    if (!pluginRow) return null;

    const versionRows = this.db.select()
      .from(pluginVersions)
      .where(eq(pluginVersions.pluginId, pluginId))
      .all();

    const versions = versionRows
      .map((row) => this.toPluginVersion(row))
      .sort((a, b) => compareVersions(b.version, a.version)); // 降序

    return {
      info: {
        id: pluginRow.id,
        name: pluginRow.name,
        description: pluginRow.description,
        vendor: pluginRow.vendorName
          ? { name: pluginRow.vendorName, url: pluginRow.vendorUrl, email: pluginRow.vendorEmail }
          : null,
        createdAt: pluginRow.createdAt,
        updatedAt: pluginRow.updatedAt,
      },
      versions,
    };
  }

  listPlugins(query: string | null, page: number, pageSize: number): PagedResult<PluginSummary> {
    const offset = (page - 1) * pageSize;

    // 构建查询条件
    const condition = query
      ? or(
          like(plugins.id, `%${query}%`),
          like(plugins.name, `%${query}%`),
        )
      : undefined;

    // 查询总数
    const countResult = this.db.select({ count: sql<number>`count(*)` })
      .from(plugins)
      .where(condition)
      .get();
    const total = countResult?.count ?? 0;

    // 查询当前页数据
    const rows = this.db.select()
      .from(plugins)
      .where(condition)
      .orderBy(desc(plugins.updatedAt))
      .limit(pageSize)
      .offset(offset)
      .all();

    // 查询每个插件的版本信息
    const items: PluginSummary[] = rows.map((row) => {
      const versionRows = this.db.select()
        .from(pluginVersions)
        .where(eq(pluginVersions.pluginId, row.id))
        .all();

      const versions = versionRows
        .map((v) => v.version)
        .sort((a, b) => compareVersions(b, a));

      return {
        id: row.id,
        name: row.name,
        vendor: row.vendorName,
        latestVersion: versions[0] ?? "0.0.0",
        versionCount: versionRows.length,
        updatedAt: row.updatedAt,
      };
    });

    return { total, page, pageSize, items };
  }

  deletePlugin(pluginId: string): number {
    // 先统计版本数
    const countResult = this.db.select({ count: sql<number>`count(*)` })
      .from(pluginVersions)
      .where(eq(pluginVersions.pluginId, pluginId))
      .get();
    const versionCount = countResult?.count ?? 0;

    // CASCADE 会自动删除关联的版本记录
    this.db.delete(plugins).where(eq(plugins.id, pluginId)).run();

    return versionCount;
  }

  findVersion(pluginId: string, version: string): PluginVersion | null {
    const row = this.db.select()
      .from(pluginVersions)
      .where(and(
        eq(pluginVersions.pluginId, pluginId),
        eq(pluginVersions.version, version),
      ))
      .get();
    return row ? this.toPluginVersion(row) : null;
  }

  deleteVersion(pluginId: string, version: string): number {
    this.db.delete(pluginVersions)
      .where(and(
        eq(pluginVersions.pluginId, pluginId),
        eq(pluginVersions.version, version),
      ))
      .run();

    // 检查剩余版本数
    const remaining = this.db.select({ count: sql<number>`count(*)` })
      .from(pluginVersions)
      .where(eq(pluginVersions.pluginId, pluginId))
      .get();

    const count = remaining?.count ?? 0;
    if (count === 0) {
      this.db.delete(plugins).where(eq(plugins.id, pluginId)).run();
    }
    return count;
  }

  findCompatiblePlugins(buildNumber: string | null): CompatiblePlugin[] {
    // 获取所有版本，在应用层做 build number 过滤和版本排序
    const allVersions = this.db.select({
      pluginId: pluginVersions.pluginId,
      version: pluginVersions.version,
      sinceBuild: pluginVersions.sinceBuild,
      untilBuild: pluginVersions.untilBuild,
      changeNotes: pluginVersions.changeNotes,
      pluginName: plugins.name,
      description: plugins.description,
      vendorName: plugins.vendorName,
      vendorUrl: plugins.vendorUrl,
      vendorEmail: plugins.vendorEmail,
    })
      .from(pluginVersions)
      .innerJoin(plugins, eq(pluginVersions.pluginId, plugins.id))
      .all();

    // 按 pluginId 分组
    const grouped = new Map<string, typeof allVersions>();
    for (const row of allVersions) {
      const existing = grouped.get(row.pluginId) ?? [];
      existing.push(row);
      grouped.set(row.pluginId, existing);
    }

    const result: CompatiblePlugin[] = [];

    for (const [, versions] of grouped) {
      // 过滤兼容版本
      const compatible = buildNumber
        ? versions.filter((v) => isCompatible(buildNumber, v.sinceBuild, v.untilBuild))
        : versions;

      if (compatible.length === 0) continue;

      // 取版本号最大的
      compatible.sort((a, b) => compareVersions(b.version, a.version));
      const latest = compatible[0];

      result.push({
        id: latest.pluginId,
        name: latest.pluginName,
        version: latest.version,
        sinceBuild: latest.sinceBuild,
        untilBuild: latest.untilBuild,
        description: latest.description,
        vendor: latest.vendorName
          ? { name: latest.vendorName, url: latest.vendorUrl, email: latest.vendorEmail }
          : null,
        changeNotes: latest.changeNotes,
        downloadUrl: "", // 由 Service 层填充
      });
    }

    return result;
  }

  getStats(): RegistryStats {
    const pluginCount = this.db.select({ count: sql<number>`count(*)` })
      .from(plugins)
      .get()?.count ?? 0;

    const versionCount = this.db.select({ count: sql<number>`count(*)` })
      .from(pluginVersions)
      .get()?.count ?? 0;

    const totalSize = this.db.select({ total: sql<number>`coalesce(sum(file_size), 0)` })
      .from(pluginVersions)
      .get()?.total ?? 0;

    return {
      pluginCount,
      versionCount,
      totalStorageBytes: totalSize,
    };
  }

  getRecentUploads(limit: number): RecentUpload[] {
    const rows = this.db.select({
      pluginId: pluginVersions.pluginId,
      version: pluginVersions.version,
      createdAt: pluginVersions.createdAt,
    })
      .from(pluginVersions)
      .orderBy(desc(pluginVersions.createdAt))
      .limit(limit)
      .all();

    return rows;
  }

  private toPluginVersion(row: typeof pluginVersions.$inferSelect): PluginVersion {
    return {
      pluginId: row.pluginId,
      version: row.version,
      sinceBuild: row.sinceBuild,
      untilBuild: row.untilBuild,
      changeNotes: row.changeNotes,
      depends: row.depends ? JSON.parse(row.depends) : [],
      fileName: row.fileName,
      fileSize: row.fileSize,
      fileSha256: row.fileSha256,
      createdAt: row.createdAt,
    };
  }
}

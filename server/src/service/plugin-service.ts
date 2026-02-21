import { join, dirname } from "path";
import { mkdir } from "fs/promises";
import { unlink } from "fs/promises";
import { rmdir } from "fs/promises";
import type {
  PluginRepository,
  PluginVersion,
  PluginWithVersions,
  PluginSummary,
  PagedResult,
  RegistryStats,
  RecentUpload,
  FileInfo,
  CompatiblePlugin,
} from "../repository/types";
import type { PluginParser } from "./plugin-parser";
import { generateUpdatePluginsXml } from "../lib/xml";

/** 版本冲突错误，用于区分 409 Conflict 响应 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class PluginService {
  private startedAt = new Date();

  constructor(
    private repository: PluginRepository,
    private parser: PluginParser,
    private storageDir: string,
    private baseUrl: string,
  ) {}

  async upload(file: File, force: boolean): Promise<PluginVersion> {
    // 1. 写入临时文件
    const tmpPath = join(this.storageDir, "tmp", crypto.randomUUID());
    await mkdir(dirname(tmpPath), { recursive: true });
    await Bun.write(tmpPath, file);

    try {
      // 2. 解析元数据
      const metadata = this.parser.parse(tmpPath);

      // 3. 检查版本冲突
      const existing = this.repository.findVersion(metadata.id, metadata.version);
      if (existing && !force) {
        throw new ConflictError(
          `Version ${metadata.version} already exists for ${metadata.id}. ` +
          `Use ?force=true to overwrite.`
        );
      }

      // 4. 移动到目标路径
      const targetDir = join(this.storageDir, "plugins", metadata.id);
      await mkdir(targetDir, { recursive: true });
      const targetPath = join(targetDir, `${metadata.version}.zip`);
      await Bun.write(targetPath, Bun.file(tmpPath));

      // 5. 计算文件信息
      const hasher = new Bun.CryptoHasher("sha256");
      hasher.update(await Bun.file(targetPath).arrayBuffer());
      const fileInfo: FileInfo = {
        fileName: `${metadata.id}-${metadata.version}.zip`,
        fileSize: file.size,
        fileSha256: hasher.digest("hex"),
      };

      // 6. 保存到数据库
      this.repository.savePluginVersion(metadata, fileInfo);

      return this.repository.findVersion(metadata.id, metadata.version)!;
    } finally {
      // 7. 清理临时文件
      try { await unlink(tmpPath); } catch { /* ignore */ }
    }
  }

  async deleteVersion(pluginId: string, version: string): Promise<number> {
    // 删除文件
    const filePath = this.getPluginFilePath(pluginId, version);
    try { await unlink(filePath); } catch { /* ignore */ }

    // 删除数据库记录
    const remaining = this.repository.deleteVersion(pluginId, version);

    // 如果没有剩余版本，清理目录
    if (remaining === 0) {
      const pluginDir = join(this.storageDir, "plugins", pluginId);
      try { await rmdir(pluginDir); } catch { /* ignore */ }
    }

    return remaining;
  }

  async deletePlugin(pluginId: string): Promise<void> {
    const plugin = this.repository.findPlugin(pluginId);
    if (!plugin) return;

    // 删除所有版本文件
    for (const ver of plugin.versions) {
      const filePath = this.getPluginFilePath(pluginId, ver.version);
      try { await unlink(filePath); } catch { /* ignore */ }
    }

    // 删除目录
    const pluginDir = join(this.storageDir, "plugins", pluginId);
    try { await rmdir(pluginDir); } catch { /* ignore */ }

    // 删除数据库记录
    this.repository.deletePlugin(pluginId);
  }

  getPlugin(pluginId: string): PluginWithVersions | null {
    return this.repository.findPlugin(pluginId);
  }

  getUpdatePluginsXml(buildNumber?: string | null): string {
    const compatiblePlugins = this.repository.findCompatiblePlugins(buildNumber ?? null);

    // 填充下载 URL
    for (const plugin of compatiblePlugins) {
      plugin.downloadUrl = `${this.baseUrl}/plugins/${plugin.id}/${plugin.version}`;
    }

    return generateUpdatePluginsXml(compatiblePlugins);
  }

  getPluginFilePath(pluginId: string, version: string): string {
    return join(this.storageDir, "plugins", pluginId, `${version}.zip`);
  }

  listPlugins(query: string | null, page: number, pageSize: number): PagedResult<PluginSummary> {
    return this.repository.listPlugins(query, page, pageSize);
  }

  getStats(): RegistryStats {
    return this.repository.getStats();
  }

  getRecentUploads(limit: number): RecentUpload[] {
    return this.repository.getRecentUploads(limit);
  }

  /** 返回人类可读的运行时间，如 "3d 12h 30m" */
  getUptime(): string {
    const ms = Date.now() - this.startedAt.getTime();
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${d}d ${h}h ${m}m`;
  }

  /** 返回服务启动时间的 ISO 字符串 */
  getStartTime(): string {
    return this.startedAt.toISOString();
  }
}

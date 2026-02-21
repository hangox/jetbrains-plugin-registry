export interface PluginInfo {
  id: string;              // com.example.myplugin
  name: string;
  description: string | null;
  vendor: VendorInfo | null;
  createdAt: string;       // ISO-8601
  updatedAt: string;
}

export interface VendorInfo {
  name: string;
  url: string | null;
  email: string | null;
}

export interface PluginVersion {
  pluginId: string;
  version: string;
  sinceBuild: string;
  untilBuild: string | null;
  changeNotes: string | null;
  depends: string[];
  fileName: string;
  fileSize: number;
  fileSha256: string;
  createdAt: string;
}

/** 从 ZIP 中解析出的原始元数据 */
export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  sinceBuild: string;
  untilBuild: string | null;
  description: string | null;
  vendor: VendorInfo | null;
  changeNotes: string | null;
  depends: string[];
}

export interface PluginSummary {
  id: string;
  name: string;
  vendor: string | null;
  latestVersion: string;
  versionCount: number;
  updatedAt: string;
}

export interface PluginWithVersions {
  info: PluginInfo;
  versions: PluginVersion[];  // 按版本号降序
}

export interface CompatiblePlugin {
  id: string;
  name: string;
  version: string;
  sinceBuild: string;
  untilBuild: string | null;
  description: string | null;
  vendor: VendorInfo | null;
  changeNotes: string | null;
  downloadUrl: string;
}

export interface PagedResult<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface RegistryStats {
  pluginCount: number;
  versionCount: number;
  totalStorageBytes: number;
}

export interface FileInfo {
  fileName: string;
  fileSize: number;
  fileSha256: string;
}

export interface RecentUpload {
  pluginId: string;
  version: string;
  createdAt: string;
}

export interface PluginRepository {
  /** 初始化数据库表结构 */
  initialize(): void;

  // —— 插件级操作 ——

  /** 保存或更新插件 + 版本。插件已存在则更新 updatedAt */
  savePluginVersion(metadata: PluginMetadata, fileInfo: FileInfo): void;

  /** 查询插件及所有版本 */
  findPlugin(pluginId: string): PluginWithVersions | null;

  /** 分页查询插件列表 */
  listPlugins(query: string | null, page: number, pageSize: number): PagedResult<PluginSummary>;

  /** 删除插件所有版本，返回被删版本数 */
  deletePlugin(pluginId: string): number;

  // —— 版本级操作 ——

  findVersion(pluginId: string, version: string): PluginVersion | null;

  /** 删除指定版本，返回剩余版本数。剩余 0 时同时删除插件记录 */
  deleteVersion(pluginId: string, version: string): number;

  // —— XML 查询 ——

  /**
   * 查询兼容指定 build 的插件，每个 pluginId 返回最新兼容版本。
   * buildNumber 为 null 时返回所有插件最新版本。
   */
  findCompatiblePlugins(buildNumber: string | null): CompatiblePlugin[];

  // —— 统计 ——
  getStats(): RegistryStats;

  /** 获取最近上传的版本记录，按 createdAt 降序，limit 条 */
  getRecentUploads(limit: number): RecentUpload[];
}

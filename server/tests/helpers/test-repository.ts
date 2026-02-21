import { SqlitePluginRepository } from "../../src/repository/sqlite";

/** 创建内存数据库 Repository（每次调用都是全新的） */
export function createTestRepository(): SqlitePluginRepository {
  const repo = new SqlitePluginRepository(":memory:");
  repo.initialize();
  return repo;
}

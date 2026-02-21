import { config } from "../config";
import type { PluginRepository } from "./types";

export function createRepository(): PluginRepository {
  switch (config.db.type) {
    case "sqlite": {
      const { SqlitePluginRepository } = require("./sqlite");
      const dbPath = `${config.dataDir}/${config.db.url}`;
      return new SqlitePluginRepository(dbPath);
    }
    case "mysql": {
      throw new Error("MySQL support not yet implemented");
    }
    case "postgresql": {
      throw new Error("PostgreSQL support not yet implemented");
    }
    default:
      throw new Error(`Unsupported database type: ${config.db.type}`);
  }
}

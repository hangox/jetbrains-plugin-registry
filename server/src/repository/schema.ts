import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const plugins = sqliteTable("plugins", {
  id: text("id").primaryKey(),                    // com.example.myplugin
  name: text("name").notNull(),
  description: text("description"),
  vendorName: text("vendor_name"),
  vendorUrl: text("vendor_url"),
  vendorEmail: text("vendor_email"),
  createdAt: text("created_at").notNull(),        // ISO-8601
  updatedAt: text("updated_at").notNull(),
});

export const pluginVersions = sqliteTable(
  "plugin_versions",
  {
    pluginId: text("plugin_id").notNull().references(() => plugins.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    sinceBuild: text("since_build").notNull(),
    untilBuild: text("until_build"),
    changeNotes: text("change_notes"),
    depends: text("depends"),                     // JSON 数组: '["dep1","dep2"]'
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    fileSha256: text("file_sha256").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.pluginId, table.version] }),
  ]
);

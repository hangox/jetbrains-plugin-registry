# CLAUDE.md

## 项目概述

JetBrains 私有插件仓库 — 轻量级自托管方案，100% 兼容 JetBrains Custom Plugin Repository 协议。

## 项目结构

```
jetbrains-plugin-registry/
├── server/          # 服务端（TypeScript + Bun + Hono + Drizzle + SQLite）
│   ├── src/
│   │   ├── index.ts              # 入口
│   │   ├── config.ts             # 环境变量配置
│   │   ├── types.ts              # Hono Context 类型
│   │   ├── routes/               # 三组路由
│   │   │   ├── api.ts            # REST API（Bearer Token 认证）
│   │   │   ├── repository.ts     # updatePlugins.xml + 插件下载
│   │   │   └── web.tsx           # Web 管理界面（Session 认证）
│   │   ├── service/
│   │   │   ├── plugin-service.ts # 业务逻辑
│   │   │   └── plugin-parser.ts  # ZIP/JAR 解析
│   │   ├── repository/
│   │   │   ├── types.ts          # 接口 + 领域类型
│   │   │   ├── schema.ts         # Drizzle Schema
│   │   │   ├── sqlite.ts         # SQLite 实现
│   │   │   └── index.ts          # 工厂函数
│   │   ├── lib/
│   │   │   ├── build-number.ts   # Build Number 比较
│   │   │   ├── flash.ts          # Flash Message
│   │   │   └── xml.ts            # XML 生成
│   │   └── views/                # JSX 视图组件（7 个 .tsx）
│   ├── tests/                    # 测试（bun test）
│   │   ├── helpers/              # 测试辅助（fixtures, test-app, test-repository）
│   │   ├── unit/                 # 单元测试
│   │   ├── integration/          # 集成测试
│   │   └── e2e/                  # E2E 测试
│   ├── Dockerfile
│   └── docker-compose.yml
├── gradle-plugin/   # Gradle 发布插件（Kotlin）
│   ├── src/main/kotlin/com/example/registry/
│   │   ├── PrivateRegistryPlugin.kt
│   │   ├── PrivateRegistryExtension.kt
│   │   └── UploadPluginTask.kt
│   └── src/test/ + src/functionalTest/
└── docs/            # 设计文档
```

## 技术栈

- **服务端**: Bun 1.2+ / Hono 4.x / Drizzle ORM / SQLite (bun:sqlite)
- **Gradle 插件**: Kotlin / Gradle 8.x / Gradle TestKit
- **Web UI**: Hono JSX SSR + Pico.css (classless CSS)

## 常用命令

### 服务端

```bash
cd server

# 开发
bun run --hot src/index.ts

# 测试
bun test

# 类型检查
npx tsc --noEmit

# 生产启动
AUTH_TOKENS=token1 ADMIN_PASS=your-pass bun run src/index.ts
```

### Gradle 插件

```bash
cd gradle-plugin

# 编译 + 测试
./gradlew build

# 功能测试
./gradlew functionalTest
```

## 认证机制

- **API**: `Authorization: Bearer <token>`，配置 `AUTH_TOKENS` 环境变量
- **Web UI**: 用户名密码登录 → httpOnly cookie，配置 `ADMIN_USER` + `ADMIN_PASS`

## 关键环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 监听端口 |
| `BASE_URL` | http://localhost:3000 | 服务公网地址 |
| `AUTH_TOKENS` | (空) | API Token，逗号分隔 |
| `ADMIN_USER` | admin | Web 管理员用户名 |
| `ADMIN_PASS` | (空) | Web 管理员密码 |
| `DATA_DIR` | ./data | 数据目录 |
| `DB_TYPE` | sqlite | 数据库类型 |

## 数据库

默认 SQLite，数据存储在 `{DATA_DIR}/registry.db`。Repository 接口可插拔，未来可扩展 MySQL/PostgreSQL。

## 测试

- 110 个服务端测试（unit + integration + e2e）
- 18 个 Gradle 插件测试（unit + functional）
- 服务端测试使用 `:memory:` SQLite 隔离，E2E 测试使用 `app.request()` 无需启动真实服务器

## 编码规范

- TypeScript 严格模式
- import 使用相对路径
- 数据库时间用 ISO-8601 字符串
- depends 字段在数据库中存为 JSON 字符串，读取时 JSON.parse

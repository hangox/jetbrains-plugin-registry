# JetBrains Private Plugin Registry

轻量级自托管 JetBrains 插件仓库，100% 兼容 [Custom Plugin Repository](https://plugins.jetbrains.com/docs/intellij/custom-plugin-repository.html) 协议。

## 特性

- **零依赖部署** — 单二进制 Bun 运行时 + SQLite，无需外部数据库
- **JetBrains 协议兼容** — IDE 原生识别，无缝安装/更新插件
- **Gradle 发布插件** — 一条命令 `./gradlew uploadPlugin` 发布到仓库
- **Web 管理界面** — 浏览器管理插件，支持上传/删除/查看
- **双层认证** — API Bearer Token（CI/CD）+ Session 登录（Web UI）
- **Build 号兼容性过滤** — 自动按 IDE 版本过滤兼容插件
- **SHA256 校验** — 上传和下载全链路完整性校验

## 快速开始

### 1. 启动服务端

```bash
cd server && bun install

AUTH_TOKENS=my-secret-token \
ADMIN_PASS=my-admin-pass \
bun run src/index.ts
```

服务运行在 `http://localhost:3000`。

### 2. 在 IDE 中配置仓库

**Settings** → **Plugins** → **Manage Plugin Repositories** → 添加：

```
http://localhost:3000/updatePlugins.xml
```

### 3. 发布插件

在你的 IntelliJ 插件项目中配置 Gradle 插件：

```kotlin
// settings.gradle.kts
pluginManagement {
    repositories {
        maven { url = uri("https://jitpack.io") }
        gradlePluginPortal()
    }
}
```

```kotlin
// build.gradle.kts
plugins {
    id("org.jetbrains.intellij.platform") version "2.2.1"
    id("com.github.hangox.private-plugin-registry") version "v1.0.0"
}

privateRegistry {
    url = "http://localhost:3000"
    token = providers.environmentVariable("REGISTRY_TOKEN")
}
```

```bash
REGISTRY_TOKEN=my-secret-token ./gradlew uploadPlugin
```

## Docker 部署

```bash
# 构建并启动
docker compose up -d

# 或直接 docker run
docker build -t plugin-registry -f server/Dockerfile .
docker run -d \
  -p 3000:3000 \
  -e AUTH_TOKENS=my-secret-token \
  -e ADMIN_PASS=my-admin-pass \
  -e BASE_URL=https://plugins.example.com \
  -v registry-data:/app/data \
  plugin-registry
```

## 项目结构

```
jetbrains-plugin-registry/
├── server/           # 服务端（TypeScript + Bun + Hono + SQLite）
├── gradle-plugin/    # Gradle 发布插件（Kotlin）
├── sample-plugin/    # 示例 IntelliJ 插件（集成测试用）
├── scripts/          # 自动化脚本
└── docs/             # 设计文档
```

## 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | [Bun](https://bun.sh) 1.2+ |
| Web 框架 | [Hono](https://hono.dev) 4.x |
| 数据库 | SQLite（bun:sqlite）+ [Drizzle ORM](https://orm.drizzle.team) |
| Web UI | Hono JSX SSR + [Pico.css](https://picocss.com) |
| Gradle 插件 | Kotlin + Gradle 8.x |

## API 接口

### JetBrains 协议（无需认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/updatePlugins.xml?build=IC-241.15989` | IDE 查询兼容插件列表 |
| GET | `/plugins/:pluginId/:version` | 下载插件 ZIP |

### 管理 API（Bearer Token）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/plugins` | 上传插件 |
| GET | `/api/plugins` | 分页查询插件列表 |
| GET | `/api/plugins/:pluginId` | 查询插件详情 |
| DELETE | `/api/plugins/:pluginId/:version` | 删除指定版本 |
| DELETE | `/api/plugins/:pluginId` | 删除整个插件 |
| GET | `/api/health` | 健康检查 |
| GET | `/api/stats` | 存储统计 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 监听端口 |
| `BASE_URL` | http://localhost:3000 | 服务公网地址 |
| `AUTH_TOKENS` | — | API Token，逗号分隔多个 |
| `ADMIN_USER` | admin | Web 管理员用户名 |
| `ADMIN_PASS` | — | Web 管理员密码 |
| `DATA_DIR` | ./data | 数据存储目录 |
| `MAX_FILE_SIZE` | 104857600 | 最大上传文件大小（字节，默认 100MB） |

## 测试

```bash
# 服务端单元/集成/E2E 测试（113 个，~0.4s）
cd server && bun test

# 真实服务器端到端测试（31 个检查点）
cd server && bun run test:e2e

# 使用 sample-plugin 真实 ZIP 测试
cd server && bun run test:e2e:sample

# Gradle 插件测试（18 个）
cd gradle-plugin && ./gradlew build functionalTest
```

## Gradle 插件配置

```kotlin
privateRegistry {
    url = "https://plugins.example.com"       // 仓库地址（必填）
    token = providers.environmentVariable("TOKEN")  // API Token（必填）
    forceOverwrite = false                    // 覆盖已有版本
    timeout = 120                             // 请求超时（秒）
    retryCount = 0                            // 重试次数
    retryDelay = 3                            // 重试间隔（秒）
}
```

## 许可证

MIT

# JetBrains Private Plugin Registry — PRD

## 1. 项目概述

一个轻量级、自包含的 JetBrains 私有插件仓库服务。插件开发者通过 Gradle 插件一键发布，JetBrains IDE 通过 Custom Plugin Repository 协议自动发现、安装和更新插件，管理员通过 Web 界面管理所有插件。

### 1.1 解决的问题

- 不想把内部插件发布到 JetBrains Marketplace 公开
- 不想依赖 Maven/Nexus 等重型基础设施
- 希望 Gradle 构建流程中一步到位完成发布
- 需要可视化管理已发布的插件

### 1.2 设计原则

- **单体自包含**：Bun 单进程运行，默认 SQLite 零依赖启动，idle 内存 ~30MB
- **零配置发布**：Gradle 插件集成，`./gradlew uploadPlugin` 一条命令完成构建 + 上传
- **协议兼容**：100% 兼容 JetBrains Custom Plugin Repository 协议
- **数据库可插拔**：默认 SQLite，可切换 MySQL/PostgreSQL

## 2. 用户角色与使用流程

### 2.1 角色定义

| 角色 | 描述 | 交互方式 |
|------|------|----------|
| 插件开发者 | 构建并发布插件 | Gradle 插件 (`./gradlew uploadPlugin`) |
| IDE 用户 | 安装/更新私有插件 | JetBrains IDE Plugin Manager |
| 管理员 | 管理插件生命周期 | Web 管理界面 + API |

### 2.2 端到端使用流程

```
插件开发者                       Registry 服务                    IDE 用户
    │                                │                              │
    │  ./gradlew uploadPlugin        │                              │
    │  ─────────────────────────►    │                              │
    │  (构建 zip + POST 上传)        │                              │
    │                                │  解析 plugin.xml             │
    │                                │  存储文件 + 元数据            │
    │  ◄─────────────────────────    │                              │
    │  201 发布成功                   │                              │
    │                                │                              │
    │                                │    GET /updatePlugins.xml    │
    │                                │  ◄──────────────────────────  │
    │                                │  过滤兼容版本、生成 XML        │
    │                                │  ──────────────────────────►  │
    │                                │                              │
    │                                │    GET /plugins/id/ver.zip   │
    │                                │  ◄──────────────────────────  │
    │                                │  返回文件流                    │
    │                                │  ──────────────────────────►  │
    │                                │                              │  安装插件
```

## 3. 功能清单

所有功能均为 V1 范围。

| 编号 | 功能 | 详细设计文档 |
|------|------|-------------|
| F01 | 插件上传（API） | [接口规格.md](docs/接口规格.md) |
| F02 | 插件下载 | [接口规格.md](docs/接口规格.md) |
| F03 | updatePlugins.xml 生成 | [接口规格.md](docs/接口规格.md) |
| F04 | 插件删除（版本级 + 整体） | [接口规格.md](docs/接口规格.md) |
| F05 | 插件列表与搜索 | [接口规格.md](docs/接口规格.md) |
| F06 | Token 认证 | [接口规格.md](docs/接口规格.md) |
| F07 | ZIP 解析与元数据提取 | [插件解析器.md](docs/插件解析器.md) |
| F08 | 数据库存储（可插拔） | [数据模型.md](docs/数据模型.md) |
| F09 | Web 管理界面 | [Web管理界面.md](docs/Web管理界面.md) |
| F10 | Gradle 发布插件 | [Gradle发布插件.md](docs/Gradle发布插件.md) |
| F11 | 健康检查与存储统计 | [接口规格.md](docs/接口规格.md) |
| F12 | 访问日志 | [部署与运维.md](docs/部署与运维.md) |

## 4. 技术选型总览

详见 [架构设计.md](docs/架构设计.md)

| 层 | 选型 | 理由 |
|----|------|------|
| 运行时 | **Bun** | 内存极低（idle ~30MB）、内置 SQLite、原生 TypeScript |
| 语言 | **TypeScript** | 类型安全 |
| Web 框架 | **Hono** | 内置 JSX/SSR、50+ 官方中间件、不锁运行时 |
| 数据库 ORM | **Drizzle** | 同一 schema 定义支持 SQLite/MySQL/PostgreSQL |
| 默认数据库 | **bun:sqlite** | Bun 内置、零依赖、性能比 better-sqlite3 快 3-6x |
| ZIP 解析 | **adm-zip** | 支持读取嵌套 JAR |
| XML 生成 | 模板字符串 | updatePlugins.xml 结构固定，不需要 XML 库 |
| Web UI | **Hono JSX** | 内置 SSR，`c.html(<Page />)` 直接渲染 |
| Gradle 插件 | **Kotlin** | Gradle 生态原生语言，独立子项目 |

## 5. 项目结构总览

```
jetbrains-plugin-registry/
├── server/                          ← Registry 服务端（Bun + Hono）
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                 ← 入口，启动服务
│       ├── config.ts                ← 配置加载（环境变量）
│       ├── routes/
│       │   ├── repository.ts        ← /updatePlugins.xml, /plugins 下载
│       │   ├── api.ts               ← /api/plugins CRUD
│       │   └── web.tsx              ← Web 管理界面（JSX）
│       ├── service/
│       │   ├── plugin-service.ts    ← 业务逻辑
│       │   └── plugin-parser.ts     ← ZIP 解析 + plugin.xml 提取
│       ├── repository/
│       │   ├── types.ts             ← Repository 接口定义
│       │   ├── schema.ts            ← Drizzle 表定义
│       │   └── sqlite.ts            ← SQLite 实现
│       ├── lib/
│       │   ├── xml.ts               ← updatePlugins.xml 生成
│       │   └── build-number.ts      ← Build Number 比较逻辑
│       └── views/
│           ├── layout.tsx           ← 页面布局
│           ├── login.tsx            ← 登录页面
│           ├── plugin-list.tsx      ← 插件列表页
│           ├── plugin-detail.tsx    ← 插件详情页
│           ├── upload.tsx           ← 上传页面
│           └── stats.tsx            ← 统计页面
│   └── tests/
│       ├── helpers/
│       │   ├── fixtures.ts          ← 测试数据工厂
│       │   ├── test-app.ts          ← 创建测试用 Hono 应用
│       │   └── test-repository.ts   ← 创建内存 SQLite Repository
│       ├── unit/                    ← 单元测试（Parser、Build Number、XML）
│       ├── integration/             ← 集成测试（Repository、Service）
│       └── e2e/                     ← E2E 测试（HTTP 路由、认证）
├── gradle-plugin/                   ← Gradle 发布插件（Kotlin）
│   ├── build.gradle.kts
│   └── src/main/kotlin/
│       └── com/example/registry/
│           ├── PrivateRegistryPlugin.kt
│           ├── PrivateRegistryExtension.kt
│           └── UploadPluginTask.kt
├── Dockerfile
├── docker-compose.yml
├── PRD.md
└── docs/
    ├── 架构设计.md
    ├── 接口规格.md
    ├── 数据模型.md
    ├── 插件解析器.md
    ├── 服务端测试方案.md
    ├── Gradle发布插件.md
    ├── Web管理界面.md
    └── 部署与运维.md
```

## 6. 非目标

- 不做用户体系（单 Token 足够）
- 不做插件审核流程
- 不做 CDN 分发（流量小，直连就够）
- 不做插件依赖解析（JetBrains IDE 自己处理）
- 不做付费/授权管理

## 7. 文档索引

| 文档 | 内容 |
|------|------|
| [架构设计.md](docs/架构设计.md) | 技术选型决策、架构设计、模块划分 |
| [接口规格.md](docs/接口规格.md) | 完整 HTTP API 规格（请求/响应/状态码/示例） |
| [数据模型.md](docs/数据模型.md) | 数据库 schema、Repository 抽象、Drizzle 定义 |
| [插件解析器.md](docs/插件解析器.md) | ZIP/JAR 解析逻辑、plugin.xml 字段映射、安全校验、错误信息 |
| [服务端测试方案.md](docs/服务端测试方案.md) | 服务端测试分层、单元/集成/E2E 测试、测试工具链、CI 集成 |
| [Gradle发布插件.md](docs/Gradle发布插件.md) | Gradle 发布插件总览、快速开始（含子文档索引） |
| ↳ [DSL配置设计.md](docs/Gradle发布插件/DSL配置设计.md) | Extension 定义、配置项、Property 类型、配置示例 |
| ↳ [上传任务实现.md](docs/Gradle发布插件/上传任务实现.md) | UploadPluginTask 完整实现、Multipart、重试、错误处理 |
| ↳ [构建与发布.md](docs/Gradle发布插件/构建与发布.md) | build.gradle.kts、Maven 发布、版本管理、本地调试 |
| ↳ [CI-CD集成.md](docs/Gradle发布插件/CI-CD集成.md) | GitLab CI、GitHub Actions、Jenkins、多环境策略 |
| ↳ [测试方案.md](docs/Gradle发布插件/测试方案.md) | 单元测试、集成测试、Gradle TestKit 功能测试 |
| [Web管理界面.md](docs/Web管理界面.md) | Web 管理界面、JSX 组件、路由、认证、安全、响应式 |
| [部署与运维.md](docs/部署与运维.md) | Docker 部署、环境变量、日志、监控 |

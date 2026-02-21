# Gradle 发布插件

## 概述

提供一个 Gradle 插件 `com.example.private-plugin-registry`，让插件开发者在 `build.gradle.kts` 中配置仓库地址和 Token 后，只需执行 `./gradlew uploadPlugin` 即可完成构建 + 上传。

**设计原则：**

- 零侵入：不修改现有 IntelliJ Gradle Plugin 配置
- 最少配置：只需 `url` + `token` 两个必填项
- 一条命令：`./gradlew uploadPlugin` 自动触发 `buildPlugin` → 上传
- 清晰反馈：上传成功/失败都有明确的 Gradle 日志输出

## 文档索引

| 文档 | 内容 |
|------|------|
| [DSL 配置设计](Gradle发布插件/DSL配置设计.md) | Extension DSL 设计、所有配置项、Property 类型、默认值约定、配置示例 |
| [上传任务实现](Gradle发布插件/上传任务实现.md) | UploadPluginTask 完整实现、Multipart 构建、HTTP 请求、错误处理、重试机制、超时控制 |
| [构建与发布](Gradle发布插件/构建与发布.md) | 插件自身的 `build.gradle.kts`、依赖管理、发布到 Maven、版本管理 |
| [CI/CD 集成](Gradle发布插件/CI-CD集成.md) | GitLab CI、GitHub Actions、Jenkins 完整配置，多环境策略，Tag 触发发布 |
| [测试方案](Gradle发布插件/测试方案.md) | 单元测试、集成测试、Gradle TestKit 功能测试、Mock Server |

## 与 IntelliJ Gradle Plugin 的关系

```
org.jetbrains.intellij.platform (IntelliJ Gradle Plugin)
    │
    │ 注册 buildPlugin task
    │ 产出 build/distributions/{name}-{version}.zip
    │
    ▼
com.example.private-plugin-registry (本插件)
    │
    │ 注册 uploadPlugin task
    │ dependsOn buildPlugin
    │ 读取 build/distributions/*.zip
    │ POST 上传到 Registry 服务
    │
    ▼
用户执行 ./gradlew uploadPlugin
    = 自动触发 buildPlugin → 上传
```

两个插件完全独立，通过 `dependsOn("buildPlugin")` 和 `build/distributions/` 目录约定协作。本插件不依赖 IntelliJ Gradle Plugin 的任何 API。

## 项目结构

```
gradle-plugin/
├── build.gradle.kts                           ← 构建配置
├── settings.gradle.kts
├── gradle.properties
├── src/
│   ├── main/kotlin/
│   │   └── com/example/registry/
│   │       ├── PrivateRegistryPlugin.kt       ← Plugin 入口
│   │       ├── PrivateRegistryExtension.kt    ← DSL Extension
│   │       └── UploadPluginTask.kt            ← 上传 Task
│   ├── test/kotlin/
│   │   └── com/example/registry/
│   │       ├── PrivateRegistryPluginTest.kt   ← 插件应用测试
│   │       ├── UploadPluginTaskTest.kt        ← 上传逻辑单元测试
│   │       └── UploadPluginFunctionalTest.kt  ← Gradle TestKit 功能测试
│   └── functionalTest/                        ← 功能测试资源
│       └── resources/
│           ├── sample-plugin.zip              ← 测试用插件包
│           └── build.gradle.kts               ← 测试用构建脚本
└── README.md
```

## 快速开始

### 引入插件

```kotlin
// settings.gradle.kts
pluginManagement {
    repositories {
        maven { url = uri("https://maven.example.com/releases") }
        gradlePluginPortal()
    }
}
```

```kotlin
// build.gradle.kts
plugins {
    id("org.jetbrains.intellij.platform") version "2.2.1"
    id("com.example.private-plugin-registry") version "1.0.0"
}

privateRegistry {
    url = "https://plugins.example.com"
    token = providers.environmentVariable("PLUGIN_REGISTRY_TOKEN")
}
```

### 执行发布

```bash
# 一条命令完成 构建 → 上传
PLUGIN_REGISTRY_TOKEN=xxx ./gradlew uploadPlugin

# 覆盖已有版本
PLUGIN_REGISTRY_TOKEN=xxx ./gradlew uploadPlugin --force
```

### 输出示例

```
> Task :buildPlugin
BUILD SUCCESSFUL

> Task :uploadPlugin
Uploading my-plugin-1.2.0.zip (1.2 MB) to https://plugins.example.com ...
Upload successful: com.example.myplugin v1.2.0
  - since-build: 222
  - until-build: 241.*

BUILD SUCCESSFUL in 8s
```

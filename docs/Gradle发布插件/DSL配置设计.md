# DSL 配置设计

## 1. Extension 接口定义

```kotlin
// PrivateRegistryExtension.kt
package com.example.registry

import org.gradle.api.provider.Property

interface PrivateRegistryExtension {

    /** 仓库地址，如 https://plugins.example.com（必填） */
    val url: Property<String>

    /** 认证 Token（必填，推荐从环境变量读取） */
    val token: Property<String>

    /** 是否覆盖已存在的同版本，默认 false */
    val forceOverwrite: Property<Boolean>

    /** HTTP 请求超时（秒），默认 120 */
    val timeout: Property<Int>

    /** 连接超时（秒），默认 10 */
    val connectTimeout: Property<Int>

    /** 上传失败重试次数，默认 0（不重试） */
    val retryCount: Property<Int>

    /** 重试间隔（秒），默认 3 */
    val retryDelay: Property<Int>
}
```

## 2. 配置项一览

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `url` | `String` | 是 | - | Registry 服务地址 |
| `token` | `String` | 是 | - | Bearer Token 认证 |
| `forceOverwrite` | `Boolean` | 否 | `false` | 覆盖已存在版本 |
| `timeout` | `Int` | 否 | `120` | HTTP 请求超时（秒） |
| `connectTimeout` | `Int` | 否 | `10` | 连接超时（秒） |
| `retryCount` | `Int` | 否 | `0` | 失败重试次数 |
| `retryDelay` | `Int` | 否 | `3` | 重试间隔（秒） |

## 3. Property 类型选择

所有配置项使用 `Property<T>` 而非裸类型，这是 Gradle 最佳实践：

```kotlin
// 好：延迟求值，支持 Provider 链
val token: Property<String>

// 差：立即求值，不支持环境变量延迟解析
var token: String
```

**延迟求值的好处：**

1. `providers.environmentVariable()` 返回 `Provider<String>`，可以直接 `set()` 到 `Property<String>`
2. 值在 Task 执行时才求值，而非配置阶段。这意味着环境变量只在真正需要时才读取
3. 支持 Gradle Configuration Cache（8.0+）

## 4. Plugin 入口注册

```kotlin
// PrivateRegistryPlugin.kt
package com.example.registry

import org.gradle.api.Plugin
import org.gradle.api.Project

class PrivateRegistryPlugin : Plugin<Project> {

    override fun apply(project: Project) {
        // 1. 注册 DSL extension
        val extension = project.extensions.create(
            "privateRegistry",
            PrivateRegistryExtension::class.java
        ).apply {
            // 设置默认值（convention = 有默认值但允许覆盖）
            forceOverwrite.convention(false)
            timeout.convention(120)
            connectTimeout.convention(10)
            retryCount.convention(0)
            retryDelay.convention(3)
        }

        // 2. 注册 uploadPlugin task
        project.tasks.register("uploadPlugin", UploadPluginTask::class.java) { task ->
            task.group = "publishing"
            task.description = "Build and upload plugin to private registry"

            // 绑定 extension → task property（延迟求值链）
            task.serverUrl.set(extension.url)
            task.token.set(extension.token)
            task.forceOverwrite.set(extension.forceOverwrite)
            task.timeout.set(extension.timeout)
            task.connectTimeout.set(extension.connectTimeout)
            task.retryCount.set(extension.retryCount)
            task.retryDelay.set(extension.retryDelay)

            // 依赖 buildPlugin（由 IntelliJ Gradle Plugin 注册）
            task.dependsOn("buildPlugin")

            // 从 build/distributions/ 获取产物
            task.distributionsDir.set(
                project.layout.buildDirectory.dir("distributions")
            )
        }
    }
}
```

## 5. 配置示例

### 5.1 最简配置

```kotlin
privateRegistry {
    url = "https://plugins.example.com"
    token = providers.environmentVariable("PLUGIN_REGISTRY_TOKEN")
}
```

### 5.2 完整配置

```kotlin
privateRegistry {
    url = "https://plugins.example.com"
    token = providers.environmentVariable("PLUGIN_REGISTRY_TOKEN")
    forceOverwrite = false
    timeout = 300           // 大文件上传需要更长超时
    connectTimeout = 15
    retryCount = 2          // 网络不稳定时重试
    retryDelay = 5
}
```

### 5.3 从 gradle.properties 读取

```kotlin
// build.gradle.kts
privateRegistry {
    url = providers.gradleProperty("registry.url")
    token = providers.gradleProperty("registry.token")
}
```

```properties
# gradle.properties（不要提交到 Git）
registry.url=https://plugins.example.com
registry.token=my-secret-token
```

### 5.4 多环境配置

```kotlin
privateRegistry {
    // 根据 CI 环境变量动态选择
    url = providers.environmentVariable("PLUGIN_REGISTRY_URL")
        .orElse("https://plugins-staging.example.com")  // 默认指向 staging
    token = providers.environmentVariable("PLUGIN_REGISTRY_TOKEN")
}
```

## 6. 配置校验

配置校验在 Task 执行时进行（非配置阶段），确保必填项已设置：

```kotlin
// UploadPluginTask.kt 中的校验逻辑
@TaskAction
fun upload() {
    // 校验必填项
    if (!serverUrl.isPresent) {
        throw TaskExecutionException(
            this,
            RuntimeException(
                "privateRegistry.url is required.\n" +
                "Example:\n" +
                "  privateRegistry {\n" +
                "      url = \"https://plugins.example.com\"\n" +
                "  }"
            )
        )
    }

    if (!token.isPresent) {
        throw TaskExecutionException(
            this,
            RuntimeException(
                "privateRegistry.token is required.\n" +
                "Example:\n" +
                "  privateRegistry {\n" +
                "      token = providers.environmentVariable(\"PLUGIN_REGISTRY_TOKEN\")\n" +
                "  }\n\n" +
                "Or set the environment variable:\n" +
                "  PLUGIN_REGISTRY_TOKEN=xxx ./gradlew uploadPlugin"
            )
        )
    }

    val urlValue = serverUrl.get()
    if (!urlValue.startsWith("http://") && !urlValue.startsWith("https://")) {
        throw TaskExecutionException(
            this,
            RuntimeException("privateRegistry.url must start with http:// or https://")
        )
    }

    // ... 执行上传
}
```

## 7. 命令行参数覆盖

除了 DSL 配置，支持通过命令行参数覆盖关键配置：

```bash
# --force 覆盖 forceOverwrite
./gradlew uploadPlugin --force
```

实现方式是在 Task 上声明 `@Option`：

```kotlin
// 支持 --force 命令行参数
@get:Option(option = "force", description = "Overwrite existing version")
@get:Input
val forceOption: Property<Boolean>
    get() = forceOverwrite
```

注意：`--force` 本质上是设置 `forceOverwrite` property，而非独立属性。Gradle 的 `@Option` 机制会自动将命令行参数映射到 property。

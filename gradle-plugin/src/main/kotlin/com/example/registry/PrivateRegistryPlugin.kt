package com.example.registry

import org.gradle.api.Plugin
import org.gradle.api.Project

class PrivateRegistryPlugin : Plugin<Project> {

    override fun apply(project: Project) {
        // 1. 注册 DSL extension
        val extension = project.extensions.create(
            "privateRegistry",
            PrivateRegistryExtension::class.java
        )
        extension.forceOverwrite.convention(false)
        extension.timeout.convention(120)
        extension.connectTimeout.convention(10)
        extension.retryCount.convention(0)
        extension.retryDelay.convention(3)

        // 2. 注册 uploadPlugin task
        val taskProvider = project.tasks.register(
            "uploadPlugin",
            UploadPluginTask::class.java
        )
        taskProvider.configure {
            group = "publishing"
            description = "Build and upload plugin to private registry"

            // 绑定 extension -> task property（延迟求值链）
            serverUrl.set(extension.url)
            token.set(extension.token)
            forceOverwrite.set(extension.forceOverwrite)
            requestTimeout.set(extension.timeout)
            requestConnectTimeout.set(extension.connectTimeout)
            retryCount.set(extension.retryCount)
            retryDelay.set(extension.retryDelay)

            // 依赖 buildPlugin（由 IntelliJ Gradle Plugin 注册）
            dependsOn("buildPlugin")

            // 从 build/distributions/ 获取产物
            distributionsDir.set(
                project.layout.buildDirectory.dir("distributions")
            )
        }
    }
}

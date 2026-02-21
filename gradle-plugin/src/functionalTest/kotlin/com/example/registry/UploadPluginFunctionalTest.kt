package com.example.registry

import com.sun.net.httpserver.HttpServer
import org.gradle.testkit.runner.GradleRunner
import org.gradle.testkit.runner.TaskOutcome
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.net.InetSocketAddress

class UploadPluginFunctionalTest {

    @TempDir
    lateinit var projectDir: File

    private lateinit var mockServer: HttpServer

    @BeforeEach
    fun setUp() {
        // 启动 Mock Server
        mockServer = HttpServer.create(InetSocketAddress(0), 0)
        mockServer.createContext("/api/plugins") { exchange ->
            val response = """{"id":"test","version":"1.0.0","sinceBuild":"222"}"""
                .toByteArray()
            exchange.sendResponseHeaders(201, response.size.toLong())
            exchange.responseBody.use { it.write(response) }
        }
        mockServer.start()

        // 创建测试项目结构
        val port = mockServer.address.port

        File(projectDir, "settings.gradle.kts").writeText(
            """
            rootProject.name = "test-project"
            """.trimIndent()
        )

        File(projectDir, "build.gradle.kts").writeText(
            """
            plugins {
                id("com.example.private-plugin-registry")
            }

            privateRegistry {
                url = "http://localhost:$port"
                token = "test-token"
            }

            // 模拟 buildPlugin task
            tasks.register("buildPlugin") {
                val distDir = layout.buildDirectory.dir("distributions")
                outputs.dir(distDir)
                doLast {
                    val dir = distDir.get().asFile
                    dir.mkdirs()
                    java.io.File(dir, "test-plugin-1.0.0.zip").writeBytes(
                        byteArrayOf(0x50, 0x4B, 0x03, 0x04, 0x00, 0x00)
                    )
                }
            }
            """.trimIndent()
        )
    }

    @AfterEach
    fun tearDown() {
        mockServer.stop(0)
    }

    @Test
    fun `uploadPlugin task succeeds with valid config`() {
        val result = GradleRunner.create()
            .withProjectDir(projectDir)
            .withPluginClasspath()
            .withArguments("uploadPlugin")
            .build()

        assertEquals(TaskOutcome.SUCCESS, result.task(":uploadPlugin")?.outcome)
        assertTrue(result.output.contains("Upload successful"))
    }

    @Test
    fun `uploadPlugin fails without token`() {
        File(projectDir, "build.gradle.kts").writeText(
            """
            plugins {
                id("com.example.private-plugin-registry")
            }
            privateRegistry {
                url = "http://localhost:${mockServer.address.port}"
            }
            tasks.register("buildPlugin") {
                doLast {
                    val dir = layout.buildDirectory.dir("distributions").get().asFile
                    dir.mkdirs()
                    java.io.File(dir, "test.zip").writeBytes(byteArrayOf(0x50, 0x4B))
                }
            }
            """.trimIndent()
        )

        val result = GradleRunner.create()
            .withProjectDir(projectDir)
            .withPluginClasspath()
            .withArguments("uploadPlugin")
            .buildAndFail()

        assertEquals(TaskOutcome.FAILED, result.task(":uploadPlugin")?.outcome)
        assertTrue(result.output.contains("token is required"))
    }

    @Test
    fun `uploadPlugin task applies correct group and description`() {
        val result = GradleRunner.create()
            .withProjectDir(projectDir)
            .withPluginClasspath()
            .withArguments("tasks", "--group", "publishing")
            .build()

        assertTrue(result.output.contains("uploadPlugin"))
        assertTrue(result.output.contains("Build and upload plugin to private registry"))
    }

    @Test
    fun `force flag works from command line`() {
        var receivedUri: String? = null
        mockServer.removeContext("/api/plugins")
        mockServer.createContext("/api/plugins") { exchange ->
            receivedUri = exchange.requestURI.toString()
            val resp = """{"id":"test","version":"1.0.0","sinceBuild":"222"}""".toByteArray()
            exchange.sendResponseHeaders(201, resp.size.toLong())
            exchange.responseBody.use { it.write(resp) }
        }

        GradleRunner.create()
            .withProjectDir(projectDir)
            .withPluginClasspath()
            .withArguments("uploadPlugin", "--force")
            .build()

        assertEquals("/api/plugins?force=true", receivedUri)
    }
}

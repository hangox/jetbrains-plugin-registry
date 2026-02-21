package com.example.registry

import org.gradle.testfixtures.ProjectBuilder
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Files

class UploadPluginTaskTest {

    @Test
    fun `buildUploadUrl without force`() {
        val project = ProjectBuilder.builder().build()
        val task = project.tasks.create("testTask", UploadPluginTask::class.java)

        val url = task.buildUploadUrl("https://plugins.example.com", false)
        assertEquals("https://plugins.example.com/api/plugins?force=false", url)
    }

    @Test
    fun `buildUploadUrl with force`() {
        val project = ProjectBuilder.builder().build()
        val task = project.tasks.create("testTask", UploadPluginTask::class.java)

        val url = task.buildUploadUrl("https://plugins.example.com/", true)
        assertEquals("https://plugins.example.com/api/plugins?force=true", url)
    }

    @Test
    fun `buildUploadUrl trims trailing slash`() {
        val project = ProjectBuilder.builder().build()
        val task = project.tasks.create("testTask", UploadPluginTask::class.java)

        val url = task.buildUploadUrl("https://plugins.example.com///", false)
        assertEquals("https://plugins.example.com/api/plugins?force=false", url)
    }

    @Test
    fun `extractJsonString parses response`() {
        val json = """
            {
              "id": "com.example.myplugin",
              "version": "1.2.0",
              "sinceBuild": "222",
              "untilBuild": "241.*",
              "fileSize": 1234567
            }
        """.trimIndent()

        assertEquals("com.example.myplugin", UploadPluginTask.extractJsonString(json, "id"))
        assertEquals("1.2.0", UploadPluginTask.extractJsonString(json, "version"))
        assertEquals("222", UploadPluginTask.extractJsonString(json, "sinceBuild"))
        assertEquals("241.*", UploadPluginTask.extractJsonString(json, "untilBuild"))
        assertEquals(1234567L, UploadPluginTask.extractJsonNumber(json, "fileSize"))
    }

    @Test
    fun `extractJsonString returns null for missing field`() {
        val json = """{"id": "test"}"""
        assertNull(UploadPluginTask.extractJsonString(json, "version"))
    }

    @Test
    fun `extractJsonNumber returns null for missing field`() {
        val json = """{"id": "test"}"""
        assertNull(UploadPluginTask.extractJsonNumber(json, "fileSize"))
    }

    @Test
    fun `buildMultipartBody contains correct headers`(@TempDir tempDir: File) {
        val project = ProjectBuilder.builder().build()
        val task = project.tasks.create("testTask", UploadPluginTask::class.java)

        val zipFile = File(tempDir, "test-plugin.zip").apply {
            writeBytes(byteArrayOf(0x50, 0x4B, 0x03, 0x04))
        }

        val boundary = "----TestBoundary123"
        val body = task.buildMultipartBody(boundary, zipFile)
        val bodyStr = String(body)

        assertTrue(bodyStr.contains("--$boundary"))
        assertTrue(bodyStr.contains("Content-Disposition: form-data; name=\"file\"; filename=\"test-plugin.zip\""))
        assertTrue(bodyStr.contains("Content-Type: application/zip"))
        assertTrue(bodyStr.contains("--$boundary--"))
    }

    @Test
    fun `findZipFile selects newest zip`(@TempDir tempDir: File) {
        File(tempDir, "plugin-1.0.0.zip").apply {
            writeText("old")
            setLastModified(System.currentTimeMillis() - 10000)
        }
        File(tempDir, "plugin-1.1.0.zip").apply {
            writeText("new")
            setLastModified(System.currentTimeMillis())
        }

        val zipFiles = tempDir.listFiles()?.filter { it.extension == "zip" } ?: emptyList()
        val result = zipFiles.maxByOrNull { it.lastModified() }!!
        assertEquals("plugin-1.1.0.zip", result.name)
    }

    @Test
    fun `findZipFile throws when no zip found`(@TempDir tempDir: File) {
        File(tempDir, "readme.txt").writeText("hello")

        val zipFiles = tempDir.listFiles()?.filter { it.extension == "zip" } ?: emptyList()
        assertTrue(zipFiles.isEmpty())
    }
}

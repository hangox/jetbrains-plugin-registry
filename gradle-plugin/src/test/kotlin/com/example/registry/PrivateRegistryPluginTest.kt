package com.example.registry

import org.gradle.testfixtures.ProjectBuilder
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

class PrivateRegistryPluginTest {

    @Test
    fun `plugin registers privateRegistry extension`() {
        val project = ProjectBuilder.builder().build()
        project.plugins.apply("com.example.private-plugin-registry")

        val extension = project.extensions.findByName("privateRegistry")
        assertNotNull(extension)
        assertTrue(extension is PrivateRegistryExtension)
    }

    @Test
    fun `plugin registers uploadPlugin task`() {
        val project = ProjectBuilder.builder().build()
        project.plugins.apply("com.example.private-plugin-registry")

        val task = project.tasks.findByName("uploadPlugin")
        assertNotNull(task)
        assertTrue(task is UploadPluginTask)
    }

    @Test
    fun `uploadPlugin task has correct group and description`() {
        val project = ProjectBuilder.builder().build()
        project.plugins.apply("com.example.private-plugin-registry")

        val task = project.tasks.getByName("uploadPlugin")
        assertEquals("publishing", task.group)
        assertEquals("Build and upload plugin to private registry", task.description)
    }

    @Test
    fun `extension has correct default values`() {
        val project = ProjectBuilder.builder().build()
        project.plugins.apply("com.example.private-plugin-registry")

        val extension = project.extensions.getByType(PrivateRegistryExtension::class.java)
        assertEquals(false, extension.forceOverwrite.get())
        assertEquals(120, extension.timeout.get())
        assertEquals(10, extension.connectTimeout.get())
        assertEquals(0, extension.retryCount.get())
        assertEquals(3, extension.retryDelay.get())
    }

    @Test
    fun `extension url and token are not set by default`() {
        val project = ProjectBuilder.builder().build()
        project.plugins.apply("com.example.private-plugin-registry")

        val extension = project.extensions.getByType(PrivateRegistryExtension::class.java)
        assertFalse(extension.url.isPresent)
        assertFalse(extension.token.isPresent)
    }

    @Test
    fun `extension values are passed to task`() {
        val project = ProjectBuilder.builder().build()
        project.plugins.apply("com.example.private-plugin-registry")

        val extension = project.extensions.getByType(PrivateRegistryExtension::class.java)
        extension.url.set("https://plugins.example.com")
        extension.token.set("my-token")
        extension.timeout.set(300)

        val task = project.tasks.getByName("uploadPlugin") as UploadPluginTask
        assertEquals("https://plugins.example.com", task.serverUrl.get())
        assertEquals("my-token", task.token.get())
        assertEquals(300, task.requestTimeout.get())
    }
}

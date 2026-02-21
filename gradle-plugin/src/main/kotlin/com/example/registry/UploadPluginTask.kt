package com.example.registry

import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.Internal
import org.gradle.api.tasks.Optional
import org.gradle.api.tasks.TaskAction
import org.gradle.api.tasks.TaskExecutionException
import org.gradle.api.tasks.options.Option
import java.io.ByteArrayOutputStream
import java.net.ConnectException
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.http.HttpTimeoutException
import java.nio.file.Files
import java.time.Duration

abstract class UploadPluginTask : DefaultTask() {

    @get:Input
    @get:Optional
    abstract val serverUrl: Property<String>

    @get:Internal
    abstract val token: Property<String>

    @get:Input
    @get:Option(option = "force", description = "Overwrite existing version")
    abstract val forceOverwrite: Property<Boolean>

    @get:Input
    abstract val requestTimeout: Property<Int>

    @get:Input
    abstract val requestConnectTimeout: Property<Int>

    @get:Input
    abstract val retryCount: Property<Int>

    @get:Input
    abstract val retryDelay: Property<Int>

    @get:InputDirectory
    abstract val distributionsDir: DirectoryProperty

    @TaskAction
    fun upload() {
        validateConfig()

        val zipFile = findZipFile()

        val fileSizeMb = String.format("%.1f", zipFile.length() / 1024.0 / 1024.0)
        logger.lifecycle(
            "Uploading ${zipFile.name} ($fileSizeMb MB) to ${serverUrl.get()} ..."
        )

        val response = uploadWithRetry(zipFile)

        handleResponse(response)
    }

    private fun validateConfig() {
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
    }

    private fun findZipFile(): java.io.File {
        val distDir = distributionsDir.get().asFile

        if (!distDir.exists()) {
            throw TaskExecutionException(
                this,
                RuntimeException(
                    "Distribution directory not found: ${distDir.absolutePath}\n" +
                    "Make sure 'buildPlugin' task has been executed.\n" +
                    "Run: ./gradlew buildPlugin uploadPlugin"
                )
            )
        }

        val zipFiles = distDir.listFiles()?.filter { it.extension == "zip" } ?: emptyList()

        if (zipFiles.isEmpty()) {
            throw TaskExecutionException(
                this,
                RuntimeException(
                    "No .zip file found in ${distDir.absolutePath}\n" +
                    "Expected output from 'buildPlugin' task.\n" +
                    "Files found: ${distDir.listFiles()?.map { it.name } ?: "none"}"
                )
            )
        }

        if (zipFiles.size > 1) {
            logger.warn(
                "Multiple .zip files found in ${distDir.absolutePath}:\n" +
                zipFiles.joinToString("\n") { "  - ${it.name} (${it.length()} bytes)" } +
                "\nUsing the most recently modified: ${zipFiles.maxByOrNull { it.lastModified() }?.name}"
            )
        }

        return zipFiles.maxByOrNull { it.lastModified() }!!
    }

    internal fun buildUploadUrl(baseUrl: String, force: Boolean): String {
        val base = baseUrl.trimEnd('/')
        return "$base/api/plugins?force=$force"
    }

    internal fun buildMultipartBody(boundary: String, file: java.io.File): ByteArray {
        val crlf = "\r\n"
        val output = ByteArrayOutputStream(file.length().toInt() + 1024)

        output.write("--$boundary$crlf".toByteArray())
        output.write(
            "Content-Disposition: form-data; name=\"file\"; filename=\"${file.name}\"$crlf"
                .toByteArray()
        )
        output.write("Content-Type: application/zip$crlf$crlf".toByteArray())
        output.write(Files.readAllBytes(file.toPath()))
        output.write("$crlf--$boundary--$crlf".toByteArray())

        return output.toByteArray()
    }

    internal fun sendRequest(zipFile: java.io.File): HttpResponse<String> {
        val url = buildUploadUrl(serverUrl.get(), forceOverwrite.getOrElse(false))
        val boundary = "----GradleUpload${System.nanoTime()}"
        val bodyBytes = buildMultipartBody(boundary, zipFile)

        val request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Authorization", "Bearer ${token.get()}")
            .header("Content-Type", "multipart/form-data; boundary=$boundary")
            .timeout(Duration.ofSeconds(requestTimeout.get().toLong()))
            .POST(HttpRequest.BodyPublishers.ofByteArray(bodyBytes))
            .build()

        val client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(requestConnectTimeout.get().toLong()))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build()

        return client.send(request, HttpResponse.BodyHandlers.ofString())
    }

    private fun uploadWithRetry(zipFile: java.io.File): HttpResponse<String> {
        val maxRetries = retryCount.getOrElse(0)
        var lastException: Exception? = null

        for (attempt in 0..maxRetries) {
            if (attempt > 0) {
                val delay = retryDelay.getOrElse(3)
                logger.lifecycle("Retry ${attempt}/${maxRetries} in ${delay}s ...")
                Thread.sleep(delay * 1000L)
            }

            try {
                val response = sendRequest(zipFile)

                if (response.statusCode() in 500..599 && attempt < maxRetries) {
                    logger.warn(
                        "Server error (HTTP ${response.statusCode()}), will retry..."
                    )
                    lastException = RuntimeException(
                        "HTTP ${response.statusCode()}: ${response.body()}"
                    )
                    continue
                }

                return response
            } catch (e: HttpTimeoutException) {
                logger.warn("Request timed out" + if (attempt < maxRetries) ", will retry..." else "")
                lastException = e
            } catch (e: ConnectException) {
                logger.warn(
                    "Connection failed: ${e.message}" +
                    if (attempt < maxRetries) ", will retry..." else ""
                )
                lastException = e
            } catch (e: java.io.IOException) {
                logger.warn(
                    "IO error: ${e.message}" +
                    if (attempt < maxRetries) ", will retry..." else ""
                )
                lastException = e
            }
        }

        throw TaskExecutionException(
            this,
            RuntimeException(
                "Upload failed after ${maxRetries + 1} attempt(s). " +
                "Last error: ${lastException?.message}",
                lastException
            )
        )
    }

    internal fun handleResponse(response: HttpResponse<String>) {
        when (response.statusCode()) {
            201 -> {
                logger.lifecycle("Upload successful!")
                printUploadSummary(response.body())
            }
            400 -> {
                throw TaskExecutionException(
                    this,
                    RuntimeException(
                        "Invalid plugin package.\n" +
                        "Server response: ${response.body()}\n\n" +
                        "Common causes:\n" +
                        "  - ZIP does not contain META-INF/plugin.xml\n" +
                        "  - plugin.xml missing required fields (id, name, version, since-build)\n" +
                        "  - File is not a valid ZIP archive"
                    )
                )
            }
            401 -> {
                throw TaskExecutionException(
                    this,
                    RuntimeException(
                        "Authentication failed.\n\n" +
                        "Check that PLUGIN_REGISTRY_TOKEN is set correctly:\n" +
                        "  PLUGIN_REGISTRY_TOKEN=xxx ./gradlew uploadPlugin\n\n" +
                        "Or configure in build.gradle.kts:\n" +
                        "  privateRegistry {\n" +
                        "      token = providers.environmentVariable(\"PLUGIN_REGISTRY_TOKEN\")\n" +
                        "  }"
                    )
                )
            }
            409 -> {
                throw TaskExecutionException(
                    this,
                    RuntimeException(
                        "Version already exists on the registry.\n" +
                        "Server response: ${response.body()}\n\n" +
                        "To overwrite, use --force flag:\n" +
                        "  ./gradlew uploadPlugin --force\n\n" +
                        "Or configure in build.gradle.kts:\n" +
                        "  privateRegistry {\n" +
                        "      forceOverwrite = true\n" +
                        "  }"
                    )
                )
            }
            413 -> {
                throw TaskExecutionException(
                    this,
                    RuntimeException(
                        "Plugin file is too large.\n" +
                        "Server response: ${response.body()}\n\n" +
                        "Default limit is 100 MB. Contact the registry admin to increase MAX_FILE_SIZE."
                    )
                )
            }
            else -> {
                throw TaskExecutionException(
                    this,
                    RuntimeException(
                        "Upload failed (HTTP ${response.statusCode()}).\n" +
                        "Server response: ${response.body()}"
                    )
                )
            }
        }
    }

    private fun printUploadSummary(responseBody: String) {
        val id = extractJsonString(responseBody, "id")
        val version = extractJsonString(responseBody, "version")
        val sinceBuild = extractJsonString(responseBody, "sinceBuild")
        val untilBuild = extractJsonString(responseBody, "untilBuild")
        val fileSize = extractJsonNumber(responseBody, "fileSize")

        if (id != null && version != null) {
            logger.lifecycle("  Plugin: $id v$version")
        }
        if (sinceBuild != null) {
            logger.lifecycle("  since-build: $sinceBuild")
        }
        if (untilBuild != null) {
            logger.lifecycle("  until-build: $untilBuild")
        }
        if (fileSize != null) {
            val sizeMb = String.format("%.1f", fileSize / 1024.0 / 1024.0)
            logger.lifecycle("  file size: $sizeMb MB")
        }
    }

    companion object {
        internal fun extractJsonString(json: String, key: String): String? {
            return Regex("\"$key\"\\s*:\\s*\"([^\"]+)\"").find(json)?.groupValues?.get(1)
        }

        internal fun extractJsonNumber(json: String, key: String): Long? {
            return Regex("\"$key\"\\s*:\\s*(\\d+)").find(json)?.groupValues?.get(1)?.toLongOrNull()
        }
    }
}

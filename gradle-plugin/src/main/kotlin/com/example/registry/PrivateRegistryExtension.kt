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

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.25"
    id("org.jetbrains.intellij.platform") version "2.2.1"
    id("com.github.hangox.private-plugin-registry") version "1.0.0"
}

group = "com.example"
version = "1.0.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity("2024.1")
        instrumentationTools()
    }
}

intellijPlatform {
    buildSearchableOptions = false
}

privateRegistry {
    url = providers.environmentVariable("REGISTRY_URL")
        .orElse("http://localhost:3000")
    token = providers.environmentVariable("REGISTRY_TOKEN")
        .orElse("test-token")
    forceOverwrite = true
}

kotlin {
    jvmToolchain(17)
}

plugins {
    `kotlin-dsl`
    `maven-publish`
    `java-gradle-plugin`
}

group = "com.example"
version = "1.0.0"

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    testImplementation(gradleTestKit())
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.0")
    testImplementation("org.junit.jupiter:junit-jupiter-api:5.11.0")
    testRuntimeOnly("org.junit.jupiter:junit-jupiter-engine:5.11.0")
}

tasks.test {
    useJUnitPlatform()
}

gradlePlugin {
    plugins {
        create("privateRegistry") {
            id = "com.example.private-plugin-registry"
            implementationClass = "com.example.registry.PrivateRegistryPlugin"
            displayName = "Private Plugin Registry"
            description = "Upload JetBrains plugins to a private registry"
        }
    }
}

sourceSets {
    create("functionalTest") {
        compileClasspath += sourceSets.main.get().output
        runtimeClasspath += sourceSets.main.get().output
    }
}

val functionalTestImplementation by configurations.getting {
    extendsFrom(configurations.testImplementation.get())
}

val functionalTestRuntimeOnly by configurations.getting {
    extendsFrom(configurations.testRuntimeOnly.get())
}

tasks.register<Test>("functionalTest") {
    testClassesDirs = sourceSets["functionalTest"].output.classesDirs
    classpath = sourceSets["functionalTest"].runtimeClasspath
    useJUnitPlatform()
}

publishing {
    repositories {
        maven {
            name = "PrivateRepo"
            url = uri(
                if (version.toString().endsWith("-SNAPSHOT"))
                    "https://maven.example.com/snapshots"
                else
                    "https://maven.example.com/releases"
            )
            credentials {
                username = providers.environmentVariable("MAVEN_USER")
                    .orElse(providers.gradleProperty("maven.user"))
                    .orNull
                password = providers.environmentVariable("MAVEN_PASSWORD")
                    .orElse(providers.gradleProperty("maven.password"))
                    .orNull
            }
        }
    }
}

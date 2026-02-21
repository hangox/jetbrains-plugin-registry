# CI/CD 集成

## 1. 基本原则

- Token 通过 CI 变量注入，不硬编码到代码中
- 仅在 Tag 推送时触发发布，避免每次 commit 都上传
- 发布前先运行测试，确保插件包完整
- 使用 `--no-daemon` 减少 CI 内存占用

## 2. GitLab CI

### 2.1 基础配置

```yaml
# .gitlab-ci.yml
stages:
  - build
  - test
  - publish

variables:
  GRADLE_OPTS: "-Dorg.gradle.daemon=false -Xmx512m"

build:
  stage: build
  image: gradle:8.12-jdk17
  script:
    - ./gradlew buildPlugin
  artifacts:
    paths:
      - build/distributions/*.zip
    expire_in: 1 hour

test:
  stage: test
  image: gradle:8.12-jdk17
  script:
    - ./gradlew check

publish-plugin:
  stage: publish
  image: gradle:8.12-jdk17
  variables:
    PLUGIN_REGISTRY_TOKEN: $PLUGIN_REGISTRY_TOKEN       # 从 CI/CD Variables 注入
    PLUGIN_REGISTRY_URL: $PLUGIN_REGISTRY_URL
  script:
    - ./gradlew uploadPlugin
  only:
    - tags                                               # 仅 Tag 触发
  dependencies:
    - build
```

### 2.2 多环境发布

```yaml
# 发布到 staging
publish-staging:
  stage: publish
  image: gradle:8.12-jdk17
  variables:
    PLUGIN_REGISTRY_TOKEN: $STAGING_REGISTRY_TOKEN
    PLUGIN_REGISTRY_URL: "https://plugins-staging.example.com"
  script:
    - ./gradlew uploadPlugin --force    # staging 总是覆盖
  only:
    - develop
    - merge_requests

# 发布到 production
publish-production:
  stage: publish
  image: gradle:8.12-jdk17
  variables:
    PLUGIN_REGISTRY_TOKEN: $PROD_REGISTRY_TOKEN
    PLUGIN_REGISTRY_URL: "https://plugins.example.com"
  script:
    - ./gradlew uploadPlugin
  only:
    - tags
  when: manual                          # 生产环境手动确认
```

## 3. GitHub Actions

### 3.1 基础配置

```yaml
# .github/workflows/publish-plugin.yml
name: Publish Plugin

on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          cache-read-only: false

      - name: Build plugin
        run: ./gradlew buildPlugin

      - name: Run tests
        run: ./gradlew check

      - name: Upload to registry
        env:
          PLUGIN_REGISTRY_TOKEN: ${{ secrets.PLUGIN_REGISTRY_TOKEN }}
        run: ./gradlew uploadPlugin
```

### 3.2 带 Release 附件

```yaml
name: Release Plugin

on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17

      - uses: gradle/actions/setup-gradle@v4

      - name: Build & Upload
        env:
          PLUGIN_REGISTRY_TOKEN: ${{ secrets.PLUGIN_REGISTRY_TOKEN }}
        run: |
          ./gradlew buildPlugin
          ./gradlew uploadPlugin

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: build/distributions/*.zip
          generate_release_notes: true
```

## 4. Jenkins

### 4.1 Declarative Pipeline

```groovy
// Jenkinsfile
pipeline {
    agent {
        docker {
            image 'gradle:8.12-jdk17'
            args '-v gradle-cache:/home/gradle/.gradle'
        }
    }

    environment {
        PLUGIN_REGISTRY_TOKEN = credentials('plugin-registry-token')
    }

    stages {
        stage('Build') {
            steps {
                sh './gradlew buildPlugin'
            }
        }

        stage('Test') {
            steps {
                sh './gradlew check'
            }
            post {
                always {
                    junit 'build/test-results/**/*.xml'
                }
            }
        }

        stage('Publish') {
            when {
                buildingTag()
            }
            steps {
                sh './gradlew uploadPlugin'
            }
        }
    }

    post {
        success {
            archiveArtifacts artifacts: 'build/distributions/*.zip', fingerprint: true
        }
    }
}
```

## 5. 通用 CI 技巧

### 5.1 Gradle 缓存加速

```yaml
# GitHub Actions 使用 gradle/actions/setup-gradle 自动缓存
# GitLab CI 使用 cache key
cache:
  key: gradle-${CI_COMMIT_REF_SLUG}
  paths:
    - .gradle/
    - build/
  policy: pull-push
```

### 5.2 Token 安全

| CI 平台 | 配置位置 | 说明 |
|---------|---------|------|
| GitLab | Settings → CI/CD → Variables | 勾选 Masked + Protected |
| GitHub | Settings → Secrets → Actions | 选择 Repository secrets |
| Jenkins | Credentials → Secret text | 使用 `credentials()` 绑定 |

**关键安全要求：**

- Token 值必须标记为 Masked（不在日志中显示）
- Token 变量应标记为 Protected（仅 protected branch/tag 可用）
- 不要在 `build.gradle.kts` 中硬编码 Token

### 5.3 发布条件建议

| 触发条件 | 环境 | `--force` | 说明 |
|---------|------|-----------|------|
| Tag 推送 `v*` | Production | 否 | 正式发布 |
| 合并到 develop | Staging | 是 | 持续验证 |
| 手动触发 | 任意 | 可选 | 紧急修复 |

### 5.4 版本号与 Tag 关联

推荐将 `plugin.xml` 中的 `<version>` 与 Git Tag 保持一致：

```kotlin
// build.gradle.kts
version = System.getenv("CI_COMMIT_TAG")?.removePrefix("v") ?: "0.0.0-dev"
```

```bash
# 发布流程
git tag v1.2.0
git push origin v1.2.0
# CI 自动触发：buildPlugin(version=1.2.0) → uploadPlugin
```

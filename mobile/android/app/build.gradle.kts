import java.net.URI
import java.util.Properties

plugins {
    id("com.android.application")
}

fun readProperties(path: String) = Properties().apply {
    val source = rootProject.file(path)
    if (source.exists()) source.inputStream().use { load(it) }
}

val production = readProperties("config/production.properties")
val local = readProperties("local.properties")
// CI overrides local development settings. Public defaults make a clean clone usable.
fun configured(name: String): String =
    (System.getenv(name) ?: local.getProperty(name) ?: production.getProperty(name) ?: "").trim()

val projectRef = production.getProperty("GENAI_PROJECT_REF", "")
val agentUrl = configured("GENAI_DEVICE_AGENT_URL")
val publishableKey = configured("GENAI_PUBLISHABLE_KEY")
val expectedUrl = "https://$projectRef.supabase.co/functions/v1/device-agent"
check(projectRef.matches(Regex("[a-z]{20}"))) { "Missing production project ref" }
check(agentUrl == expectedUrl && URI(agentUrl).scheme == "https") {
    "GENAI_DEVICE_AGENT_URL must point to the pinned production device-agent"
}
check(publishableKey.matches(Regex("sb_publishable_[A-Za-z0-9_-]{20,160}"))
        && !publishableKey.contains("REPLACE") && !publishableKey.contains("PLACEHOLDER")) {
    "Missing/invalid GENAI_PUBLISHABLE_KEY. Never use a service_role or secret key."
}

val buildNumber = (System.getenv("GENAI_VERSION_CODE") ?: "2").toIntOrNull()
check(buildNumber != null && buildNumber in 2..2100000000) { "Invalid GENAI_VERSION_CODE" }
val buildVersion = System.getenv("GENAI_VERSION_NAME") ?: "0.2.0"
check(buildVersion.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+"))) { "Invalid GENAI_VERSION_NAME" }
val buildSha = System.getenv("GENAI_BUILD_SHA") ?: "local"
check(buildSha == "local" || buildSha.matches(Regex("[0-9a-f]{40}"))) { "Invalid GENAI_BUILD_SHA" }

val signingNames = listOf("ANDROID_KEYSTORE_PATH", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD")
val signing = signingNames.associateWith { System.getenv(it).orEmpty() }
val hasReleaseSigning = signing.values.all { it.isNotBlank() }
check(signing.values.all { it.isBlank() } || hasReleaseSigning) {
    "Release signing requires all four ANDROID_KEYSTORE_* / ANDROID_KEY_* values"
}

android {
    namespace = "app.genaifamily.device"
    compileSdk = 36
    defaultConfig {
        applicationId = "app.genaifamily.device"
        minSdk = 26
        targetSdk = 36
        versionCode = buildNumber!!
        versionName = buildVersion
        buildConfigField("String", "DEVICE_AGENT_URL", "\"$agentUrl\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"$publishableKey\"")
        buildConfigField("String", "SUPABASE_PROJECT_REF", "\"$projectRef\"")
        buildConfigField("String", "DEPLOYMENT_ENVIRONMENT", "\"production\"")
        buildConfigField("String", "BUILD_SHA", "\"$buildSha\"")
    }
    if (hasReleaseSigning) {
        signingConfigs.create("production") {
            storeFile = file(signing.getValue("ANDROID_KEYSTORE_PATH"))
            storePassword = signing.getValue("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = signing.getValue("ANDROID_KEY_ALIAS")
            keyPassword = signing.getValue("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        getByName("debug") {
            // Pilot builds cannot replace the installed production app.
            applicationIdSuffix = ".pilot"
            versionNameSuffix = "-pilot"
        }
        getByName("release") {
            isDebuggable = false
            if (hasReleaseSigning) signingConfig = signingConfigs.getByName("production")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// Never publish an unsigned release or silently sign a release with a debug key.
gradle.taskGraph.whenReady {
    if (allTasks.any { it.name in listOf("assembleRelease", "bundleRelease", "packageRelease") }) {
        check(hasReleaseSigning) { "Release signing is missing. Build assembleDebug for a PILOT APK." }
    }
}

tasks.register("verifyProductionConfiguration") {
    doLast { println("Configuration OK: production / $projectRef / ${buildVersion}") }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}

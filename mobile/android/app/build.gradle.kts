import java.util.Properties

plugins {
    id("com.android.application")
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use(::load)
}

fun configuredValue(name: String): String =
    localProperties.getProperty(name, System.getenv(name) ?: "")

android {
    namespace = "app.genaifamily.device"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.genaifamily.device"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "DEVICE_AGENT_URL", "\"${configuredValue("GENAI_DEVICE_AGENT_URL")}\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"${configuredValue("GENAI_PUBLISHABLE_KEY")}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

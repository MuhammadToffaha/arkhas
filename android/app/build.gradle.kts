plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// CI sets GITHUB_RUN_NUMBER -> every build gets a higher versionCode, so it installs over the old one.
val runNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "eg.arkhas.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "eg.arkhas.app"
        minSdk = 26
        targetSdk = 35
        versionCode = runNumber
        versionName = "1.0.$runNumber"
        // GitHub repo used for the in-app "new version" check
        buildConfigField("String", "UPDATE_REPO", "\"MuhammadToffaha/arkhas\"")
        // Telegram bot token comes from the GitHub secret TELEGRAM_BOT_TOKEN at build time (never stored in the repo)
        buildConfigField("String", "TG_TOKEN", "\"${(System.getenv("ARKHAS_TG_TOKEN") ?: "").replace("\"", "")}\"")
    }

    signingConfigs {
        create("release") {
            // Same key on every build = updates install without uninstalling.
            val ks = System.getenv("ARKHAS_KEYSTORE")
            if (ks != null && file(ks).exists()) {
                storeFile = file(ks)
                storePassword = System.getenv("ARKHAS_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ARKHAS_KEY_ALIAS") ?: "arkhas"
                keyPassword = System.getenv("ARKHAS_KEY_PASSWORD") ?: System.getenv("ARKHAS_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (System.getenv("ARKHAS_KEYSTORE") != null)
                signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

// Bundle <repo>/web (UI + engine + store rules) into the APK as assets/web.
// At runtime the app also pulls the newest copy of these files from GitHub.
val webAssets = layout.buildDirectory.dir("generated/webassets")
val copyWeb by tasks.registering(Copy::class) {
    from(rootProject.file("../web")) { include("*.html", "*.js", "*.json", "*.svg") }
    into(webAssets.map { it.dir("web") })
}
android.sourceSets.getByName("main").assets.srcDir(webAssets)
tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// CI passes the GitHub Actions run number -> version 1.0.N (same as all Toffaha apps).
// The in-app updater compares this with the latest GitHub Release tag (vN).
val buildNumber = (System.getenv("VERSION_CODE") ?: "1").toInt()
val keyPass = System.getenv("KEYSTORE_PASSWORD") ?: "zakaa-app-2026"

android {
    namespace = "com.toffaha.zakaa"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.toffaha.zakaa"
        minSdk = 26
        targetSdk = 35
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
    }

    signingConfigs {
        create("release") {
            storeFile = file("release.jks")
            storePassword = keyPass
            keyAlias = "zakaa"
            keyPassword = keyPass
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
        debug { signingConfig = signingConfigs.getByName("release") }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
    lint { abortOnError = false; checkReleaseBuilds = false }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}

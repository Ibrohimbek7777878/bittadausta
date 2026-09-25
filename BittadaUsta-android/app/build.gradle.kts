import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}
fun signProp(name: String): String? =
    keystoreProps.getProperty(name) ?: (project.findProperty(name) as String?)

val storeFilePath: String? = signProp("BITTADA_STORE_FILE")
val storePwd: String? = signProp("BITTADA_STORE_PASSWORD")
val keyAliasName: String? = signProp("BITTADA_KEY_ALIAS")
val keyPwd: String? = signProp("BITTADA_KEY_PASSWORD")
val hasSigning: Boolean = storeFilePath != null && storePwd != null &&
    keyAliasName != null && keyPwd != null &&
    rootProject.file(storeFilePath).exists()

android {
    namespace = "com.bittada.bittadausta"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.bittada.bittadausta"
        minSdk = 26
        targetSdk = 36
        versionCode = 60
        versionName = "1.60"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    if (hasSigning) {
        signingConfigs {
            create("release") {
                storeFile = rootProject.file(storeFilePath!!)
                storePassword = storePwd
                keyAlias = keyAliasName
                keyPassword = keyPwd
                enableV1Signing = true
                enableV2Signing = true
            }
        }
    }

    buildTypes {
        release {
            if (hasSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

gradle.taskGraph.whenReady {
    val isReleaseBuild = allTasks.any {
        it.name.contains("Release") && (it.name.startsWith("bundle") || it.name.startsWith("assemble"))
    }
    if (isReleaseBuild && !hasSigning) {
        throw GradleException(
            "Release imzosi sozlanmagan!\n" +
                "  Kerak: keystore.properties fayli va bittada-upload.jks\n" +
                "  Sinov uchun: ./gradlew assembleDebug"
        )
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.material)
    implementation("androidx.browser:browser:1.8.0")
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}

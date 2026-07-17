plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.22"
    id("org.jetbrains.intellij") version "1.17.2"
}

group = "dev.sigtrace"
version = "1.0.0"

repositories {
    mavenCentral()
}

dependencies {
    // Ktor for WebSocket server
    implementation("io.ktor:ktor-server-core:2.3.7")
    implementation("io.ktor:ktor-server-netty:2.3.7")
    implementation("io.ktor:ktor-server-websockets:2.3.7")
    implementation("io.ktor:ktor-server-content-negotiation:2.3.7")
    implementation("io.ktor:ktor-serialization-jackson:2.3.7")
}

intellij {
    version.set("2023.2.5")
    type.set("IU") // IntelliJ IDEA Ultimate (supports JS/TS features needed for WebStorm/IDEA)
    plugins.set(listOf("JavaScript", "com.intellij.css"))
}

tasks {
    patchPluginXml {
        sinceBuild.set("232")
        untilBuild.set("241.*")
    }

    compileKotlin {
        kotlinOptions {
            jvmTarget = "17"
        }
    }

    compileJava {
        sourceCompatibility = "17"
        targetCompatibility = "17"
    }
}

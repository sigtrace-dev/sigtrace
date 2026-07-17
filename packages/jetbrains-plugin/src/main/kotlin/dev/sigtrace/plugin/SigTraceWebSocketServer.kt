package dev.sigtrace.plugin

import io.ktor.serialization.jackson.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.channels.ClosedSendChannelException
import java.net.BindException
import java.time.Duration
import java.util.concurrent.CopyOnWriteArraySet

object SigTraceWebSocketServer {
    private var server: NettyApplicationEngine? = null
    private val activeVisualizerSessions = CopyOnWriteArraySet<DefaultWebSocketSession>()

    fun start(port: Int = 8420) {
        if (server != null) return

        try {
            server = embeddedServer(Netty, port = port) {
                install(WebSockets) {
                    pingPeriod = Duration.ofSeconds(15)
                    timeout = Duration.ofSeconds(15)
                    maxFrameSize = Long.MAX_VALUE
                    masking = false
                }
                
                install(ContentNegotiation) {
                    jackson()
                }

                routing {
                    webSocket("/") {
                        var isVisualizer = false
                        try {
                            for (frame in incoming) {
                                if (frame is Frame.Text) {
                                    val text = frame.readText()
                                    
                                    // Handle visualizer connections
                                    if (text.contains("register-visualizer")) {
                                        isVisualizer = true
                                        activeVisualizerSessions.add(this)
                                        
                                        // Push cache to newly connected visualizer
                                        for (node in SigTraceState.cachedSignals.values) {
                                            send(Frame.Text(node))
                                        }
                                        for (event in SigTraceState.eventBuffer) {
                                            send(Frame.Text(event))
                                        }
                                        continue
                                    }

                                    // Handle browser/app trace telemetry events
                                    SigTraceState.handleEvent(text)
                                    
                                    // Broadcast to visualizer webviews
                                    broadcastToVisualizers(text)
                                }
                            }
                        } catch (e: ClosedSendChannelException) {
                            // connection closed
                        } catch (e: Exception) {
                            e.printStackTrace()
                        } finally {
                            if (isVisualizer) {
                                activeVisualizerSessions.remove(this)
                            }
                        }
                    }
                }
            }.start(wait = false)
            println("SigTrace: WS Server started successfully on port $port")
        } catch (e: BindException) {
            println("SigTrace: Port $port is in use, SigTrace will act in client visualizer mode.")
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun broadcastToVisualizers(message: String) {
        for (session in activeVisualizerSessions) {
            try {
                session.send(Frame.Text(message))
            } catch (e: Exception) {
                activeVisualizerSessions.remove(session)
            }
        }
    }

    fun stop() {
        server?.stop(1000, 2000)
        server = null
    }
}

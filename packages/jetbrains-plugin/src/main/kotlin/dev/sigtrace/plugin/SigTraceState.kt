package dev.sigtrace.plugin

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

object SigTraceState {
    val cachedSignals = ConcurrentHashMap<String, String>()
    val eventBuffer = CopyOnWriteArrayList<String>()
    
    // filePath -> line -> metric
    val nodeMetrics = ConcurrentHashMap<String, ConcurrentHashMap<Int, MetricObj>>()
    
    private val listeners = CopyOnWriteArrayList<(String) -> Unit>()
    private val mapper = jacksonObjectMapper()

    data class MetricObj(
        val id: String,
        val name: String,
        var epoch: Int = 0,
        var duration: Double = 0.0,
        var isHotspot: Boolean = false
    )

    fun registerListener(listener: (String) -> Unit) {
        listeners.add(listener)
    }

    fun removeListener(listener: (String) -> Unit) {
        listeners.remove(listener)
    }

    fun clear() {
        cachedSignals.clear()
        eventBuffer.clear()
        nodeMetrics.clear()
        notifyListeners("{\"command\":\"clearMetrics\"}")
    }

    fun handleEvent(jsonStr: String) {
        try {
            val node = mapper.readTree(jsonStr)
            val type = node.get("type")?.asText() ?: return
            val id = node.get("id")?.asText()

            if (type == "register" && id != null) {
                cachedSignals[id] = jsonStr
                
                // Parse file/line metrics
                val loc = node.get("loc")
                if (loc != null) {
                    val file = loc.get("file")?.asText()
                    val line = loc.get("line")?.asInt()
                    val name = node.get("name")?.asText() ?: ""
                    if (file != null && line != null) {
                        val fileMap = nodeMetrics.computeIfAbsent(file) { ConcurrentHashMap() }
                        fileMap[line] = MetricObj(id = id, name = name)
                    }
                }
            } else if ((type == "write" || type == "update") && id != null) {
                // Update event buffer
                eventBuffer.add(jsonStr)
                if (eventBuffer.size > 200) {
                    eventBuffer.removeAt(0)
                }

                // Update metrics for InlayHints
                val duration = node.get("duration")?.asDouble()
                for ((_, lineMap) in nodeMetrics) {
                    for ((_, metric) in lineMap) {
                        if (metric.id == id) {
                            metric.epoch++
                            if (duration != null) {
                                metric.duration = duration
                                if (duration > 2.0) {
                                    metric.isHotspot = true
                                }
                            }
                            break
                        }
                    }
                }
            }

            // Forward to webview listeners
            notifyListeners(jsonStr)
        } catch (e: Exception) {
            System.err.println("SigTraceState: Error parsing event: ${e.message}")
        }
    }

    private fun notifyListeners(message: String) {
        for (listener in listeners) {
            try {
                listener(message)
            } catch (e: Exception) {
                // ignore
            }
        }
    }
}

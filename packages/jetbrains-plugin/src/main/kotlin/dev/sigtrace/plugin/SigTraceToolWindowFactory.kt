package dev.sigtrace.plugin

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefClient
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.callback.CefQueryCallback
import org.cef.handler.CefLoadHandler
import org.cef.handler.CefLoadHandlerAdapter
import org.cef.handler.CefMessageRouterHandlerAdapter
import org.cef.handler.CefMessageRouterHandler
import org.cef.network.CefRequest
import org.cef.browser.CefMessageRouter
import java.io.File
import java.nio.file.Files
import java.nio.file.Paths

class SigTraceToolWindowFactory : ToolWindowFactory {

    private val mapper = jacksonObjectMapper()

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        // Start Ktor WebSocket Server
        SigTraceWebSocketServer.start()

        val browser = JBCefBrowser()
        val client = browser.jbCefClient.cefClient

        // Inject VS Code API mock in JS so app.js runs unmodified
        val mockCode = """
            window.acquireVsCodeApi = function() {
                return {
                    postMessage: function(message) {
                        window.cefQuery({
                            request: JSON.stringify(message),
                            onSuccess: function(response) {},
                            onFailure: function(error_code, error_message) {}
                        });
                    }
                };
            };
        """.trimIndent()

        // Handle load events to inject mock script and send cached events
        browser.jbCefClient.addLoadHandler(object : CefLoadHandlerAdapter() {
            override fun onLoadStart(browser: CefBrowser?, frame: CefFrame?, transitionType: CefRequest.TransitionType?) {
                frame?.executeJavaScript(mockCode, frame.url, 0)
            }

            override fun onLoadEnd(browser: CefBrowser?, frame: CefFrame?, httpStatusCode: Int) {
                // Once loaded, send all cached signals and event buffer
                sendToWebview(browser, "ready")
            }
        }, browser.cefBrowser)

        // Setup message router to intercept postMessage queries
        val router = CefMessageRouter.create()
        router.addHandler(object : CefMessageRouterHandlerAdapter() {
            override fun onQuery(
                browser: CefBrowser?,
                frame: CefFrame?,
                queryId: Long,
                request: String?,
                persistent: Boolean,
                callback: CefQueryCallback?
            ): Boolean {
                if (request == null) return false
                
                try {
                    val msg = mapper.readTree(request)
                    val command = msg.get("command")?.asText() ?: return false
                    
                    when (command) {
                        "ready" -> {
                            sendToWebview(browser, "ready")
                        }
                        "clearMetrics" -> {
                            SigTraceState.clear()
                        }
                        "openFile" -> {
                            val filePath = msg.get("file")?.asText()
                            val line = msg.get("line")?.asInt() ?: 1
                            val column = msg.get("column")?.asInt() ?: 0
                            
                            if (filePath != null) {
                                openFileInEditor(project, filePath, line, column)
                            }
                        }
                    }
                    callback?.success("")
                    return true
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                return false
            }
        }, true)
        
        client.addMessageRouter(router)

        // Listen for new updates from WebSocket server to push to webview
        val stateListener: (String) -> Unit = { jsonStr ->
            ApplicationManager.getApplication().invokeLater {
                browser.cefBrowser.executeJavaScript(
                    "window.postMessage($jsonStr, '*');",
                    browser.cefBrowser.url,
                    0
                )
            }
        }
        SigTraceState.registerListener(stateListener)

        // Read index.html from resource and inject JS/D3 links
        val htmlContent = loadWebviewHtml(project)
        browser.loadHTML(htmlContent)

        // Add to tool window
        val contentFactory = ContentFactory.getInstance()
        val content = contentFactory.createContent(browser.component, "", false)
        toolWindow.contentManager.addContent(content)
        
        // Remove listener on tool window dispose to prevent leaks
        toolWindow.contentManager.addContentManagerListener(object : com.intellij.ui.content.ContentManagerListener {
            override fun contentRemoved(event: com.intellij.ui.content.ContentManagerEvent) {
                SigTraceState.removeListener(stateListener)
            }
        })
    }

    private fun sendToWebview(browser: CefBrowser?, command: String) {
        if (browser == null) return
        
        if (command == "ready") {
            // Push active signals
            for (node in SigTraceState.cachedSignals.values) {
                browser.executeJavaScript("window.postMessage($node, '*');", browser.url, 0)
            }
            // Push event buffer
            for (event in SigTraceState.eventBuffer) {
                browser.executeJavaScript("window.postMessage($event, '*');", browser.url, 0)
            }
        }
    }

    private fun openFileInEditor(project: Project, filePath: String, line: Int, column: Int) {
        ApplicationManager.getApplication().invokeLater {
            var pathString = filePath
            if (pathString.startsWith("http://") || pathString.startsWith("https://")) {
                try {
                    val url = java.net.URL(pathString)
                    pathString = url.path
                } catch (e: Exception) {
                    // ignore
                }
            }

            // Resolve file relative to project root if it is a relative path
            val baseDir = project.basePath
            var resolvedFile = File(pathString)
            if (!resolvedFile.exists() && baseDir != null) {
                resolvedFile = File(baseDir, pathString)
            }

            val virtualFile = LocalFileSystem.getInstance().findFileByIoFile(resolvedFile)
            if (virtualFile != null) {
                val descriptor = OpenFileDescriptor(project, virtualFile, line - 1, column)
                FileEditorManager.getInstance(project).openTextEditor(descriptor, true)
            }
        }
    }

    private fun loadWebviewHtml(project: Project): String {
        return try {
            val htmlStream = javaClass.getResourceAsStream("/webview/index.html")
            val appJsText = javaClass.getResource("/webview/app.js")?.readText() ?: ""
            val d3JsText = javaClass.getResource("/webview/d3.min.js")?.readText() ?: ""
            
            var html = htmlStream?.bufferedReader()?.use { it.readText() } ?: "<html><body>SigTrace Webview Failed to Load</body></html>"
            
            // Inline D3 and app.js scripts for offline JCEF load compatibility
            html = html.replace("<script src=\"d3.min.js\"></script>", "<script>$d3JsText</script>")
            html = html.replace("<script src=\"app.js\"></script>", "<script>$appJsText</script>")
            html
        } catch (e: Exception) {
            e.printStackTrace()
            "<html><body>SigTrace Webview Failed to Load: ${e.message}</body></html>"
        }
    }
}

package dev.sigtrace.plugin

import com.intellij.codeInsight.hints.declarative.*
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.refactoring.suggested.startOffset
import com.intellij.psi.util.PsiTreeUtil

class SigTraceInlayProvider : InlayHintsProvider {

    override fun createCollector(file: PsiFile, editor: Editor): InlayHintsCollector? {
        val virtualFile = file.virtualFile ?: return null
        val filePath = virtualFile.path
        
        // Find metrics for this file
        val fileMetrics = SigTraceState.nodeMetrics[filePath] ?: return null
        if (fileMetrics.isEmpty()) return null

        return object : SharedBypassCollector {
            override fun collectFromElement(element: PsiElement, sink: InlayTreeSink) {
                // Look for signal/computed creators or invocation expressions
                val text = element.text
                if (text.startsWith("signal") || text.startsWith("computed") || 
                    text.startsWith("ref") || text.startsWith("createSignal") || 
                    text.startsWith("createMemo")) {
                    
                    val document = editor.document
                    val line = document.getLineNumber(element.startOffset) + 1 // 1-indexed
                    val metric = fileMetrics[line]
                    
                    if (metric != null) {
                        var label = "SigTrace: ${metric.epoch} updates"
                        if (metric.duration > 0) {
                            label += " | ${String.format("%.2f", metric.duration)}ms"
                        }
                        if (metric.isHotspot) {
                            label += " 🚨 HOTSPOT"
                        }

                        // Add block/above-line inlay hint
                        sink.addBlockPlaceholder(
                            element.startOffset,
                            relativity = BlockInlayRelativity.ABOVE,
                            showAbove = true,
                            priority = 0,
                            presentation = {
                                text(label)
                            }
                        )
                    }
                }
            }
        }
    }
}

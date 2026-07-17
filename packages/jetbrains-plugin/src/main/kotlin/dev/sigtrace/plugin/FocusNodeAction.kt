package dev.sigtrace.plugin

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.wm.ToolWindowManager

class FocusNodeAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val toolWindow = ToolWindowManager.getInstance(project).getToolWindow("SigTrace") ?: return
        
        // Show tool window if hidden
        if (!toolWindow.isVisible) {
            toolWindow.show(null)
        }
        
        // Custom actions can be piped here if needed
    }
}

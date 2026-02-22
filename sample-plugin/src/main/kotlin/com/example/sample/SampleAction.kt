package com.example.sample

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages

class SampleAction : AnAction("Sample Action") {
    override fun actionPerformed(e: AnActionEvent) {
        Messages.showInfoMessage("Hello from Sample Plugin!", "Sample")
    }
}

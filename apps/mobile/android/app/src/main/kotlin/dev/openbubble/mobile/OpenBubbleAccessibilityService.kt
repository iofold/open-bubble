package dev.openbubble.mobile

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.AccessibilityService.TakeScreenshotCallback
import android.accessibilityservice.AccessibilityService.ScreenshotResult
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import java.io.File
import java.time.Instant
import java.util.ArrayDeque
import java.util.concurrent.Executor

class OpenBubbleAccessibilityService : AccessibilityService() {
    private lateinit var overlayController: BubbleOverlayController
    private val callbackExecutor = Executor { runnable ->
        Thread(runnable, "open-bubble-capture").start()
    }

    private var captureInFlight = false

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        overlayController = BubbleOverlayController(this)

        OpenBubbleEventHub.emit(
            type = "service.connected",
            message = "Open Bubble accessibility runtime connected.",
        )
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // The MVP does not stream every event into Flutter. It only resolves
        // fresh snapshots when explicitly asked to inspect or capture.
    }

    override fun onInterrupt() {
        OpenBubbleEventHub.emit(
            type = "service.interrupted",
            message = "Accessibility service interrupted.",
        )
    }

    override fun onUnbind(intent: Intent?): Boolean {
        overlayController.hideBubble()
        instance = null
        OpenBubbleEventHub.emit(
            type = "service.disconnected",
            message = "Open Bubble accessibility runtime disconnected.",
        )
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        if (::overlayController.isInitialized) {
            overlayController.hideBubble()
        }
        instance = null
        super.onDestroy()
    }

    fun showBubble(): Boolean {
        if (!::overlayController.isInitialized) {
            return false
        }

        overlayController.showBubble()
        return true
    }

    fun hideBubble(): Boolean {
        if (!::overlayController.isInitialized) {
            return false
        }

        overlayController.hideBubble()
        return true
    }

    fun isBubbleVisible(): Boolean {
        return ::overlayController.isInitialized && overlayController.isVisible()
    }

    fun inspectActiveWindow(): Map<String, Any?> {
        val root = rootInActiveWindow ?: return emptyMap()
        val snapshot = buildWindowSnapshot(root)

        OpenBubbleEventHub.emit(
            type = "inspection.ready",
            message = "Active window inspected.",
            payload = snapshot,
        )

        return snapshot
    }

    fun fillFocusedField(text: String): Map<String, Any?> {
        val root = rootInActiveWindow
            ?: return fillFailure("No active window is available.", "no_window")
        val target = findEditableNode(root)
            ?: return fillFailure("No focused editable field was found.", "no_target")

        if (supportsAction(target, AccessibilityNodeInfo.ACTION_SET_TEXT)) {
            val arguments = Bundle().apply {
                putCharSequence(
                    AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                    text,
                )
            }
            val success = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
            return emitFillResult(success, if (success) "set_text" else "set_text_failed")
        }

        val clipboard =
            getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Open Bubble", text))

        target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        val pasted =
            if (supportsAction(target, AccessibilityNodeInfo.ACTION_PASTE)) {
                target.performAction(AccessibilityNodeInfo.ACTION_PASTE)
            } else {
                false
            }

        return emitFillResult(pasted, if (pasted) "paste" else "paste_failed")
    }

    fun captureActiveWindow(requestId: String = newRequestId()): Map<String, Any?> {
        if (captureInFlight) {
            return mapOf("accepted" to false, "reason" to "capture_in_flight")
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return mapOf("accepted" to false, "reason" to "sdk_too_low")
        }

        val root = rootInActiveWindow
            ?: return mapOf("accepted" to false, "reason" to "no_window")
        val snapshot = buildWindowSnapshot(root)
        val packageName = snapshot["packageName"] as? String ?: ""
        val windowId = root.window?.id ?: root.windowId
        val shouldRestoreBubble =
            if (::overlayController.isInitialized &&
                Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE
            ) {
                overlayController.temporarilyHideForCapture()
            } else {
                false
            }

        captureInFlight = true

        OpenBubbleEventHub.emit(
            type = "capture.started",
            message = "Preparing capture for request $requestId.",
            payload = mapOf("requestId" to requestId),
        )

        val callback =
            object : TakeScreenshotCallback {
                override fun onSuccess(screenshot: ScreenshotResult) {
                    val payload =
                        persistScreenshot(
                            screenshot = screenshot,
                            requestId = requestId,
                            packageName = packageName,
                        )
                    captureInFlight = false
                    overlayController.restoreAfterCapture(shouldRestoreBubble)

                    if (payload == null) {
                        OpenBubbleEventHub.emit(
                            type = "capture.failed",
                            message = "Capture returned no bitmap payload.",
                            payload = mapOf("requestId" to requestId),
                        )
                        return
                    }

                    OpenBubbleEventHub.emit(
                        type = "capture.ready",
                        message = "Capture ready for request $requestId.",
                        payload = payload + ("windowSnapshot" to snapshot),
                    )
                }

                override fun onFailure(errorCode: Int) {
                    captureInFlight = false
                    overlayController.restoreAfterCapture(shouldRestoreBubble)

                    OpenBubbleEventHub.emit(
                        type = "capture.failed",
                        message = "Capture failed with code $errorCode.",
                        payload = mapOf(
                            "requestId" to requestId,
                            "errorCode" to errorCode,
                        ),
                    )
                }
            }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            takeScreenshotOfWindow(windowId, callbackExecutor, callback)
        } else {
            takeScreenshot(Display.DEFAULT_DISPLAY, callbackExecutor, callback)
        }

        return mapOf("accepted" to true, "requestId" to requestId)
    }

    private fun emitFillResult(success: Boolean, strategy: String): Map<String, Any?> {
        OpenBubbleEventHub.emit(
            type = if (success) "fill.completed" else "fill.failed",
            message =
                if (success) {
                    "Focused field updated through $strategy."
                } else {
                    "Focused field update failed through $strategy."
                },
            payload = mapOf("strategy" to strategy, "success" to success),
        )

        return mapOf("success" to success, "strategy" to strategy)
    }

    private fun fillFailure(message: String, strategy: String): Map<String, Any?> {
        OpenBubbleEventHub.emit(
            type = "fill.failed",
            message = message,
            payload = mapOf("strategy" to strategy, "success" to false),
        )

        return mapOf("success" to false, "strategy" to strategy)
    }

    private fun persistScreenshot(
        screenshot: ScreenshotResult,
        requestId: String,
        packageName: String,
    ): Map<String, Any?>? {
        val bitmap =
            Bitmap.wrapHardwareBuffer(
                screenshot.hardwareBuffer,
                screenshot.colorSpace,
            )?.copy(Bitmap.Config.ARGB_8888, false)
        screenshot.hardwareBuffer.close()

        if (bitmap == null) {
            return null
        }

        val file =
            File(cacheDir, "open-bubble-$requestId.png").apply {
                outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            }

        return linkedMapOf(
            "requestId" to requestId,
            "capturedAt" to Instant.now().toString(),
            "packageName" to packageName,
            "width" to bitmap.width,
            "height" to bitmap.height,
            "filePath" to file.absolutePath,
            "source" to
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    "window_screenshot"
                } else {
                    "display_screenshot"
                },
        )
    }

    private fun buildWindowSnapshot(root: AccessibilityNodeInfo): Map<String, Any?> {
        val visibleText = linkedSetOf<String>()
        val editableLabels = arrayListOf<String>()
        val queue: ArrayDeque<AccessibilityNodeInfo> = ArrayDeque()
        queue.add(root)
        var visited = 0

        while (queue.isNotEmpty() && visited < 140) {
            val node = queue.removeFirst()
            visited += 1

            node.text?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let {
                if (visibleText.size < 10) {
                    visibleText.add(it)
                }
            }

            node.contentDescription?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let {
                if (visibleText.size < 10) {
                    visibleText.add(it)
                }
            }

            if (node.isEditable && editableLabels.size < 6) {
                editableLabels.add(nodeLabel(node))
            }

            for (index in 0 until node.childCount) {
                node.getChild(index)?.let(queue::add)
            }
        }

        val focusedField = findEditableNode(root)
        val focusedPayload = focusedField?.let(::buildFocusedField)
        val windowCount =
            if (serviceInfo.flags and AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS != 0) {
                windows?.size ?: 1
            } else {
                1
            }

        return linkedMapOf(
            "packageName" to (root.packageName?.toString() ?: ""),
            "className" to (root.className?.toString() ?: ""),
            "windowCount" to windowCount,
            "visibleText" to ArrayList(visibleText),
            "editableLabels" to editableLabels,
            "focusedField" to focusedPayload,
        )
    }

    private fun buildFocusedField(node: AccessibilityNodeInfo): Map<String, Any?> {
        val bounds = android.graphics.Rect()
        node.getBoundsInScreen(bounds)

        return linkedMapOf(
            "label" to nodeLabel(node),
            "hint" to (node.hintText?.toString() ?: ""),
            "supportsSetText" to supportsAction(node, AccessibilityNodeInfo.ACTION_SET_TEXT),
            "supportsPaste" to supportsAction(node, AccessibilityNodeInfo.ACTION_PASTE),
            "bounds" to
                mapOf(
                    "left" to bounds.left,
                    "top" to bounds.top,
                    "right" to bounds.right,
                    "bottom" to bounds.bottom,
                    "width" to bounds.width(),
                    "height" to bounds.height(),
                ),
        )
    }

    private fun findEditableNode(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.let { focused ->
            if (focused.isEditable) {
                return focused
            }
        }

        root.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)?.let { focused ->
            if (focused.isEditable) {
                return focused
            }
        }

        val queue: ArrayDeque<AccessibilityNodeInfo> = ArrayDeque()
        queue.add(root)

        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()
            if (node.isEditable) {
                return node
            }

            for (index in 0 until node.childCount) {
                node.getChild(index)?.let(queue::add)
            }
        }

        return null
    }

    private fun nodeLabel(node: AccessibilityNodeInfo): String {
        return node.hintText?.toString()?.trim()?.takeIf { it.isNotEmpty() }
            ?: node.text?.toString()?.trim()?.takeIf { it.isNotEmpty() }
            ?: node.contentDescription?.toString()?.trim()?.takeIf { it.isNotEmpty() }
            ?: node.viewIdResourceName?.substringAfterLast('/')?.takeIf { it.isNotEmpty() }
            ?: "Focused field"
    }

    private fun supportsAction(
        node: AccessibilityNodeInfo,
        actionId: Int,
    ): Boolean {
        return node.actionList.any { action -> action.id == actionId }
    }

    private fun newRequestId(): String {
        return "req_${System.currentTimeMillis()}"
    }

    companion object {
        @Volatile
        var instance: OpenBubbleAccessibilityService? = null
    }
}

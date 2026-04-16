package dev.openbubble.mobile

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.AccessibilityService.TakeScreenshotCallback
import android.accessibilityservice.AccessibilityService.ScreenshotResult
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.io.File
import java.time.Instant
import java.util.ArrayDeque
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executor

class OpenBubbleAccessibilityService : AccessibilityService() {
    private lateinit var overlayController: BubbleOverlayController
    private val callbackExecutor = Executor { runnable ->
        Thread(runnable, "open-bubble-capture").start()
    }
    private val mainHandler = Handler(Looper.getMainLooper())
    private val pendingOverlayWorkflows = ConcurrentHashMap<String, OverlayWorkflow>()

    private var captureInFlight = false
    private var lastExternalWindowId: Int? = null
    private var lastExternalPackageName: String? = null
    private val resetBubbleStatusRunnable =
        Runnable {
            if (::overlayController.isInitialized) {
                overlayController.updateStatus(
                    bubbleText = "OB",
                    subtitle = getString(R.string.overlay_hint_subtitle),
                )
            }
        }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        overlayController = BubbleOverlayController(this)
        ensureNotificationChannel()
        Log.d(TAG, "onServiceConnected")

        OpenBubbleEventHub.emit(
            type = "service.connected",
            message = "Open Bubble accessibility runtime connected.",
        )
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val packageName = event?.packageName?.toString() ?: return
        if (packageName != applicationContext.packageName) {
            lastExternalPackageName = packageName
            if (event.windowId >= 0) {
                lastExternalWindowId = event.windowId
            }
        }
    }

    override fun onInterrupt() {
        Log.d(TAG, "onInterrupt")
        OpenBubbleEventHub.emit(
            type = "service.interrupted",
            message = "Accessibility service interrupted.",
        )
    }

    override fun onUnbind(intent: Intent?): Boolean {
        Log.d(TAG, "onUnbind")
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
            Log.d(TAG, "showBubble: overlay controller not initialized")
            return false
        }

        Log.d(TAG, "showBubble")
        overlayController.showBubble()
        return true
    }

    fun hideBubble(): Boolean {
        if (!::overlayController.isInitialized) {
            Log.d(TAG, "hideBubble: overlay controller not initialized")
            return false
        }

        Log.d(TAG, "hideBubble")
        overlayController.hideBubble()
        return true
    }

    fun isBubbleVisible(): Boolean {
        return ::overlayController.isInitialized && overlayController.isVisible()
    }

    fun inspectActiveWindow(): Map<String, Any?> {
        val target = resolveWindowContext(preferExternal = false) ?: return emptyMap()
        val snapshot = buildWindowSnapshot(target.root)
        Log.d(TAG, "inspectActiveWindow: package=${snapshot["packageName"]}")

        OpenBubbleEventHub.emit(
            type = "inspection.ready",
            message = "Active window inspected.",
            payload = snapshot,
        )

        return snapshot
    }

    fun fillFocusedField(
        text: String,
        preferExternal: Boolean = false,
    ): Map<String, Any?> {
        val targetContext = resolveWindowContext(preferExternal = preferExternal)
            ?: return fillFailure("No active window is available.", "no_window")
        Log.d(
            TAG,
            "fillFocusedField: length=${text.length} target=${targetContext.packageName} preferExternal=$preferExternal",
        )
        val target = findEditableNode(targetContext.root)
            ?: return fillFailure("No focused editable field was found.", "no_target")

        if (supportsAction(target, AccessibilityNodeInfo.ACTION_CLICK)) {
            target.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        }
        if (supportsAction(target, AccessibilityNodeInfo.ACTION_FOCUS)) {
            target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        }

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

        copyTextToClipboard(text)

        target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        val pasted =
            if (supportsAction(target, AccessibilityNodeInfo.ACTION_PASTE)) {
                target.performAction(AccessibilityNodeInfo.ACTION_PASTE)
            } else {
                false
            }

        return emitFillResult(pasted, if (pasted) "paste" else "paste_failed")
    }

    fun fillCachedSuggestion(): Map<String, Any?> {
        val text = cachedFillSuggestion?.takeIf { it.isNotBlank() }
            ?: run {
                overlayController.updateStatus(
                    bubbleText = "!",
                    subtitle = "No cached reply yet.",
                )
                scheduleBubbleStatusReset()
                return fillFailure("No cached suggestion is available yet.", "no_cached_text")
            }
        Log.d(TAG, "fillCachedSuggestion: length=${text.length}")
        overlayController.updateStatus(
            bubbleText = "...",
            subtitle = "Filling focused field…",
        )
        val result = fillFocusedField(text, preferExternal = true)
        val success = result["success"] as? Boolean ?: false
        overlayController.updateStatus(
            bubbleText = if (success) "OK" else "!",
            subtitle =
                if (success) {
                    "Filled focused field."
                } else {
                    "Could not fill focused field."
                },
        )
        scheduleBubbleStatusReset()
        return result
    }

    fun startOverlayCaptureWorkflow(): Map<String, Any?> {
        val requestId = newRequestId("orb")
        pendingOverlayWorkflows[requestId] = OverlayWorkflow.capture
        overlayController.updateStatus(
            bubbleText = "...",
            subtitle = "Analyzing current app…",
        )
        OpenBubbleEventHub.emit(
            type = "overlay.workflow.started",
            message = "Background capture workflow started.",
            payload = mapOf("requestId" to requestId, "mode" to "capture"),
        )

        val result = captureActiveWindow(requestId = requestId, preferExternal = true)
        if (!(result["accepted"] as? Boolean ?: false)) {
            pendingOverlayWorkflows.remove(requestId)
            overlayController.updateStatus(
                bubbleText = "!",
                subtitle = "Capture could not start.",
            )
            scheduleBubbleStatusReset()
            OpenBubbleEventHub.emit(
                type = "overlay.workflow.failed",
                message = "Background capture workflow failed to start.",
                payload = mapOf(
                    "requestId" to requestId,
                    "mode" to "capture",
                    "reason" to (result["reason"] ?: "unknown"),
                ),
            )
        }

        return result
    }

    fun startOverlayPullWorkflow() {
        val requestId = newRequestId("pull")
        val target = resolveWindowContext(preferExternal = true)
        val snapshot = target?.let { buildWindowSnapshot(it.root) } ?: emptyMap()
        pendingOverlayWorkflows[requestId] = OverlayWorkflow.pull
        overlayController.updateStatus(
            bubbleText = "...",
            subtitle = "Fetching mock data…",
        )
        OpenBubbleEventHub.emit(
            type = "overlay.workflow.started",
            message = "Background pull workflow started.",
            payload = mapOf("requestId" to requestId, "mode" to "pull"),
        )

        mainHandler.postDelayed({
            pendingOverlayWorkflows.remove(requestId)
            deliverOverlayReply(buildMockPullReply(requestId, snapshot))
        }, 1100)
    }

    fun captureActiveWindow(
        requestId: String = newRequestId(),
        preferExternal: Boolean = false,
    ): Map<String, Any?> {
        Log.d(TAG, "captureActiveWindow: requestId=$requestId preferExternal=$preferExternal")
        if (captureInFlight) {
            return mapOf("accepted" to false, "reason" to "capture_in_flight")
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return mapOf("accepted" to false, "reason" to "sdk_too_low")
        }

        val targetContext = resolveWindowContext(preferExternal = preferExternal)
            ?: return mapOf("accepted" to false, "reason" to "no_window")
        val snapshot = buildWindowSnapshot(targetContext.root)
        val packageName = snapshot["packageName"] as? String ?: targetContext.packageName
        val windowId = targetContext.windowId
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

                    if (pendingOverlayWorkflows[requestId] == OverlayWorkflow.capture) {
                        overlayController.updateStatus(
                            bubbleText = "...",
                            subtitle = "Drafting clipboard reply…",
                        )
                        mainHandler.postDelayed({
                            pendingOverlayWorkflows.remove(requestId)
                            deliverOverlayReply(
                                buildMockCaptureReply(
                                    requestId = requestId,
                                    snapshot = snapshot,
                                ),
                            )
                        }, 900)
                    }
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

                    if (pendingOverlayWorkflows.remove(requestId) == OverlayWorkflow.capture) {
                        overlayController.updateStatus(
                            bubbleText = "!",
                            subtitle = "Capture failed.",
                        )
                        scheduleBubbleStatusReset()
                        OpenBubbleEventHub.emit(
                            type = "overlay.workflow.failed",
                            message = "Background capture workflow failed.",
                            payload = mapOf(
                                "requestId" to requestId,
                                "mode" to "capture",
                                "errorCode" to errorCode,
                            ),
                        )
                    }
                }
            }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            takeScreenshotOfWindow(windowId, callbackExecutor, callback)
        } else {
            takeScreenshot(Display.DEFAULT_DISPLAY, callbackExecutor, callback)
        }

        return mapOf("accepted" to true, "requestId" to requestId)
    }

    private fun resolveWindowContext(preferExternal: Boolean): ResolvedWindowContext? {
        val ownPackage = applicationContext.packageName
        val candidates =
            windows
                ?.filter { window -> window.type == AccessibilityWindowInfo.TYPE_APPLICATION }
                ?.mapNotNull { window ->
                    val root = window.root ?: return@mapNotNull null
                    ResolvedWindowContext(
                        root = root,
                        windowId = window.id,
                        packageName = root.packageName?.toString() ?: "",
                        focused = window.isFocused,
                        active = window.isActive,
                    )
                }
                .orEmpty()

        val externalCandidates = candidates.filter { it.packageName != ownPackage }
        if (preferExternal) {
            pickBestWindowContext(externalCandidates)?.let { return it }
        }

        pickBestWindowContext(candidates)?.let { return it }

        if (!preferExternal) {
            pickBestWindowContext(externalCandidates)?.let { return it }
        }

        rootInActiveWindow?.let { root ->
            return ResolvedWindowContext(
                root = root,
                windowId = root.window?.id ?: root.windowId,
                packageName = root.packageName?.toString() ?: "",
                focused = true,
                active = true,
            )
        }

        return null
    }

    private fun pickBestWindowContext(
        candidates: List<ResolvedWindowContext>,
    ): ResolvedWindowContext? {
        return candidates
            .sortedWith(
                compareByDescending<ResolvedWindowContext> { it.windowId == lastExternalWindowId }
                    .thenByDescending { it.packageName == lastExternalPackageName }
                    .thenByDescending { it.focused }
                    .thenByDescending { it.active },
            ).firstOrNull()
    }

    private fun buildMockCaptureReply(
        requestId: String,
        snapshot: Map<String, Any?>,
    ): OverlayReply {
        val visibleSignal =
            (snapshot["visibleText"] as? List<*>)
                ?.map { it.toString() }
                ?.take(2)
                ?.joinToString(" · ")
                ?.takeIf { it.isNotBlank() }
                ?: "captured context"
        val packageName = snapshot["packageName"] as? String ?: "the current app"
        val fillSuggestion =
            "I captured $packageName and saw \"$visibleSignal\". The mock server prepared a concise response and copied it so I can paste it here."
        val replyText =
            "Open Bubble captured the current screen, built a mock server reply, and cached the suggested response for background fill or paste."

        return OverlayReply(
            requestId = requestId,
            workflow = "capture",
            title = "Capture reply ready",
            replyText = replyText,
            fillSuggestion = fillSuggestion,
            notificationText = "Capture reply copied to clipboard.",
            targetPackage = packageName,
        )
    }

    private fun buildMockPullReply(
        requestId: String,
        snapshot: Map<String, Any?>,
    ): OverlayReply {
        val visibleText =
            (snapshot["visibleText"] as? List<*>)
                ?.joinToString(" ") { it.toString() }
                ?.lowercase()
                ?: ""
        val packageName = snapshot["packageName"] as? String ?: (lastExternalPackageName ?: "background app")

        val fillSuggestion =
            when {
                "passport" in visibleText ->
                    "Passport number: P1234567. Issue date: 11 Jan 2021. Expiry: 10 Jan 2031."
                "aadhaar" in visibleText || "aadhar" in visibleText ->
                    "Aadhaar: 1234 5678 9012. Name: Aadi Menon. Use only after confirming the request."
                "insurance" in visibleText || "policy" in visibleText ->
                    "Insurance policy: ACM-47-9981. Provider: Acme Mutual. Coverage: Comprehensive. Contact: +91 98765 43210."
                else ->
                    "Insurance policy: ACM-47-9981. Provider: Acme Mutual. Coverage: Comprehensive. Contact: +91 98765 43210."
            }

        return OverlayReply(
            requestId = requestId,
            workflow = "pull",
            title = "Mock data ready",
            replyText =
                "Open Bubble inferred a structured data pull request from the current screen and prepared a clipboard-ready mock response.",
            fillSuggestion = fillSuggestion,
            notificationText = "Mock data copied to clipboard for paste.",
            targetPackage = packageName,
        )
    }

    private fun deliverOverlayReply(reply: OverlayReply) {
        cachedFillSuggestion = reply.fillSuggestion
        copyTextToClipboard(reply.fillSuggestion)
        val notificationPosted = maybePostReadyNotification(reply)
        overlayController.updateStatus(
            bubbleText = "OK",
            subtitle =
                if (notificationPosted) {
                    "Ready. Clipboard and notification updated."
                } else {
                    "Ready. Clipboard updated."
                },
        )
        scheduleBubbleStatusReset()

        OpenBubbleEventHub.emit(
            type = "overlay.reply.ready",
            message = reply.notificationText,
            payload = mapOf(
                "requestId" to reply.requestId,
                "mode" to reply.workflow,
                "title" to reply.title,
                "replyText" to reply.replyText,
                "fillSuggestion" to reply.fillSuggestion,
                "confidence" to "high",
                "warnings" to listOf(
                    "Review before filling into another app.",
                    "Sensitive or secure screens should be handled as unsupported.",
                ),
                "updatedAt" to Instant.now().toString(),
                "notificationPosted" to notificationPosted,
                "copiedToClipboard" to true,
                "targetPackage" to reply.targetPackage,
            ),
        )
    }

    private fun copyTextToClipboard(text: String) {
        val clipboard =
            getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Open Bubble", text))
    }

    private fun maybePostReadyNotification(reply: OverlayReply): Boolean {
        if (!notificationsAllowed()) {
            Log.d(TAG, "maybePostReadyNotification: notifications unavailable")
            return false
        }

        val intent =
            Intent(this, MainActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP,
                )
                putExtra("source", "notification")
                putExtra("requestId", reply.requestId)
            }
        val pendingIntent =
            PendingIntent.getActivity(
                this,
                reply.requestId.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        val notification =
            NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(reply.title)
                .setContentText(reply.notificationText)
                .setStyle(NotificationCompat.BigTextStyle().bigText(reply.notificationText))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build()

        NotificationManagerCompat.from(this).notify(reply.requestId.hashCode(), notification)
        return true
    }

    private fun notificationsAllowed(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }

        return NotificationManagerCompat.from(this).areNotificationsEnabled()
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val notificationManager = getSystemService(NotificationManager::class.java)
        val existing = notificationManager.getNotificationChannel(NOTIFICATION_CHANNEL_ID)
        if (existing != null) {
            return
        }

        val channel =
            NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = getString(R.string.notification_channel_description)
            }
        notificationManager.createNotificationChannel(channel)
    }

    private fun scheduleBubbleStatusReset() {
        mainHandler.removeCallbacks(resetBubbleStatusRunnable)
        mainHandler.postDelayed(resetBubbleStatusRunnable, 3500)
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

    private fun newRequestId(prefix: String = "req"): String {
        return "${prefix}_${System.currentTimeMillis()}"
    }

    companion object {
        private const val TAG = "OpenBubbleService"
        private const val NOTIFICATION_CHANNEL_ID = "open_bubble_replies"

        @Volatile
        var cachedFillSuggestion: String? = null

        @Volatile
        var instance: OpenBubbleAccessibilityService? = null
    }
}

private data class ResolvedWindowContext(
    val root: AccessibilityNodeInfo,
    val windowId: Int,
    val packageName: String,
    val focused: Boolean,
    val active: Boolean,
)

private data class OverlayReply(
    val requestId: String,
    val workflow: String,
    val title: String,
    val replyText: String,
    val fillSuggestion: String,
    val notificationText: String,
    val targetPackage: String,
)

private enum class OverlayWorkflow {
    capture,
    pull,
}

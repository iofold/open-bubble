package dev.openbubble.mobile

import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.time.Instant

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            METHOD_CHANNEL,
        ).setMethodCallHandler(::handleMethodCall)

        EventChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            EVENT_CHANNEL,
        ).setStreamHandler(
            object : EventChannel.StreamHandler {
                override fun onListen(
                    arguments: Any?,
                    events: EventChannel.EventSink,
                ) {
                    OpenBubbleEventHub.attach(events)
                }

                override fun onCancel(arguments: Any?) {
                    OpenBubbleEventHub.detach()
                }
            },
        )
    }

    private fun handleMethodCall(
        call: MethodCall,
        result: MethodChannel.Result,
    ) {
        when (call.method) {
            "getServiceStatus" -> result.success(buildServiceStatus())
            "getRecentEvents" -> result.success(OpenBubbleEventHub.snapshot())
            "openAccessibilitySettings" -> {
                openAccessibilitySettings()
                result.success(true)
            }

            "showBubble" ->
                result.success(OpenBubbleAccessibilityService.instance?.showBubble() ?: false)

            "hideBubble" ->
                result.success(OpenBubbleAccessibilityService.instance?.hideBubble() ?: false)

            "inspectActiveWindow" ->
                result.success(
                    OpenBubbleAccessibilityService.instance?.inspectActiveWindow()
                        ?: emptyMap<String, Any?>(),
                )

            "captureActiveWindow" -> {
                val requestId =
                    call.argument<String>("requestId")
                        ?: "req_${System.currentTimeMillis()}"
                result.success(
                    OpenBubbleAccessibilityService.instance?.captureActiveWindow(requestId)
                        ?: mapOf(
                            "accepted" to false,
                            "reason" to "service_unavailable",
                        ),
                )
            }

            "fillFocusedField" -> {
                val text = call.argument<String>("text").orEmpty()
                result.success(
                    OpenBubbleAccessibilityService.instance?.fillFocusedField(text)
                        ?: mapOf(
                            "success" to false,
                            "strategy" to "service_unavailable",
                        ),
                )
            }

            "copyText" -> {
                val text = call.argument<String>("text").orEmpty()
                copyText(text)
                result.success(true)
            }

            else -> result.notImplemented()
        }
    }

    private fun buildServiceStatus(): Map<String, Any?> {
        val service = OpenBubbleAccessibilityService.instance
        val enabled = isAccessibilityServiceEnabled()
        val note =
            when {
                !enabled -> "Enable the accessibility service to unlock bubble actions."
                service == null -> "Service is enabled but not currently bound."
                else -> "Accessibility runtime is connected."
            }

        return linkedMapOf(
            "accessibilityEnabled" to enabled,
            "serviceConnected" to (service != null),
            "bubbleVisible" to (service?.isBubbleVisible() ?: false),
            "captureSupported" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R),
            "windowScopedCaptureSupported" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE),
            "sdkInt" to Build.VERSION.SDK_INT,
            "platformLabel" to "android",
            "lastUpdated" to Instant.now().toString(),
            "note" to note,
        )
    }

    private fun openAccessibilitySettings() {
        startActivity(
            Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            },
        )
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val componentName =
            ComponentName(this, OpenBubbleAccessibilityService::class.java)
        val enabledServices =
            Settings.Secure.getString(
                contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
            ) ?: return false

        return enabledServices.contains(componentName.flattenToString())
    }

    private fun copyText(text: String) {
        val clipboard =
            getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Open Bubble", text))
    }

    companion object {
        private const val METHOD_CHANNEL = "dev.openbubble.mobile/platform"
        private const val EVENT_CHANNEL = "dev.openbubble.mobile/events"
    }
}

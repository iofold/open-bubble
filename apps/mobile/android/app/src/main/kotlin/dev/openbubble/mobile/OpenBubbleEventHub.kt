package dev.openbubble.mobile

import android.os.Handler
import android.os.Looper
import android.util.Log
import io.flutter.plugin.common.EventChannel
import java.time.Instant
import java.util.ArrayDeque

object OpenBubbleEventHub {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val recentEvents = ArrayDeque<Map<String, Any?>>()
    private var sink: EventChannel.EventSink? = null

    fun attach(eventSink: EventChannel.EventSink) {
        sink = eventSink
    }

    fun detach() {
        sink = null
    }

    fun snapshot(): List<Map<String, Any?>> {
        return synchronized(recentEvents) { recentEvents.toList() }
    }

    fun emit(
        type: String,
        message: String? = null,
        payload: Map<String, Any?> = emptyMap(),
    ) {
        Log.d(TAG, "emit: type=$type message=${message ?: ""} payloadKeys=${payload.keys}")
        val event = linkedMapOf<String, Any?>(
            "type" to type,
            "timestamp" to Instant.now().toString(),
        )

        if (!message.isNullOrBlank()) {
            event["message"] = message
        }

        if (payload.isNotEmpty()) {
            event["payload"] = HashMap(payload)
        }

        synchronized(recentEvents) {
            recentEvents.addFirst(event)
            while (recentEvents.size > 24) {
                recentEvents.removeLast()
            }
        }

        mainHandler.post {
            sink?.success(event)
        }
    }

    private const val TAG = "OpenBubbleEventHub"
}

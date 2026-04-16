package dev.openbubble.mobile

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.setPadding
import kotlin.math.abs

class BubbleOverlayController(
    private val service: OpenBubbleAccessibilityService,
) {
    private val windowManager =
        service.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    private var bubbleView: View? = null
    private var bubbleParams: WindowManager.LayoutParams? = null
    private var panelView: View? = null
    private var panelParams: WindowManager.LayoutParams? = null

    private var visible = false

    fun isVisible(): Boolean = visible

    fun showBubble() {
        if (visible) {
            return
        }

        val bubble = createBubbleView()
        val params = baseLayoutParams().apply {
            width = 168
            height = 168
            x = 48
            y = 320
        }

        runCatching {
            windowManager.addView(bubble, params)
        }.onSuccess {
            bubbleView = bubble
            bubbleParams = params
            visible = true
            OpenBubbleEventHub.emit(
                type = "bubble.shown",
                message = "Open Bubble overlay is visible.",
            )
        }
    }

    fun hideBubble() {
        if (!visible) {
            return
        }

        hidePanel()
        bubbleView?.let { view ->
            runCatching { windowManager.removeView(view) }
        }
        bubbleView = null
        bubbleParams = null
        visible = false
        OpenBubbleEventHub.emit(
            type = "bubble.hidden",
            message = "Open Bubble overlay was removed.",
        )
    }

    fun temporarilyHideForCapture(): Boolean {
        val wasVisible = visible
        if (wasVisible) {
            hideBubble()
        }
        return wasVisible
    }

    fun restoreAfterCapture(wasVisible: Boolean) {
        if (wasVisible) {
            showBubble()
        }
    }

    private fun createBubbleView(): View {
        val container = FrameLayout(service).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                colors = intArrayOf(
                    Color.parseColor("#0E5A63"),
                    Color.parseColor("#1B6C79"),
                )
                setStroke(4, Color.parseColor("#D9F3EF"))
            }
            elevation = 18f
            setPadding(18)
        }

        val label = TextView(service).apply {
            text = "OB"
            setTextColor(Color.WHITE)
            textSize = 19f
            gravity = Gravity.CENTER
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }

        container.addView(
            label,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        bindBubbleInteractions(container)
        return container
    }

    private fun bindBubbleInteractions(bubble: View) {
        val gestureDetector =
            GestureDetector(
                service,
                object : GestureDetector.SimpleOnGestureListener() {
                    override fun onSingleTapUp(e: MotionEvent): Boolean {
                        togglePanel()
                        OpenBubbleEventHub.emit(
                            type = "bubble.tap",
                            message = "Bubble tapped.",
                        )
                        return true
                    }

                    override fun onLongPress(e: MotionEvent) {
                        OpenBubbleEventHub.emit(
                            type = "bubble.longPress",
                            message = "Bubble long pressed.",
                        )
                        service.captureActiveWindow()
                    }
                },
            )

        var initialX = 0
        var initialY = 0
        var downRawX = 0f
        var downRawY = 0f
        var dragging = false

        bubble.setOnTouchListener { _, event ->
            gestureDetector.onTouchEvent(event)
            val params = bubbleParams ?: return@setOnTouchListener false

            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    downRawX = event.rawX
                    downRawY = event.rawY
                    dragging = false
                }

                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - downRawX).toInt()
                    val dy = (event.rawY - downRawY).toInt()
                    if (!dragging && (abs(dx) > 10 || abs(dy) > 10)) {
                        dragging = true
                    }
                    if (dragging) {
                        params.x = initialX + dx
                        params.y = initialY + dy
                        runCatching { windowManager.updateViewLayout(bubble, params) }
                        panelParams?.let { panel ->
                            panel.x = params.x - 8
                            panel.y = params.y + 184
                            panelView?.let { runCatching { windowManager.updateViewLayout(it, panel) } }
                        }
                    }
                }
            }

            true
        }
    }

    private fun togglePanel() {
        if (panelView == null) {
            showPanel()
        } else {
            hidePanel()
        }
    }

    private fun showPanel() {
        if (!visible || panelView != null) {
            return
        }

        val params = bubbleParams ?: return
        val panel = LinearLayout(service).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(20)
            background = GradientDrawable().apply {
                cornerRadius = 42f
                setColor(Color.parseColor("#FFF7EF"))
                setStroke(2, Color.parseColor("#220E5A63"))
            }
            elevation = 20f
        }

        panel.addView(createPanelHeader())
        panel.addView(createActionRow())

        val layoutParams = baseLayoutParams().apply {
            width = 460
            height = WindowManager.LayoutParams.WRAP_CONTENT
            x = params.x - 8
            y = params.y + 184
            title = "OpenBubblePanel"
        }

        runCatching {
            windowManager.addView(panel, layoutParams)
        }.onSuccess {
            panelView = panel
            panelParams = layoutParams
        }
    }

    private fun hidePanel() {
        panelView?.let { view ->
            runCatching { windowManager.removeView(view) }
        }
        panelView = null
        panelParams = null
    }

    private fun createPanelHeader(): View {
        return LinearLayout(service).apply {
            orientation = LinearLayout.VERTICAL
            addView(
                TextView(service).apply {
                    text = service.getString(R.string.overlay_hint_title)
                    textSize = 16f
                    setTextColor(Color.parseColor("#172026"))
                    setTypeface(typeface, android.graphics.Typeface.BOLD)
                },
            )
            addView(
                TextView(service).apply {
                    text = service.getString(R.string.overlay_hint_subtitle)
                    textSize = 12f
                    setTextColor(Color.parseColor("#5B6470"))
                },
            )
        }
    }

    private fun createActionRow(): View {
        return LinearLayout(service).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 14, 0, 0)
            addView(
                createActionChip(service.getString(R.string.overlay_action_open)) {
                    openApp()
                },
            )
            addView(
                createActionChip(service.getString(R.string.overlay_action_fill)) {
                    service.fillCachedSuggestion()
                },
            )
            addView(
                createActionChip(service.getString(R.string.overlay_action_inspect)) {
                    service.inspectActiveWindow()
                },
            )
            addView(
                createActionChip(service.getString(R.string.overlay_action_capture)) {
                    service.captureActiveWindow()
                },
            )
        }
    }

    private fun createActionChip(label: String, onTap: () -> Unit): View {
        return TextView(service).apply {
            text = label
            textSize = 13f
            setTextColor(Color.parseColor("#0E5A63"))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(28, 18, 28, 18)
            background = GradientDrawable().apply {
                cornerRadius = 999f
                setColor(Color.parseColor("#E9F3F3"))
            }
            setOnClickListener {
                onTap()
                hidePanel()
            }
            val params =
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                )
            params.marginEnd = 12
            layoutParams = params
        }
    }

    private fun openApp() {
        val intent =
            Intent(service, MainActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP,
                )
                putExtra("source", "bubble")
            }
        service.startActivity(intent)
    }

    private fun baseLayoutParams(): WindowManager.LayoutParams {
        return WindowManager.LayoutParams().apply {
            type = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
            format = PixelFormat.TRANSLUCENT
            flags =
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
            gravity = Gravity.TOP or Gravity.START
            title = "OpenBubbleBubble"
        }
    }
}

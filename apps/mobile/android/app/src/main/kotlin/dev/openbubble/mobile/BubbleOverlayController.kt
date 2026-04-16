package dev.openbubble.mobile

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
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
    private val inputMethodManager =
        service.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager

    private var bubbleView: View? = null
    private var bubbleParams: WindowManager.LayoutParams? = null
    private var panelView: View? = null
    private var panelParams: WindowManager.LayoutParams? = null
    private var composerView: View? = null
    private var composerParams: WindowManager.LayoutParams? = null
    private var bubbleLabelView: TextView? = null
    private var panelSubtitleView: TextView? = null
    private var composerSubtitleView: TextView? = null
    private var composerInputView: EditText? = null

    private var visible = false
    private var bubbleLabel = "OB"
    private var statusSubtitle = service.getString(R.string.overlay_hint_subtitle)

    fun isVisible(): Boolean = visible

    fun updateStatus(
        bubbleText: String = bubbleLabel,
        subtitle: String = statusSubtitle,
    ) {
        bubbleLabel = bubbleText
        statusSubtitle = subtitle
        bubbleLabelView?.text = bubbleLabel
        panelSubtitleView?.text = statusSubtitle
    }

    fun updatePromptComposerStatus(
        message: String,
        isError: Boolean = false,
    ) {
        composerSubtitleView?.text = message
        composerSubtitleView?.setTextColor(
            if (isError) {
                Color.parseColor("#B42318")
            } else {
                Color.parseColor("#5B6470")
            },
        )
    }

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
            updateStatus()
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
        hidePromptComposer()
        bubbleView?.let { view ->
            runCatching { windowManager.removeView(view) }
        }
        bubbleView = null
        bubbleParams = null
        bubbleLabelView = null
        panelSubtitleView = null
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

    fun showPromptComposer(seedText: String = "") {
        if (!visible) {
            return
        }

        hidePanel()

        if (composerView != null) {
            composerInputView?.setText(seedText)
            focusPromptComposer()
            return
        }

        val composer =
            LinearLayout(service).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(26)
                background = GradientDrawable().apply {
                    cornerRadius = 44f
                    setColor(Color.parseColor("#FFF7EF"))
                    setStroke(3, Color.parseColor("#220E5A63"))
                }
                elevation = 24f
            }

        val title =
            TextView(service).apply {
                text = service.getString(R.string.overlay_prompt_title)
                textSize = 17f
                setTextColor(Color.parseColor("#172026"))
                setTypeface(typeface, Typeface.BOLD)
            }

        val subtitle =
            TextView(service).apply {
                text = service.getString(R.string.overlay_prompt_subtitle)
                textSize = 13f
                setTextColor(Color.parseColor("#5B6470"))
                maxLines = 3
            }
        composerSubtitleView = subtitle

        val input =
            EditText(service).apply {
                hint = service.getString(R.string.overlay_prompt_hint)
                inputType =
                    InputType.TYPE_CLASS_TEXT or
                        InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                        InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
                minLines = 3
                maxLines = 5
                setTextColor(Color.parseColor("#172026"))
                setHintTextColor(Color.parseColor("#7C8790"))
                textSize = 14f
                setPadding(22)
                background = GradientDrawable().apply {
                    cornerRadius = 30f
                    setColor(Color.WHITE)
                    setStroke(2, Color.parseColor("#DDE8E6"))
                }
                setText(seedText)
            }
        composerInputView = input

        val buttonRow =
            LinearLayout(service).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.END
                addView(
                    createComposerButton(
                        label = service.getString(R.string.overlay_action_cancel),
                        filled = false,
                    ) {
                        hidePromptComposer()
                    },
                )
                addView(
                    createComposerButton(
                        label = service.getString(R.string.overlay_action_send),
                        filled = true,
                    ) {
                        val accepted = service.submitPromptFromOverlay(input.text.toString())
                        if (accepted) {
                            hidePromptComposer()
                        }
                    },
                )
            }

        composer.addView(title)
        composer.addView(
            subtitle,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                topMargin = 8
            },
        )
        composer.addView(
            input,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                topMargin = 18
            },
        )
        composer.addView(
            buttonRow,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                topMargin = 16
            },
        )

        val screenWidth = windowManager.currentWindowMetrics.bounds.width()
        val layoutWidth = (screenWidth * 0.84f).toInt().coerceIn(520, 860)
        val params =
            composerLayoutParams().apply {
                width = layoutWidth
                height = WindowManager.LayoutParams.WRAP_CONTENT
                y = 120
            }

        runCatching {
            windowManager.addView(composer, params)
        }.onSuccess {
            composerView = composer
            composerParams = params
            focusPromptComposer()
        }
    }

    fun hidePromptComposer() {
        composerInputView?.windowToken?.let { token ->
            inputMethodManager.hideSoftInputFromWindow(token, 0)
        }
        composerView?.let { view ->
            runCatching { windowManager.removeView(view) }
        }
        composerView = null
        composerParams = null
        composerInputView = null
        composerSubtitleView = null
    }

    private fun focusPromptComposer() {
        composerInputView?.post {
            composerInputView?.requestFocus()
            composerInputView?.setSelection(composerInputView?.text?.length ?: 0)
            inputMethodManager.showSoftInput(
                composerInputView,
                InputMethodManager.SHOW_IMPLICIT,
            )
        }
    }

    private fun createBubbleView(): View {
        val container =
            FrameLayout(service).apply {
                background =
                    GradientDrawable().apply {
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

        val label =
            TextView(service).apply {
                text = bubbleLabel
                setTextColor(Color.WHITE)
                textSize = 19f
                gravity = Gravity.CENTER
                setTypeface(typeface, Typeface.BOLD)
            }
        bubbleLabelView = label

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
                        hidePanel()
                        showPromptComposer()
                        OpenBubbleEventHub.emit(
                            type = "bubble.longPress",
                            message = "Bubble long pressed.",
                        )
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
        val panel =
            LinearLayout(service).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(20)
                background =
                    GradientDrawable().apply {
                        cornerRadius = 42f
                        setColor(Color.parseColor("#FFF7EF"))
                        setStroke(2, Color.parseColor("#220E5A63"))
                    }
                elevation = 20f
            }

        panel.addView(createPanelHeader())
        panel.addView(createActionRow())

        val layoutParams =
            baseLayoutParams().apply {
                width = 490
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
                    setTypeface(typeface, Typeface.BOLD)
                },
            )
            addView(
                TextView(service).apply {
                    text = statusSubtitle
                    textSize = 12f
                    setTextColor(Color.parseColor("#5B6470"))
                    maxLines = 2
                },
            )
        }
            .also { container ->
                panelSubtitleView = container.getChildAt(1) as TextView
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
                createActionChip(service.getString(R.string.overlay_action_ask)) {
                    showPromptComposer()
                },
            )
            addView(
                createActionChip(service.getString(R.string.overlay_action_fill)) {
                    service.fillCachedSuggestion()
                },
            )
        }
    }

    private fun createActionChip(
        label: String,
        onTap: () -> Unit,
    ): View {
        return TextView(service).apply {
            text = label
            textSize = 13f
            setTextColor(Color.parseColor("#0E5A63"))
            setTypeface(typeface, Typeface.BOLD)
            setPadding(22, 18, 22, 18)
            background =
                GradientDrawable().apply {
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

    private fun createComposerButton(
        label: String,
        filled: Boolean,
        onTap: () -> Unit,
    ): View {
        return TextView(service).apply {
            text = label
            textSize = 13f
            setTextColor(if (filled) Color.WHITE else Color.parseColor("#0E5A63"))
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(24, 18, 24, 18)
            background =
                GradientDrawable().apply {
                    cornerRadius = 999f
                    setColor(
                        if (filled) {
                            Color.parseColor("#0E5A63")
                        } else {
                            Color.parseColor("#E9F3F3")
                        },
                    )
                }
            setOnClickListener { onTap() }
            val params =
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                )
            params.marginStart = 12
            layoutParams = params
        }
    }

    private fun openApp() {
        hidePanel()
        hidePromptComposer()
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

    private fun composerLayoutParams(): WindowManager.LayoutParams {
        return WindowManager.LayoutParams().apply {
            type = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
            format = PixelFormat.TRANSLUCENT
            flags = WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            softInputMode =
                WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE or
                    WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
            title = "OpenBubblePromptComposer"
        }
    }
}

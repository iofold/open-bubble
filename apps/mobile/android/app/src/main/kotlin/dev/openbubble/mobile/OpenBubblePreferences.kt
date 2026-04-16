package dev.openbubble.mobile

import android.content.Context

object OpenBubblePreferences {
    private const val PREFS_NAME = "open_bubble_runtime"
    private const val KEY_SERVER_BASE_URL = "server_base_url"
    private const val KEY_CACHED_FILL_SUGGESTION = "cached_fill_suggestion"
    private const val DEFAULT_SERVER_BASE_URL = "http://10.0.2.2:3000"
    private const val LEGACY_SERVER_BASE_URL = "http://10.0.2.2:8787"

    fun getServerBaseUrl(context: Context): String {
        val storedValue =
            prefs(context)
                .getString(KEY_SERVER_BASE_URL, DEFAULT_SERVER_BASE_URL)
                ?.trim()
                .orEmpty()

        if (storedValue.isBlank() || storedValue == LEGACY_SERVER_BASE_URL) {
            setServerBaseUrl(context, DEFAULT_SERVER_BASE_URL)
            return DEFAULT_SERVER_BASE_URL
        }

        return storedValue
    }

    fun setServerBaseUrl(
        context: Context,
        value: String,
    ) {
        prefs(context).edit().putString(KEY_SERVER_BASE_URL, value.trim()).apply()
    }

    fun getCachedFillSuggestion(context: Context): String? {
        return prefs(context).getString(KEY_CACHED_FILL_SUGGESTION, null)
    }

    fun setCachedFillSuggestion(
        context: Context,
        value: String?,
    ) {
        prefs(context).edit().apply {
            if (value.isNullOrBlank()) {
                remove(KEY_CACHED_FILL_SUGGESTION)
            } else {
                putString(KEY_CACHED_FILL_SUGGESTION, value)
            }
        }.apply()
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}

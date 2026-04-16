package dev.openbubble.mobile

import android.util.Log
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLEncoder
import kotlin.text.Charsets.UTF_8

data class PromptAcceptedResult(
    val taskId: String,
    val status: String,
    val createdAt: String,
    val statusUrl: String,
)

data class PromptTaskOutcome(
    val taskId: String,
    val status: String,
    val createdAt: String,
    val updatedAt: String,
    val answer: String?,
    val promptText: String?,
    val completedAt: String?,
    val errorCode: String?,
    val errorMessage: String?,
)

class PromptTaskException(
    val code: String,
    override val message: String,
) : IOException(message)

object PromptTaskClient {
    private const val TAG = "PromptTaskClient"
    private const val CONNECT_TIMEOUT_MS = 8_000
    private const val READ_TIMEOUT_MS = 8_000

    fun submitPrompt(
        baseUrl: String,
        screenshotFile: File,
        promptText: String,
    ): PromptAcceptedResult {
        val normalizedBaseUrl = normalizeBaseUrl(baseUrl)
        val boundary = "OpenBubble-${System.currentTimeMillis()}"
        val requestUrl = normalizedBaseUrl.resolve("/prompt").toURL()
        val connection = openConnection(requestUrl).apply {
            requestMethod = "POST"
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        }

        try {
            DataOutputStream(connection.outputStream).use { output ->
                writeTextPart(output, boundary, "promptText", promptText)
                writeFilePart(
                    output = output,
                    boundary = boundary,
                    fieldName = "screenMedia",
                    file = screenshotFile,
                    mimeType = "image/png",
                )
                output.writeBytes("--$boundary--\r\n")
                output.flush()
            }

            val responseCode = connection.responseCode
            val body = readResponseBody(connection)
            if (responseCode !in 200..299) {
                throw PromptTaskException(
                    code = "prompt_rejected",
                    message = parseErrorMessage(body, "Prompt request failed with HTTP $responseCode."),
                )
            }

            val json = JSONObject(body)
            return PromptAcceptedResult(
                taskId = json.optString("taskId"),
                status = json.optString("status"),
                createdAt = json.optString("createdAt"),
                statusUrl = json.optString("statusUrl"),
            )
        } finally {
            connection.disconnect()
        }
    }

    fun pollTask(
        baseUrl: String,
        taskId: String,
        statusUrl: String,
        maxAttempts: Int = 18,
        pollDelayMs: Long = 850L,
    ): PromptTaskOutcome {
        val normalizedBaseUrl = normalizeBaseUrl(baseUrl)
        val resolvedUrl = resolveStatusUrl(normalizedBaseUrl, statusUrl, taskId)

        repeat(maxAttempts) { attempt ->
            val outcome = fetchTask(resolvedUrl)
            when (outcome.status) {
                "completed",
                "failed",
                "error",
                -> return outcome
            }

            if (attempt < maxAttempts - 1) {
                Thread.sleep(pollDelayMs)
            }
        }

        throw PromptTaskException(
            code = "poll_timeout",
            message = "The server accepted the task but did not finish before the polling timeout.",
        )
    }

    private fun fetchTask(url: URL): PromptTaskOutcome {
        val connection = openConnection(url).apply {
            requestMethod = "GET"
            setRequestProperty("Accept", "application/json")
        }

        try {
            val responseCode = connection.responseCode
            val body = readResponseBody(connection)
            if (responseCode !in 200..299) {
                throw PromptTaskException(
                    code = "task_status_failed",
                    message = parseErrorMessage(body, "Task polling failed with HTTP $responseCode."),
                )
            }

            val json = JSONObject(body)
            val result = json.optJSONObject("result")
            val errorDetail = json.optJSONObject("errorDetail")

            return PromptTaskOutcome(
                taskId = json.optString("taskId"),
                status = json.optString("status"),
                createdAt = json.optString("createdAt"),
                updatedAt = json.optString("updatedAt"),
                answer = result?.optString("answer")?.takeIf { it.isNotBlank() },
                promptText = result?.optString("promptText")?.takeIf { it.isNotBlank() },
                completedAt = result?.optString("completedAt")?.takeIf { it.isNotBlank() },
                errorCode = errorDetail?.optString("code")?.takeIf { it.isNotBlank() },
                errorMessage = errorDetail?.optString("message")?.takeIf { it.isNotBlank() },
            )
        } finally {
            connection.disconnect()
        }
    }

    private fun openConnection(url: URL): HttpURLConnection {
        return (url.openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            useCaches = false
            instanceFollowRedirects = true
        }
    }

    private fun resolveStatusUrl(
        baseUrl: URI,
        statusUrl: String,
        taskId: String,
    ): URL {
        val trimmedStatusUrl = statusUrl.trim()
        val resolved =
            if (trimmedStatusUrl.isBlank()) {
                baseUrl.resolve("/tasks/${urlEncode(taskId)}")
            } else {
                baseUrl.resolve(trimmedStatusUrl)
            }

        return resolved.toURL()
    }

    private fun normalizeBaseUrl(baseUrl: String): URI {
        val trimmed = baseUrl.trim()
        if (trimmed.isBlank()) {
            throw PromptTaskException(
                code = "missing_server_url",
                message = "Set the App Server base URL in Open Bubble before sending a prompt.",
            )
        }

        val uri =
            runCatching { URI(trimmed) }.getOrElse {
                throw PromptTaskException(
                    code = "invalid_server_url",
                    message = "The configured App Server URL is invalid.",
                )
            }

        if (uri.scheme.isNullOrBlank() || uri.host.isNullOrBlank()) {
            throw PromptTaskException(
                code = "invalid_server_url",
                message = "The configured App Server URL must include a scheme and host.",
            )
        }

        return uri
    }

    private fun writeTextPart(
        output: DataOutputStream,
        boundary: String,
        fieldName: String,
        value: String,
    ) {
        output.writeBytes("--$boundary\r\n")
        output.writeBytes("Content-Disposition: form-data; name=\"$fieldName\"\r\n")
        output.writeBytes("Content-Type: text/plain; charset=UTF-8\r\n\r\n")
        output.write(value.toByteArray(UTF_8))
        output.writeBytes("\r\n")
    }

    private fun writeFilePart(
        output: DataOutputStream,
        boundary: String,
        fieldName: String,
        file: File,
        mimeType: String,
    ) {
        output.writeBytes("--$boundary\r\n")
        output.writeBytes(
            "Content-Disposition: form-data; name=\"$fieldName\"; filename=\"${file.name}\"\r\n",
        )
        output.writeBytes("Content-Type: $mimeType\r\n\r\n")
        file.inputStream().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var read = input.read(buffer)
            while (read >= 0) {
                if (read > 0) {
                    output.write(buffer, 0, read)
                }
                read = input.read(buffer)
            }
        }
        output.writeBytes("\r\n")
    }

    private fun readResponseBody(connection: HttpURLConnection): String {
        val stream =
            connection.errorStream ?: runCatching { connection.inputStream }.getOrNull() ?: return ""
        BufferedInputStream(stream).use { input ->
            return input.readBytes().toString(UTF_8)
        }
    }

    private fun parseErrorMessage(
        body: String,
        fallback: String,
    ): String {
        if (body.isBlank()) {
            return fallback
        }

        return runCatching {
            val json = JSONObject(body)
            json.optString("message").takeIf { it.isNotBlank() } ?: fallback
        }.getOrElse {
            Log.d(TAG, "parseErrorMessage: failed to parse error body")
            fallback
        }
    }

    private fun urlEncode(value: String): String {
        return URLEncoder.encode(value, UTF_8.name())
    }
}

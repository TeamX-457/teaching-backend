package app.voiceverse

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import java.util.Locale

/**
 * Microphone -> recognition. Delivers final sentences through [Callbacks.onFinal] and
 * restarts itself after the system's silence timeouts while it is running.
 * Must be created and used on the main thread.
 */
class Recognizer(
    private val ctx: Context,
    private val locale: String?,
    private val cb: Callbacks,
) {
    interface Callbacks {
        fun onPartial(text: String)
        fun onFinal(text: String)
        fun onLevel(level: Float)
        fun onListening(listening: Boolean)
        fun onProblem(message: String?)
    }

    private val handler = Handler(Looper.getMainLooper())
    private var rec: SpeechRecognizer? = null
    private var active = false

    // Phones often lack a regional variant (e.g. en-NG); we fall back to the base language (en).
    private var tag: String = locale ?: Locale.getDefault().toLanguageTag()

    private fun intent() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, tag)
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(p: Bundle?) { cb.onListening(true); cb.onProblem(null) }
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rms: Float) { cb.onLevel(((rms + 2f) / 12f).coerceIn(0.15f, 1f)) }
        override fun onBufferReceived(b: ByteArray?) {}
        override fun onEndOfSpeech() { cb.onListening(false) }
        override fun onEvent(t: Int, b: Bundle?) {}

        override fun onPartialResults(b: Bundle?) {
            cb.onPartial(b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty())
        }

        override fun onResults(b: Bundle?) {
            cb.onPartial("")
            val text = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()
            if (text.isNotEmpty()) cb.onFinal(text)
            again(120)
        }

        override fun onError(error: Int) {
            cb.onListening(false)
            when (error) {
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                    cb.onProblem("Microphone access is blocked. Allow it in your phone's app settings."); return
                }
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                    cb.onProblem("Speech recognition needs a connection. Trying again…")
                SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> {
                    if (tag.contains('-')) { tag = tag.substringBefore('-'); again(100); return }
                    cb.onProblem("This language can't be recognised on this phone."); return
                }
            }
            again(if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) 150 else 900)
        }
    }

    fun start() {
        if (active) return
        if (!SpeechRecognizer.isRecognitionAvailable(ctx)) {
            cb.onProblem("Speech recognition isn't available on this phone."); return
        }
        active = true
        rec = SpeechRecognizer.createSpeechRecognizer(ctx).also { it.setRecognitionListener(listener) }
        begin()
    }

    fun stop() {
        active = false
        handler.removeCallbacksAndMessages(null)
        runCatching { rec?.cancel(); rec?.destroy() }
        rec = null
        cb.onListening(false)
    }

    private fun begin() { if (active) runCatching { rec?.startListening(intent()) } }
    private fun again(delayMs: Long) { if (active) handler.postDelayed({ begin() }, delayMs) }
}

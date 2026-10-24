package app.voiceverse

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import kotlin.coroutines.resume

/**
 * Speaks sentences with audio made by the server, one after another.
 *
 * Phones have no voice for Hausa, Yoruba or Igbo, so their engines spell the words out letter by letter.
 * The server pronounces these languages properly. Each sentence's audio is requested the moment it is queued,
 * so the next one is usually ready when the previous one ends.
 *
 * Must be created and used on the main thread.
 */
class CloudSpeaker(
    private val ctx: Context,
    private val api: Api,
    private val scope: CoroutineScope,
    /** Called (at most once per few seconds) when audio could not be made. */
    private val onFailure: () -> Unit,
) {
    private class Item(val generation: Int, val audio: Deferred<ByteArray?>)

    private val queue = Channel<Item>(Channel.UNLIMITED)
    private var generation = 0
    private var player: MediaPlayer? = null
    private var waiting: CancellableContinuation<Unit>? = null
    private var lastFailureAt = 0L

    init {
        scope.launch { for (item in queue) play(item) }
    }

    fun speak(text: String, language: String, rate: Float) {
        val audio = scope.async { api.speech(text, language, rate) }
        queue.trySend(Item(generation, audio))
    }

    /** Stops what is playing and forgets everything queued. */
    fun stop() {
        generation++
        runCatching { player?.stop() }
        runCatching { player?.release() }
        player = null
        // A released player never reports completion, so wake the queue ourselves.
        waiting?.takeIf { it.isActive }?.resume(Unit)
        waiting = null
    }

    private suspend fun play(item: Item) {
        if (item.generation != generation) { item.audio.cancel(); return }
        val bytes = item.audio.await()
        if (item.generation != generation) return
        if (bytes == null) {
            val now = System.currentTimeMillis()
            if (now - lastFailureAt > 8_000) { lastFailureAt = now; onFailure() }
            return
        }
        val file = File.createTempFile("vv-speech", ".mp3", ctx.cacheDir)
        try {
            file.writeBytes(bytes)
            suspendCancellableCoroutine { cont ->
                waiting = cont
                val mp = MediaPlayer()
                player = mp
                fun done() { if (cont.isActive) cont.resume(Unit) }
                try {
                    mp.setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build(),
                    )
                    mp.setDataSource(file.path)
                    mp.setOnPreparedListener { it.start() }
                    mp.setOnCompletionListener { done() }
                    mp.setOnErrorListener { _, _, _ -> done(); true }
                    mp.prepareAsync()
                } catch (e: Exception) { done() }
                cont.invokeOnCancellation { runCatching { mp.release() } }
            }
        } finally {
            waiting = null
            runCatching { player?.release() }
            player = null
            file.delete()
        }
    }
}

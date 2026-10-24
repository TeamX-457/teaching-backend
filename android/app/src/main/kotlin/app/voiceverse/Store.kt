package app.voiceverse

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

@Serializable
data class AppSettings(
    val inputLang: String = "en",
    val outputLang: String = "fr",
    val audioOutput: Boolean = true,
    val playbackRate: Float = 1f,
    val textSize: String = "default",
    val subtitleSize: Int = 24,
    val highContrast: Boolean = false,
    val reducedMotion: Boolean = false,
    val saveHistory: Boolean = true,
    val retention: String = "30",
    val theme: String = "system",
)

@Serializable data class Segment(val id: String, val original: String, val translated: String = "", val t: Int = 0)

@Serializable
data class SavedSession(
    val id: String, val title: String, val context: String, val startedAt: Long,
    val durationSec: Int, val from: String, val to: String, val segments: List<Segment>,
)

/** Settings and session history. Kept on this device only, like the website. */
class Store(ctx: Context) {
    private val prefs = ctx.getSharedPreferences("vv_store", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    var settings by mutableStateOf(AppSettings())
        private set
    val sessions = mutableStateListOf<SavedSession>()

    init {
        prefs.getString("settings", null)?.let { raw ->
            runCatching { settings = json.decodeFromString<AppSettings>(raw) }
        }
        prefs.getString("sessions", null)?.let { raw ->
            runCatching { sessions.addAll(json.decodeFromString(ListSerializer(SavedSession.serializer()), raw)) }
        }
        pruneExpired()
    }

    fun update(change: (AppSettings) -> AppSettings) {
        settings = change(settings)
        prefs.edit().putString("settings", json.encodeToString(AppSettings.serializer(), settings)).apply()
    }

    fun add(s: SavedSession) { sessions.add(0, s); persist() }
    fun delete(id: String) { sessions.removeAll { it.id == id }; persist() }
    fun clear() { sessions.clear(); persist() }
    fun find(id: String): SavedSession? = sessions.firstOrNull { it.id == id }

    private fun pruneExpired() {
        val r = settings.retention
        if (r == "forever") return
        val days = r.toLongOrNull() ?: return
        val cutoff = System.currentTimeMillis() - days * 86_400_000L
        if (sessions.removeAll { it.startedAt < cutoff }) persist()
    }

    private fun persist() {
        prefs.edit().putString("sessions", json.encodeToString(ListSerializer(SavedSession.serializer()), sessions.toList())).apply()
    }
}

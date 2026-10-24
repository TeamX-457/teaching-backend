package app.voiceverse

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.speech.tts.TextToSpeech
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.Locale

/**
 * Personal listening session. It lives in the app shell, not in the tab, so switching tabs
 * or rotating the phone never loses the session or its transcript.
 */
class ListenController(
    private val ctx: Context,
    private val api: Api,
    private val store: Store,
    private val scope: CoroutineScope,
    private val onSaved: (String) -> Unit,
) {
    enum class Stage { Setup, Listening, Paused }

    // Set-up
    var langs by mutableStateOf<List<LangCfg>?>(null)
    var providerReady by mutableStateOf(true)
    var loadError by mutableStateOf<String?>(null)
    var from by mutableStateOf(store.settings.inputLang)
    var to by mutableStateOf(store.settings.outputLang)
    var venue by mutableStateOf("classroom")
    var audio by mutableStateOf(store.settings.audioOutput)
    var size by mutableFloatStateOf(store.settings.subtitleSize.toFloat())

    // Live
    var stage by mutableStateOf(Stage.Setup)
        private set
    val segments = mutableStateListOf<Segment>()
    var partial by mutableStateOf("")
        private set
    var elapsed by mutableIntStateOf(0)
        private set
    var level by mutableFloatStateOf(0.3f)
        private set
    var hearing by mutableStateOf(false)
        private set
    var pending by mutableIntStateOf(0)
        private set
    var problem by mutableStateOf<String?>(null)

    private var startedAt = 0L
    private var recognizer: Recognizer? = null
    private var timer: Job? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    // Hausa, Yoruba and Igbo: phones cannot pronounce them, so the server makes the audio.
    private val cloud = CloudSpeaker(ctx, api, scope) {
        problem = "Spoken audio isn't available right now. You can still read the text."
    }

    val isLive get() = stage != Stage.Setup
    val translating get() = from != to
    val fromCfg get() = langs?.firstOrNull { it.code == from }
    val toCfg get() = langs?.firstOrNull { it.code == to }

    init {
        tts = TextToSpeech(ctx) { status -> ttsReady = status == TextToSpeech.SUCCESS }
        load()
    }

    fun load() {
        loadError = null
        scope.launch {
            try {
                val r = api.languagesFull()
                langs = r.languages
                providerReady = r.translationProviderConfigured
                if (r.languages.none { it.code == from && it.speechRecognition.supported }) from = "en"
                if (r.languages.none { it.code == to }) to = r.languages.firstOrNull { it.translation }?.code ?: "en"
            } catch (e: ApiException) { loadError = e.message }
        }
    }

    private val callbacks = object : Recognizer.Callbacks {
        override fun onPartial(text: String) { partial = text }
        override fun onFinal(text: String) { handleFinal(text) }
        override fun onLevel(level: Float) { this@ListenController.level = level }
        override fun onListening(listening: Boolean) { hearing = listening }
        override fun onProblem(message: String?) { problem = message }
    }

    private fun speak(text: String, id: String) {
        if (!audio || !translating) return
        if (toCfg?.textToSpeech?.cloud == true) {
            cloud.speak(text, to, store.settings.playbackRate)
            return
        }
        if (!ttsReady) return
        val e = tts ?: return
        e.language = Locale.forLanguageTag(toCfg?.textToSpeech?.locale ?: to)
        e.setSpeechRate(store.settings.playbackRate)
        e.speak(text, TextToSpeech.QUEUE_ADD, null, id)
    }

    private fun handleFinal(text: String) {
        val id = "g${System.nanoTime()}"
        segments.add(Segment(id, text, "", elapsed))
        if (!translating) return
        val src = from; val dst = to
        pending++
        scope.launch {
            try {
                val r = api.translate(text, src, dst)
                if (r.translated) {
                    val i = segments.indexOfFirst { it.id == id }
                    if (i >= 0) segments[i] = segments[i].copy(translated = r.text)
                    speak(r.text, id)
                } else {
                    problem = "Can't translate this right now. The original words are still shown."
                }
            } catch (e: ApiException) {
                problem = "Can't translate this right now. The original words are still shown."
            } finally { pending-- }
        }
    }

    fun begin() {
        problem = null
        if (stage == Stage.Setup) { startedAt = System.currentTimeMillis(); elapsed = 0; segments.clear(); partial = "" }
        stage = Stage.Listening
        recognizer?.stop()
        recognizer = Recognizer(ctx, fromCfg?.speechRecognition?.locale, callbacks).also { it.start() }
        timer?.cancel()
        timer = scope.launch { while (isActive) { delay(1000); elapsed++ } }
    }

    fun pause() {
        recognizer?.stop(); recognizer = null
        timer?.cancel()
        stage = Stage.Paused; partial = ""; hearing = false
    }

    /** Ends the session and, if there is anything to keep, saves it to History. */
    fun finish() {
        recognizer?.stop(); recognizer = null
        timer?.cancel()
        tts?.stop()
        cloud.stop()
        val keep = segments.toList()
        val duration = elapsed
        val started = startedAt
        stage = Stage.Setup; partial = ""; hearing = false
        segments.clear()
        if (keep.isNotEmpty() && store.settings.saveHistory) {
            val id = "s-$started"
            val date = java.text.SimpleDateFormat("d MMM", Locale.getDefault()).format(java.util.Date(started))
            store.add(SavedSession(id, "${venueLabel(venue)} · $date", venueLabel(venue), started, duration, from, to, keep))
            onSaved(id)
        }
    }

    fun release() {
        recognizer?.stop(); recognizer = null
        timer?.cancel()
        cloud.stop()
        tts?.shutdown(); tts = null
    }
}

@Composable
fun ListenTab(c: ListenController) {
    val ctx = LocalContext.current
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) c.begin() else c.problem = "Microphone access is blocked. Allow it in your phone's app settings, then try again."
    }
    fun requestStart() {
        val granted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if (granted) c.begin() else permission.launch(Manifest.permission.RECORD_AUDIO)
    }

    val list = rememberLazyListState()
    LaunchedEffect(c.segments.size) { if (c.segments.isNotEmpty()) list.animateScrollToItem(c.segments.lastIndex) }

    ScreenFrame(if (!c.isLive) "Start listening" else venueLabel(c.venue)) {
        if (!c.isLive) {
            ScrollBody {
                Muted("Choose what is being spoken and the language you want to understand.")
                val all = c.langs
                when {
                    all != null -> {
                        Card2 {
                            LangPicker("Language being spoken", c.from, all.filter { it.speechRecognition.supported }, { c.from = it })
                            Spacer(Modifier.height(14.dp))
                            LangPicker("Language I understand", c.to, all.filter { it.translation || it.code == c.from }, { c.to = it })
                            Spacer(Modifier.height(14.dp))
                            ChoiceRow("Where are you?", VENUES, c.venue) { c.venue = it }
                            if (c.translating && !c.providerReady && !(c.from == "en" && c.to == "ibb")) {
                                Spacer(Modifier.height(6.dp))
                                Muted("We can't translate into other languages yet. Subtitles will still appear in the language being spoken.")
                            }
                            ErrorLine(c.problem)
                            Spacer(Modifier.height(16.dp))
                            Button(::requestStart, Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(16.dp)) {
                                Icon(Icons.Filled.Mic, null, Modifier.size(20.dp)); Spacer(Modifier.size(8.dp)); Text("Start listening")
                            }
                        }
                        Muted("Hold your phone towards the speaker. Audio is processed as you listen and is never stored. Only the text is kept, on this phone, if you choose.")
                    }
                    c.loadError != null -> Card2 {
                        Text("Can't reach Voice Verse", style = MaterialTheme.typography.titleMedium)
                        Muted(c.loadError ?: "")
                        Spacer(Modifier.height(12.dp))
                        OutlinedButton({ c.load() }, shape = RoundedCornerShape(14.dp)) { Text("Try again") }
                    }
                    else -> { SkeletonCard(); SkeletonCard() }
                }
            }
        } else {
            Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Waveform(
                        Modifier.size(width = 44.dp, height = 26.dp), bars = 5, barWidth = 5.dp, gap = 4.dp,
                        level = if (c.stage == ListenController.Stage.Listening && c.hearing) c.level else 0.12f,
                        color = if (c.stage == ListenController.Stage.Listening) Mint else MaterialTheme.colorScheme.outline,
                    )
                    Spacer(Modifier.size(10.dp))
                    Text(
                        if (c.stage == ListenController.Stage.Paused) "Paused" else if (c.hearing) "Listening" else "Ready",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.weight(1f))
                    Text(fmtClock(c.elapsed), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
                }
                Spacer(Modifier.height(12.dp))

                val last = c.segments.lastOrNull()
                val current = c.partial.ifEmpty { last?.original.orEmpty() }
                val translated = if (c.partial.isEmpty()) last?.translated.orEmpty() else ""
                Box(Modifier.fillMaxWidth().background(Ink, RoundedCornerShape(24.dp)).padding(20.dp)) {
                    Column {
                        Text(
                            "${c.fromCfg?.name ?: c.from}${if (c.translating) " → ${c.toCfg?.name ?: c.to}" else ""}",
                            color = Paper.copy(alpha = 0.55f), style = MaterialTheme.typography.labelMedium,
                        )
                        Spacer(Modifier.height(10.dp))
                        Text(
                            current.ifEmpty { "Waiting for someone to speak…" },
                            color = if (current.isEmpty()) Paper.copy(alpha = 0.5f) else Paper,
                            fontSize = c.size.sp, lineHeight = (c.size * 1.3f).sp, fontWeight = FontWeight.Medium,
                        )
                        if (c.translating) {
                            Spacer(Modifier.height(12.dp))
                            Text(
                                translated.ifEmpty { if (c.pending > 0) "Translating…" else "" },
                                color = Mint, fontSize = c.size.sp, lineHeight = (c.size * 1.3f).sp,
                            )
                        }
                    }
                }
                AnimatedVisibility(c.problem != null) {
                    Text(c.problem ?: "", color = Amber, modifier = Modifier.padding(top = 10.dp), style = MaterialTheme.typography.bodyMedium)
                }

                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (c.stage == ListenController.Stage.Paused) {
                        OutlinedButton(::requestStart, Modifier.weight(1f).height(50.dp), shape = RoundedCornerShape(14.dp)) {
                            Icon(Icons.Filled.PlayArrow, null, Modifier.size(18.dp)); Spacer(Modifier.size(6.dp)); Text("Resume")
                        }
                    } else {
                        OutlinedButton({ c.pause() }, Modifier.weight(1f).height(50.dp), shape = RoundedCornerShape(14.dp)) {
                            Icon(Icons.Filled.Pause, null, Modifier.size(18.dp)); Spacer(Modifier.size(6.dp)); Text("Pause")
                        }
                    }
                    Button({ c.finish() }, Modifier.weight(1f).height(50.dp), shape = RoundedCornerShape(14.dp)) {
                        Icon(Icons.Filled.Stop, null, Modifier.size(18.dp)); Spacer(Modifier.size(6.dp)); Text("Stop & save")
                    }
                }
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Subtitle size", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Slider(c.size, { c.size = it }, valueRange = 16f..56f, modifier = Modifier.weight(1f).padding(horizontal = 10.dp))
                    Text("${c.size.toInt()}", style = MaterialTheme.typography.labelMedium)
                }
                if (c.translating) SwitchRow("Speak the translation", c.audio, { c.audio = it })

                SectionLabel("Transcript")
                Spacer(Modifier.height(6.dp))
                if (c.segments.isEmpty()) Muted("Sentences appear here as they're spoken.")
                LazyColumn(state = list, modifier = Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(c.segments.size, key = { c.segments[it].id }) { i ->
                        val s = c.segments[i]
                        Column {
                            Text(fmtClock(s.t), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(s.original)
                            if (s.translated.isNotEmpty()) Text(s.translated, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    }
}

package app.voiceverse

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Locale

// ───────────────────────── Listen ─────────────────────────

@Composable
fun ListenScreen(api: Api, code: String, onBack: () -> Unit) {
    val ctx = LocalContext.current
    var session by remember { mutableStateOf<LiveSession?>(null) }
    var langs by remember { mutableStateOf<List<LangCfg>>(emptyList()) }
    var allLangs by remember { mutableStateOf<List<LangCfg>>(emptyList()) }
    var lang by remember { mutableStateOf<String?>(null) }
    var ended by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var speak by remember { mutableStateOf(false) }
    var billing by remember { mutableStateOf<SessionBilling?>(null) }
    val lines = remember { mutableStateListOf<Caption>() }
    val list = rememberLazyListState()

    val tts = remember { mutableStateOf<TextToSpeech?>(null) }
    val scope = rememberCoroutineScope()
    val cloud = remember { CloudSpeaker(ctx, api, scope) { error = "Spoken audio isn't available right now. You can still read the text." } }
    DisposableEffect(Unit) {
        var engine: TextToSpeech? = null
        engine = TextToSpeech(ctx) { status -> if (status == TextToSpeech.SUCCESS) tts.value = engine }
        onDispose { engine?.shutdown(); tts.value = null; cloud.stop() }
    }

    LaunchedEffect(code) {
        runCatching { session = api.get(code); billing = session?.billing }
        runCatching { allLangs = api.languages(); langs = allLangs.filter { it.translation } }
    }

    // Real time: each request waits on the server and is answered the moment the speaker's next line arrives.
    // Restarts from scratch whenever the language changes.
    LaunchedEffect(code, lang) {
        lines.clear()
        var after = 0
        var first = true
        while (true) {
            val started = System.currentTimeMillis()
            try {
                val page = api.captions(code, after, lang, if (first) 0 else 20)
                first = false
                page.billing?.let { billing = it }
                error = null
                page.captions.forEach { c ->
                    lines.add(c)
                    after = maxOf(after, c.seq)
                    if (speak && page.status == "live") {
                        // Say it in the language it is actually written in.
                        val say = c.translatedText ?: c.text
                        val spoken = if (c.translated && lang != null) lang!! else (session?.sourceLang ?: "en")
                        if (allLangs.firstOrNull { it.code == spoken }?.textToSpeech?.cloud == true) {
                            if (billing?.voice == "none") {
                                error = "The speaker hasn't turned on spoken voice for this session. You can still read the text."
                            } else {
                                cloud.speak(say, spoken, 1f, code)
                            }
                        } else {
                            tts.value?.apply {
                                language = Locale.forLanguageTag(spoken)
                                speak(say, TextToSpeech.QUEUE_ADD, null, "c${c.seq}")
                            }
                        }
                    }
                }
                if (page.status == "ended") { ended = true; break }
            } catch (e: ApiException) {
                error = e.message
                delay(1500)
            }
            // A server that answers at once must not turn this into a tight loop.
            val spent = System.currentTimeMillis() - started
            if (spent < 400) delay(800 - spent)
        }
    }
    LaunchedEffect(lines.size) { if (lines.isNotEmpty()) list.animateScrollToItem(lines.lastIndex) }

    Column(Modifier.fillMaxSize().background(Ink).systemBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Paper) }
            Column(Modifier.weight(1f)) {
                Text(session?.title ?: "Joining…", color = Paper, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                Text(
                    session?.hostName?.let { "Hosted by $it · $code" } ?: code,
                    color = Paper.copy(alpha = 0.6f), style = MaterialTheme.typography.bodyMedium, maxLines = 1,
                )
            }
            if (!ended) {
                Waveform(Modifier.size(width = 36.dp, height = 24.dp), bars = 4, barWidth = 4.dp, gap = 3.dp, level = 0.8f)
                Spacer(Modifier.size(8.dp))
            }
            IconButton({ speak = !speak }) {
                Icon(Icons.AutoMirrored.Filled.VolumeUp, "Read aloud", tint = if (speak) Mint else Paper.copy(alpha = 0.5f))
            }
        }

        if (langs.isNotEmpty()) {
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { FilterChip(lang == null, { lang = null }, label = { Text("Original") }) }
                items(langs, key = { it.code }) { l -> FilterChip(lang == l.code, { lang = l.code }, label = { Text(l.name) }) }
            }
            Spacer(Modifier.height(8.dp))
        }

        AnimatedVisibility(error != null) {
            Text(error ?: "", color = Amber, modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp), style = MaterialTheme.typography.bodyMedium)
        }

        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (lines.isEmpty() && !ended) {
                Column(Modifier.align(Alignment.Center).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Waveform(Modifier.size(width = 90.dp, height = 56.dp), level = 0.5f)
                    Spacer(Modifier.height(18.dp))
                    Text("Waiting for the speaker…", color = Paper.copy(alpha = 0.7f), style = MaterialTheme.typography.bodyLarge)
                }
            }
            LazyColumn(
                state = list, contentPadding = PaddingValues(horizontal = 22.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                items(lines.size, key = { lines[it].seq }) { i ->
                    val latest = i == lines.lastIndex
                    val color by animateColorAsState(if (latest) Paper else Paper.copy(alpha = 0.5f), label = "c")
                    Text(
                        lines[i].translatedText ?: lines[i].text,
                        color = color, fontSize = if (latest) 26.sp else 20.sp, lineHeight = if (latest) 34.sp else 28.sp,
                        fontWeight = if (latest) FontWeight.Medium else FontWeight.Normal,
                    )
                }
            }
        }

        if (ended) {
            Row(
                Modifier.fillMaxWidth().background(Color.White.copy(alpha = 0.06f)).padding(18.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("This session has ended.", color = Paper, modifier = Modifier.weight(1f))
                Button(onBack, shape = RoundedCornerShape(12.dp)) { Text("Done") }
            }
        }
    }
}

// ───────────────────────── Host ─────────────────────────

@Composable
fun HostScreen(api: Api, code: String, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var session by remember { mutableStateOf<LiveSession?>(null) }
    var locale by remember { mutableStateOf<String?>(null) }
    var localeReady by remember { mutableStateOf(false) }
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) }
    var listening by remember { mutableStateOf(false) }
    var partial by remember { mutableStateOf("") }
    var level by remember { mutableFloatStateOf(0.3f) }
    var problem by remember { mutableStateOf<String?>(null) }
    var confirmEnd by remember { mutableStateOf(false) }
    var ending by remember { mutableStateOf(false) }
    var usage by remember { mutableStateOf<SessionUsage?>(null) }
    val sent = remember { mutableStateListOf<String>() }

    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    LaunchedEffect(Unit) { if (!granted) ask.launch(Manifest.permission.RECORD_AUDIO) }

    LaunchedEffect(code) {
        runCatching {
            val s = api.get(code); session = s
            locale = api.languages().firstOrNull { it.code == s.sourceLang }?.speechRecognition?.locale
        }
        localeReady = true
        while (true) {
            runCatching { usage = api.usage(code) }
            delay(8000)
            runCatching { session = api.get(code) }
        }
    }

    // Start once we know the session's language and have the microphone.
    DisposableEffect(granted, localeReady) {
        if (!granted || !localeReady) return@DisposableEffect onDispose { }
        val r = Recognizer(ctx, locale, object : Recognizer.Callbacks {
            override fun onPartial(text: String) { partial = text }
            override fun onLevel(level0: Float) { level = level0 }
            override fun onListening(isListening: Boolean) { listening = isListening }
            override fun onProblem(message: String?) { problem = message }
            override fun onFinal(text: String) {
                sent.add(text)
                scope.launch {
                    // One retry, so a brief network drop does not lose a sentence for listeners.
                    var attempt = 0
                    while (true) {
                        try { api.addCaption(code, text); break }
                        catch (e: ApiException) {
                            if (++attempt >= 2 || e.status in 400..499) { problem = "A sentence didn't reach listeners: ${e.message}"; break }
                            delay(1500)
                        }
                    }
                }
            }
        })
        r.start()
        onDispose { r.stop() }
    }

    val list = rememberLazyListState()
    LaunchedEffect(sent.size) { if (sent.isNotEmpty()) list.animateScrollToItem(sent.lastIndex) }

    Column(Modifier.fillMaxSize().background(Ink).systemBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Paper) }
            Column(Modifier.weight(1f)) {
                Text(session?.title ?: "Starting…", color = Paper, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                Text(
                    "${session?.listenerCount ?: 0} listening",
                    color = Paper.copy(alpha = 0.6f), style = MaterialTheme.typography.bodyMedium,
                )
            }
        }

        Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("SESSION CODE", color = Paper.copy(alpha = 0.5f), style = MaterialTheme.typography.labelMedium)
            Text(code, color = Mint, fontSize = 44.sp, fontWeight = FontWeight.Bold, letterSpacing = 6.sp)
            Text("Share this code so people can listen in.", color = Paper.copy(alpha = 0.6f), style = MaterialTheme.typography.bodyMedium)
        }

        usage?.let { u ->
            val left = listOfNotNull(u.secondsLeft, u.secondsUntilCap).minOrNull()
            Column(Modifier.fillMaxWidth().padding(horizontal = 22.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "Running ${fmtDuration(u.sessionSeconds)}" + (left?.let { " · ${fmtDuration(it)} left" } ?: ""),
                    color = Paper.copy(alpha = 0.7f), style = MaterialTheme.typography.bodyMedium,
                )
                if (u.backupVoice) Text("The local voice is on its backup. Your time isn't being used while that lasts.", color = Mint, style = MaterialTheme.typography.bodyMedium)
                if (left != null && left < 600 && u.stopped == null) Text("Your time is almost used. Add time under More, Time and plans.", color = Amber, style = MaterialTheme.typography.bodyMedium)
                if (u.stopped == "out_of_time") Text("Your time has run out, so translation and voice have stopped. Add time and they resume.", color = Rose, style = MaterialTheme.typography.bodyMedium)
                if (u.stopped == "cap_reached") Text("This session reached the length you chose, so translation and voice have stopped.", color = Rose, style = MaterialTheme.typography.bodyMedium)
            }
        }

        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (sent.isEmpty() && partial.isEmpty()) {
                Text(
                    if (granted) "Start speaking — your words appear here and on every listener's screen." else "Allow the microphone to begin.",
                    color = Paper.copy(alpha = 0.6f), modifier = Modifier.align(Alignment.Center).padding(32.dp),
                )
            }
            LazyColumn(state = list, contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                items(sent.size) { i -> Text(sent[i], color = Paper.copy(alpha = 0.55f), fontSize = 19.sp, lineHeight = 27.sp) }
                if (partial.isNotEmpty()) item { Text(partial, color = Paper, fontSize = 24.sp, lineHeight = 32.sp) }
            }
        }

        AnimatedVisibility(problem != null) {
            Text(problem ?: "", color = Amber, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.bodyMedium)
        }

        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Mic, null, tint = if (listening) Mint else Paper.copy(alpha = 0.4f))
                Spacer(Modifier.size(10.dp))
                Waveform(Modifier.size(width = 70.dp, height = 28.dp), bars = 7, barWidth = 5.dp, gap = 4.dp, level = if (listening) level else 0.1f,
                    color = if (listening) Mint else Paper.copy(alpha = 0.3f))
                Spacer(Modifier.size(10.dp))
                Text(if (listening) "Listening" else "Paused", color = Paper.copy(alpha = 0.7f))
            }
            Button(
                { confirmEnd = true }, enabled = !ending, shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Rose),
            ) {
                Icon(Icons.Filled.Stop, null, Modifier.size(18.dp)); Spacer(Modifier.size(6.dp)); Text("End session")
            }
        }
    }

    if (confirmEnd) {
        AlertDialog(
            onDismissRequest = { confirmEnd = false },
            title = { Text("End this session?") },
            text = { Text("Listeners will be told the session has finished. This can't be undone.") },
            confirmButton = {
                TextButton({
                    confirmEnd = false; ending = true
                    scope.launch {
                        runCatching { api.end(code) }
                        ending = false; onBack()
                    }
                }) { Text("End session", color = Rose) }
            },
            dismissButton = { TextButton({ confirmEnd = false }) { Text("Keep going") } },
        )
    }
}

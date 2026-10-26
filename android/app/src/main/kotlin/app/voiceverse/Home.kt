package app.voiceverse

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Joins a session by code and reports problems in plain words. */
class JoinState(private val api: Api, private val scope: CoroutineScope, private val open: (String) -> Unit) {
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)

    fun join(raw: String) {
        val code = raw.trim().uppercase()
        if (code.isEmpty() || busy) return
        busy = true; error = null
        scope.launch {
            try {
                val s = api.get(code)
                api.join(s.code)
                open(s.code)
            } catch (e: ApiException) {
                error = if (e.status == 404) "No session with that code. Check it and try again." else e.message
            } finally { busy = false }
        }
    }
}

/** Sessions the signed-in person was invited to, refreshed while the app is open. */
class Feed(private val api: Api) {
    var invited by mutableStateOf<List<InvitedSession>?>(null)
        private set

    suspend fun run() {
        while (true) {
            invited = runCatching { api.invited() }.getOrDefault(emptyList())
            delay(20_000)
        }
    }
}

@Composable
private fun JoinForm(join: JoinState, buttonLabel: String = "Join") {
    var code by remember { mutableStateOf("") }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(
            code, { code = it.uppercase().filter { c -> c.isLetterOrDigit() }.take(8) }, singleLine = true,
            placeholder = { Text("K7M2QX") }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(14.dp),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, keyboardType = KeyboardType.Ascii),
        )
        Button({ join.join(code) }, enabled = !join.busy && code.isNotBlank(), modifier = Modifier.height(56.dp), shape = RoundedCornerShape(14.dp)) {
            if (join.busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
            else Text(buttonLabel)
        }
    }
    ErrorLine(join.error)
}

@Composable
fun InvitedList(feed: Feed, join: JoinState) {
    SectionLabel("Invited to")
    val inv = feed.invited
    when {
        inv == null -> SkeletonCard()
        inv.isEmpty() -> Muted("When a host invites you, the session appears here.")
        else -> inv.forEach { s ->
            SessionRow(s.title, s.hostName?.let { "Hosted by $it" } ?: venueLabel(s.venueType), "LIVE", true) { join.join(s.code) }
        }
    }
}

// ───────────────────────── Home ─────────────────────────

@Composable
fun HomeTab(
    user: AuthUser, store: Store, feed: Feed, join: JoinState,
    onListen: () -> Unit, onHostHub: () -> Unit, onOpenHistory: (String) -> Unit, onAllHistory: () -> Unit,
) {
    val sessions = store.sessions
    val total = sessions.sumOf { it.durationSec }
    val lines = sessions.sumOf { it.segments.size }
    ScreenFrame("Hello, ${user.name.substringBefore(' ')}") {
        ScrollBody {
            Muted("Start a listening session, or join a speaker's room with a code.")

            // Primary action
            Box(Modifier.fillMaxWidth().background(Ink, RoundedCornerShape(24.dp)).padding(22.dp)) {
                Column {
                    Icon(Icons.Filled.Mic, null, tint = Mint)
                    Spacer(Modifier.height(14.dp))
                    Text("Listen to the room, in your language.", style = MaterialTheme.typography.headlineSmall, color = Paper)
                    Spacer(Modifier.height(6.dp))
                    Text("Use your phone's microphone to turn what you hear into subtitles and translation.", color = Paper.copy(alpha = 0.7f), style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(18.dp))
                    Button(onListen, colors = ButtonDefaults.buttonColors(containerColor = Paper, contentColor = Ink), shape = RoundedCornerShape(14.dp)) {
                        Text("Start listening")
                    }
                }
            }

            Card2 {
                Text("Join a speaker's session", style = MaterialTheme.typography.titleMedium)
                Muted("Enter the code shown by the speaker.")
                Spacer(Modifier.height(12.dp))
                JoinForm(join)
                if (user.role == "educator") {
                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(onHostHub, Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                        Icon(Icons.Filled.Campaign, null, Modifier.size(18.dp)); Spacer(Modifier.size(8.dp)); Text("Host a session")
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Stat(Icons.Filled.History, sessions.size.toString(), "Sessions", Modifier.weight(1f))
                Stat(Icons.Filled.Schedule, if (total > 0) fmtDuration(total) else "0s", "Listened", Modifier.weight(1f))
                Stat(Icons.Filled.Mic, lines.toString(), "Sentences", Modifier.weight(1f))
            }

            InvitedList(feed, join)

            SectionLabel("Recent sessions")
            if (sessions.isEmpty()) {
                Card2 {
                    Text("No sessions yet", style = MaterialTheme.typography.titleMedium)
                    Muted("Sessions you listen to are saved here, on this phone only.")
                }
            } else {
                sessions.take(5).forEach { s ->
                    SessionRow(s.title, "${fmtDuration(s.durationSec)} · ${s.segments.size} sentences", "", false) { onOpenHistory(s.id) }
                }
                if (sessions.size > 5) OutlinedButton(onAllHistory, Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) { Text("See all history") }
            }
        }
    }
}

@Composable
private fun Stat(icon: androidx.compose.ui.graphics.vector.ImageVector, value: String, label: String, modifier: Modifier) {
    Card2(modifier) {
        Icon(icon, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        Text(value, style = MaterialTheme.typography.headlineSmall, maxLines = 1)
        Muted(label)
    }
}

// ───────────────────────── Join tab ─────────────────────────

@Composable
fun JoinTab(feed: Feed, join: JoinState) {
    ScreenFrame("Join a session") {
        ScrollBody {
            Muted("Ask the speaker for their code. You don't need to speak, and listeners don't need to turn on the microphone.")
            Card2 { JoinForm(join) }
            InvitedList(feed, join)
        }
    }
}

// ───────────────────────── Host hub ─────────────────────────

@Composable
fun HostHub(api: Api, onBack: () -> Unit, onBilling: () -> Unit, onOpen: (code: String, live: Boolean) -> Unit) {
    val scope = rememberCoroutineScope()
    var langs by remember { mutableStateOf<List<LangCfg>>(emptyList()) }
    var mine by remember { mutableStateOf<List<LiveSession>?>(null) }
    var title by remember { mutableStateOf("") }
    var venue by remember { mutableStateOf("classroom") }
    var lang by remember { mutableStateOf("en") }
    var creating by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var tier by remember { mutableStateOf("captions") }
    var voices by remember { mutableStateOf("1") }
    var minutes by remember { mutableStateOf("60") }
    var est by remember { mutableStateOf<Estimate?>(null) }
    var needTime by remember { mutableStateOf(false) }

    // Start at the best level the speaker has time for.
    LaunchedEffect(Unit) {
        runCatching {
            val b = api.me().balance
            tier = if (b.local.seconds > 0) "local" else if (b.standard.seconds > 0) "standard" else "captions"
        }
    }
    LaunchedEffect(tier, minutes, voices) {
        est = runCatching { api.estimate(tier, minutes.toInt(), if (tier == "captions") 1 else voices.toInt()) }.getOrNull()
    }

    LaunchedEffect(Unit) {
        runCatching { langs = api.languages().filter { it.speechRecognition.supported } }
        while (true) { mine = runCatching { api.mine() }.getOrDefault(emptyList()); delay(15_000) }
    }

    ScreenFrame("Host a session", onBack) {
        ScrollBody {
            Card2 {
                Text("Start a session", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(title, { title = it }, label = { Text("Title") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp))
                Spacer(Modifier.height(12.dp))
                ChoiceRow("Where are you?", VENUES, venue) { venue = it }
                if (langs.isNotEmpty()) LangPicker("Language you will speak", lang, langs, { lang = it })
                ChoiceRow(
                    "What your audience gets",
                    listOf("captions" to "Captions", "standard" to "Standard voice", "local" to "Local voice"),
                    tier,
                ) { tier = it }
                ChoiceRow(
                    "How long will you speak?",
                    listOf("30" to "30 min", "60" to "1 hour", "120" to "2 hours", "180" to "3 hours", "300" to "5 hours", "480" to "8 hours", "600" to "10 hours"),
                    minutes,
                ) { minutes = it }
                if (tier != "captions") {
                    ChoiceRow("Languages spoken aloud at once", listOf("1" to "1", "2" to "2", "3" to "3"), voices) { voices = it }
                    Muted("Each extra language that speaks aloud uses your time at the same speed.")
                }
                est?.let { e ->
                    Spacer(Modifier.height(8.dp))
                    Text("This session can use up to ${e.usesHours} h of your time", style = MaterialTheme.typography.titleMedium)
                    Muted(
                        if (e.enough) "You have ${e.haveHours} h, so about ${e.leftAfterHours} h would be left. The session stops at the length you chose."
                        else "You have ${e.haveHours} h. You need about ${e.buyHours} more.",
                    )
                    if (!e.enough) androidx.compose.material3.TextButton(onBilling) { Text("Add time") }
                }
                if (needTime) {
                    Muted("You need more time to start this session.")
                    androidx.compose.material3.TextButton(onBilling) { Text("Add time") }
                }
                ErrorLine(error)
                Spacer(Modifier.height(14.dp))
                Button(
                    onClick = {
                        if (title.isBlank() || creating) return@Button
                        creating = true; error = null; needTime = false
                        scope.launch {
                            try { onOpen(api.create(title.trim(), venue, lang, tier, if (tier == "captions") 1 else voices.toInt(), minutes.toInt()).code, true) }
                            catch (e: ApiException) { if (e.code == "NO_TIME") needTime = true else error = e.message }
                            finally { creating = false }
                        }
                    },
                    enabled = !creating && title.isNotBlank(), modifier = Modifier.fillMaxWidth().height(50.dp), shape = RoundedCornerShape(14.dp),
                ) {
                    Icon(Icons.Filled.Mic, null, Modifier.size(18.dp)); Spacer(Modifier.size(8.dp)); Text("Go live")
                }
            }
            SectionLabel("Your sessions")
            val m = mine
            when {
                m == null -> SkeletonCard()
                m.isEmpty() -> Muted("Sessions you host will appear here.")
                else -> m.forEach { s ->
                    SessionRow(s.title, "${venueLabel(s.venueType)} · ${s.code}", if (s.status == "live") "LIVE" else "Ended", s.status == "live") { onOpen(s.code, s.status == "live") }
                }
            }
        }
    }
}

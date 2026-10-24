package app.voiceverse

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Accessibility
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.draw.clip
import kotlinx.coroutines.launch

// ───────────────────────── More ─────────────────────────

@Composable
fun MoreTab(user: AuthUser, onOpen: (Overlay) -> Unit, onSignOut: () -> Unit) {
    @Composable
    fun Item(icon: ImageVector, label: String, target: Overlay) {
        Surface(
            shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable { onOpen(target) },
        ) {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.size(14.dp))
                Text(label, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }

    ScreenFrame("More") {
        ScrollBody {
            Card2 {
                Text(user.name, style = MaterialTheme.typography.titleMedium)
                Muted("${user.email} · ${if (user.role == "educator") "Speaker" else "Listener"}")
            }
            if (user.role == "educator") Item(Icons.Filled.Campaign, "Host a session", Overlay.HostHub)
            Item(Icons.Filled.Translate, "Languages", Overlay.Languages)
            Item(Icons.Filled.Settings, "Settings", Overlay.Settings)
            Item(Icons.Filled.SupportAgent, "Help", Overlay.Help)
            SectionLabel("About Voice Verse")
            Item(Icons.Filled.Info, "About", Overlay.About)
            Item(Icons.Filled.Accessibility, "Accessibility", Overlay.Accessibility)
            Item(Icons.Filled.Lock, "Privacy", Overlay.Privacy)
            Item(Icons.Filled.Description, "Terms", Overlay.Terms)
            Item(Icons.Filled.Email, "Contact us", Overlay.Contact)
            Spacer(Modifier.height(4.dp))
            OutlinedButton(onSignOut, Modifier.fillMaxWidth().height(50.dp), shape = RoundedCornerShape(14.dp)) {
                Icon(Icons.AutoMirrored.Filled.Logout, null, Modifier.size(18.dp)); Spacer(Modifier.size(8.dp)); Text("Sign out")
            }
        }
    }
}

// ───────────────────────── Languages ─────────────────────────

@Composable
fun LanguagesScreen(api: Api, onBack: () -> Unit) {
    var data by remember { mutableStateOf<LangList?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { try { data = api.languagesFull() } catch (e: ApiException) { error = e.message } }

    @Composable
    fun Mark(ok: Boolean, label: String) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Check, null, Modifier.size(16.dp), tint = if (ok) Teal else MaterialTheme.colorScheme.outline)
            Spacer(Modifier.size(6.dp))
            Text(label, style = MaterialTheme.typography.bodyMedium, color = if (ok) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }

    ScreenFrame("Languages", onBack) {
        ScrollBody {
            Muted("What each language can do today. New languages are added in one place and appear everywhere.")
            val d = data
            when {
                error != null -> Card2 { Text("Can't load languages", style = MaterialTheme.typography.titleMedium); Muted(error ?: "") }
                d == null -> { SkeletonCard(); SkeletonCard(); SkeletonCard() }
                else -> {
                    if (!d.translationProviderConfigured) {
                        Card2 {
                            Text("Translation isn't available yet", style = MaterialTheme.typography.titleMedium)
                            Muted("Subtitles work now. Voice Verse can't translate between languages until a translation service is connected.")
                        }
                    }
                    d.languages.forEach { l ->
                        Card2 {
                            Text("${l.name}  ·  ${l.code}", style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                Mark(l.speechRecognition.supported, "Hear speech")
                                Mark(l.translation, "Translate")
                                Mark(l.textToSpeech.supported, "Speak")
                            }
                        }
                    }
                }
            }
        }
    }
}

// ───────────────────────── Settings ─────────────────────────

@Composable
fun SettingsScreen(store: Store, user: AuthUser, api: Api, onBack: () -> Unit, onSignOut: () -> Unit) {
    val s = store.settings
    var langs by remember { mutableStateOf<List<LangCfg>>(emptyList()) }
    LaunchedEffect(Unit) { runCatching { langs = api.languages() } }

    ScreenFrame("Settings", onBack) {
        ScrollBody {
            Muted("Saved automatically on this phone.")
            Card2 {
                Text("Languages", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(10.dp))
                if (langs.isEmpty()) Muted("Loading languages…") else {
                    LangPicker("Default: language spoken", s.inputLang, langs.filter { it.speechRecognition.supported }, { v -> store.update { it.copy(inputLang = v) } })
                    Spacer(Modifier.height(12.dp))
                    LangPicker("Default: language I understand", s.outputLang, langs.filter { it.translation }, { v -> store.update { it.copy(outputLang = v) } })
                }
            }
            Card2 {
                Text("Audio", style = MaterialTheme.typography.titleMedium)
                SwitchRow("Speak translations aloud", s.audioOutput, { v -> store.update { it.copy(audioOutput = v) } }, "Hausa, Yoruba and Igbo use a Nigerian voice from the server. Other languages use your phone's voices.")
                ChoiceRow("Speaking speed", listOf("0.8" to "Slower", "1.0" to "Normal", "1.2" to "Faster", "1.5" to "Fastest"), s.playbackRate.toString()) { v ->
                    store.update { it.copy(playbackRate = v.toFloat()) }
                }
            }
            Card2 {
                Text("Accessibility & appearance", style = MaterialTheme.typography.titleMedium)
                ChoiceRow("Interface text size", listOf("default" to "Default", "large" to "Large", "xl" to "Extra large"), s.textSize) { v -> store.update { it.copy(textSize = v) } }
                Text("Subtitle size · ${s.subtitleSize}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
                Slider(s.subtitleSize.toFloat(), { v -> store.update { it.copy(subtitleSize = v.toInt()) } }, valueRange = 16f..56f)
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
                    Text("Every voice in the room.", Modifier.padding(14.dp), fontSize = s.subtitleSize.sp, lineHeight = (s.subtitleSize * 1.25f).sp)
                }
                SwitchRow("High contrast", s.highContrast, { v -> store.update { it.copy(highContrast = v) } })
                SwitchRow("Reduce motion", s.reducedMotion, { v -> store.update { it.copy(reducedMotion = v) } }, "Turns off animations.")
                ChoiceRow("Theme", listOf("light" to "Light", "dark" to "Dark", "system" to "Match phone"), s.theme) { v -> store.update { it.copy(theme = v) } }
            }
            Card2 {
                Text("Privacy", style = MaterialTheme.typography.titleMedium)
                SwitchRow("Save session history", s.saveHistory, { v -> store.update { it.copy(saveHistory = v) } }, "Transcripts stay on this phone. Audio is never stored.")
                ChoiceRow("Keep sessions for", listOf("7" to "7 days", "30" to "30 days", "90" to "90 days", "forever" to "Until I delete"), s.retention) { v ->
                    store.update { it.copy(retention = v) }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton({ store.clear() }, enabled = store.sessions.isNotEmpty(), shape = RoundedCornerShape(14.dp)) {
                    Text("Delete all saved sessions (${store.sessions.size})")
                }
            }
            Card2 {
                Text(user.name, style = MaterialTheme.typography.titleMedium)
                Muted("${user.email} · ${if (user.role == "educator") "Speaker" else "Listener"}")
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onSignOut, shape = RoundedCornerShape(14.dp)) { Text("Sign out") }
            }
        }
    }
}

// ───────────────────────── Help ─────────────────────────

private val FAQ = listOf(
    "How do I start?" to "Choose Listen, pick the language being spoken and the one you understand, and press Start listening. Hold your phone towards the speaker.",
    "The microphone doesn't work." to "Open your phone's Settings, find Voice Verse under Apps, and allow the Microphone permission. Then press Resume.",
    "How do I follow a speaker's session?" to "Ask the speaker for their code and use Join. You don't need to speak.",
    "Why does it say it can't translate?" to "Translation needs a translation service, and none is available for that language right now. You'll see the original words as subtitles. Subtitles always work.",
    "Can I hear the translation?" to "Turn on Speak the translation. It uses voices already on your phone, so some languages can't be spoken yet. Use earphones in shared rooms.",
    "Is my audio recorded?" to "No. Audio is processed as you listen and never stored. Only text is kept, on your phone, if you allow it in Settings.",
    "How do I delete my sessions?" to "Open History to delete one or all. You can also choose how long sessions are kept in Settings.",
)

@Composable
fun HelpScreen(onBack: () -> Unit) {
    var open by remember { mutableStateOf<Int?>(null) }
    ScreenFrame("Help", onBack) {
        ScrollBody {
            Muted("Quick answers for listeners and speakers.")
            FAQ.forEachIndexed { i, (q, a) ->
                Card2(Modifier.clickable { open = if (open == i) null else i }) {
                    Text(q, style = MaterialTheme.typography.titleMedium)
                    if (open == i) { Spacer(Modifier.height(8.dp)); Muted(a) }
                }
            }
        }
    }
}

// ───────────────────────── Static pages ─────────────────────────

private data class Block(val heading: String, val body: String)

@Composable
private fun TextPage(title: String, lead: String, blocks: List<Block>, onBack: () -> Unit) {
    ScreenFrame(title, onBack) {
        ScrollBody {
            Text(lead, style = MaterialTheme.typography.bodyLarge)
            blocks.forEach { b ->
                Card2 {
                    Text(b.heading, style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(6.dp))
                    Muted(b.body)
                }
            }
        }
    }
}

@Composable
fun AboutScreen(onBack: () -> Unit) = TextPage(
    "About", "Voice Verse exists so that no one is left out of a room because they cannot follow what is being said.",
    listOf(
        Block("The problem", "In a classroom, a church or a town hall, one person speaks and everyone is expected to keep up. If you can't follow the language, or can't hear well, you quietly fall behind."),
        Block("The idea", "What if the phone in your pocket could show you what is being said, in words you understand, as it is said? No special equipment. No one asked to slow down."),
        Block("Today", "Voice Verse is a working prototype in pilot. It turns live speech into subtitles, and translates sentence by sentence where a translation service is connected."),
        Block("Next", "More Nigerian languages, starting with Ibibio, tested with real teachers, congregations and community leaders, and shaped by what they tell us."),
        Block("Who builds it", "Voice Verse is built by Voice First Company, a student company in the Junior Achievement Nigeria Company Programme, at Community Secondary Commercial School, Ikot Ekpeyak Ikono, Uyo, Akwa Ibom State."),
    ),
    onBack,
)

@Composable
fun AccessibilityScreen(onBack: () -> Unit) = TextPage(
    "Accessibility", "Accessibility is the product, not a setting. Here is what is in place today, and where it falls short.",
    listOf(
        Block("Readable text", "Subtitle size is adjustable up to very large, and the interface text can be enlarged in Settings."),
        Block("High contrast and dark mode", "Both are available and remembered on your phone."),
        Block("Reduced motion", "Turn animations off in Settings. Every fact is still shown."),
        Block("Subtitles and audio", "Read the words, or hear the translation through your own earphones where your phone has a voice for that language."),
        Block("Known limits", "Ibibio, Yorùbá, Hausa and Igbo speech cannot be recognised by phones yet, so they work as output languages only, once a translation service is connected. Spoken output depends on voices installed on your phone. Accuracy drops in noisy rooms or when the microphone is far from the speaker."),
        Block("Tell us what's wrong", "If something blocks you, use Contact us and choose \"An accessibility problem\"."),
    ),
    onBack,
)

@Composable
fun PrivacyScreen(onBack: () -> Unit) = TextPage(
    "Privacy", "Spoken conversations can be sensitive. This is how Voice Verse handles them.",
    listOf(
        Block("Audio", "Voice Verse does not record or store audio. Your phone turns speech into text while you listen. Depending on your phone, that step may be performed by its speech service, which has its own privacy policy."),
        Block("Your own listening sessions", "Transcripts and translations of sessions you listen to are kept on your phone only, if you leave Save session history on. You choose how long they are kept, and you can delete them at any time."),
        Block("Translation", "To translate a sentence, its text is sent to our server and, when one is connected, to a translation service. We do not attach your name or email to it."),
        Block("Hosted sessions", "When a speaker hosts a session, the captions of that session are stored on our server so listeners can follow along."),
        Block("Your account", "If you create an account we store your name, email address and role, and a hashed password. We use them only to sign you in."),
        Block("Messages you send us", "Messages sent through the contact form are stored so we can reply."),
    ),
    onBack,
)

@Composable
fun TermsScreen(onBack: () -> Unit) = TextPage(
    "Terms", "Short, plain terms for a product that is still in pilot.",
    listOf(
        Block("A prototype in pilot", "Voice Verse is an early product. It may be unavailable at times, and its subtitles and translations may contain mistakes. Do not rely on it for medical, legal or safety-critical communication."),
        Block("Using it fairly", "Only caption speech when you have the right to, and tell people it is happening where that is expected. Do not use Voice Verse to harass, deceive or harm anyone, or to attempt to break the service."),
        Block("Your account", "Keep your password private. You are responsible for what is done with your account."),
        Block("Content", "You keep ownership of the words you speak and the sessions you create. We process them only to provide the service."),
        Block("Changes", "We may update these terms as the product grows. Continued use means you accept the updated terms."),
    ),
    onBack,
)

// ───────────────────────── Contact ─────────────────────────

private val TOPICS = listOf(
    "question" to "A question",
    "pilot" to "Pilot at my school, church or organisation",
    "feedback" to "Feedback",
    "accessibility" to "An accessibility problem",
    "other" to "Something else",
)

@Composable
fun ContactScreen(api: Api, user: AuthUser, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(user.name) }
    var email by remember { mutableStateOf(user.email) }
    var topic by remember { mutableStateOf("question") }
    var message by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    ScreenFrame("Contact us", onBack) {
        ScrollBody {
            if (sent) {
                Card2 {
                    Text("Thank you — message sent", style = MaterialTheme.typography.titleMedium)
                    Muted("We'll reply to $email as soon as we can.")
                    Spacer(Modifier.height(14.dp))
                    Button(onBack, shape = RoundedCornerShape(14.dp)) { Text("Done") }
                }
            } else {
                Muted("Questions, pilots, feedback or a problem. We read every message.")
                OutlinedTextField(name, { name = it }, label = { Text("Your name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                ChoiceRow("Topic", TOPICS, topic) { topic = it }
                OutlinedTextField(message, { message = it }, label = { Text("Message") }, minLines = 5, modifier = Modifier.fillMaxWidth())
                ErrorLine(error)
                Button(
                    onClick = {
                        if (name.isBlank() || !email.contains("@") || message.trim().length < 5) {
                            error = "Please add your name, a valid email and a short message."; return@Button
                        }
                        busy = true; error = null
                        scope.launch {
                            try { api.contact(name.trim(), email.trim(), topic, message.trim()); sent = true }
                            catch (e: ApiException) { error = e.message }
                            finally { busy = false }
                        }
                    },
                    enabled = !busy, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(16.dp),
                ) {
                    if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp, color = MaterialTheme.colorScheme.onPrimary)
                    else Text("Send message", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

package app.voiceverse

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import java.text.DateFormat
import java.util.Date

private fun whenText(t: Long): String = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(t))

@Composable
fun HistoryTab(store: Store, langs: List<LangCfg>, onOpen: (String) -> Unit, onListen: () -> Unit) {
    var confirm by remember { mutableStateOf(false) }
    val sessions = store.sessions
    val nameOf = { c: String -> langs.firstOrNull { it.code == c }?.name ?: c.uppercase() }
    ScreenFrame("History", actions = {
        if (sessions.isNotEmpty()) IconButton({ confirm = true }) { Icon(Icons.Filled.Delete, "Delete all") }
    }) {
        ScrollBody {
            Muted("Your past sessions, saved on this phone only. No audio is ever stored.")
            if (sessions.isEmpty()) {
                Card2 {
                    Text("Nothing saved yet", style = MaterialTheme.typography.titleMedium)
                    Muted("When you stop a listening session, its transcript is saved here for you to review.")
                    Spacer(Modifier.height(14.dp))
                    Button(onListen, shape = RoundedCornerShape(14.dp)) { Text("Start listening") }
                }
            } else {
                sessions.forEach { s ->
                    SessionRow(s.title, "${whenText(s.startedAt)} · ${nameOf(s.from)} → ${nameOf(s.to)}", fmtDuration(s.durationSec), false) { onOpen(s.id) }
                }
            }
        }
    }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("Delete all sessions?") },
            text = { Text("This removes every saved transcript from this phone. It can't be undone.") },
            confirmButton = { TextButton({ store.clear(); confirm = false }) { Text("Delete all", color = Rose) } },
            dismissButton = { TextButton({ confirm = false }) { Text("Cancel") } },
        )
    }
}

@Composable
fun HistoryDetail(store: Store, id: String, langs: List<LangCfg>, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val s = store.find(id)
    val nameOf = { c: String -> langs.firstOrNull { it.code == c }?.name ?: c.uppercase() }
    var confirm by remember { mutableStateOf(false) }

    ScreenFrame("Session", onBack) {
        if (s == null) {
            ScrollBody {
                Card2 {
                    Text("Session not found", style = MaterialTheme.typography.titleMedium)
                    Muted("It may have been deleted, or it was saved on another phone.")
                    Spacer(Modifier.height(14.dp))
                    Button(onBack, shape = RoundedCornerShape(14.dp)) { Text("Back") }
                }
            }
            return@ScreenFrame
        }
        ScrollBody {
            Text(s.title, style = MaterialTheme.typography.headlineSmall)
            Muted("${whenText(s.startedAt)} · ${fmtDuration(s.durationSec)} · ${nameOf(s.from)} → ${nameOf(s.to)}")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton({
                    val text = buildString {
                        appendLine(s.title)
                        appendLine("${whenText(s.startedAt)} · ${nameOf(s.from)} → ${nameOf(s.to)}")
                        appendLine()
                        s.segments.forEach { g ->
                            appendLine("[${fmtClock(g.t)}] ${g.original}")
                            if (g.translated.isNotEmpty()) appendLine("        ${g.translated}")
                            appendLine()
                        }
                    }
                    val send = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text); putExtra(Intent.EXTRA_SUBJECT, s.title) }
                    ctx.startActivity(Intent.createChooser(send, "Share transcript"))
                }, shape = RoundedCornerShape(14.dp)) {
                    Icon(Icons.Filled.Share, null, Modifier.size(18.dp)); Spacer(Modifier.size(8.dp)); Text("Share")
                }
                OutlinedButton({ confirm = true }, shape = RoundedCornerShape(14.dp)) {
                    Icon(Icons.Filled.Delete, null, Modifier.size(18.dp)); Spacer(Modifier.size(8.dp)); Text("Delete")
                }
            }
            Card2 {
                s.segments.forEachIndexed { i, g ->
                    Column(Modifier.fillMaxWidth()) {
                        Text(fmtClock(g.t), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(g.original)
                        if (g.translated.isNotEmpty()) Text(g.translated, color = MaterialTheme.colorScheme.primary)
                    }
                    if (i < s.segments.lastIndex) Spacer(Modifier.height(14.dp))
                }
            }
        }
    }
    if (confirm && s != null) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("Delete this session?") },
            text = { Text("The transcript is removed from this phone. It can't be undone.") },
            confirmButton = { TextButton({ store.delete(s.id); confirm = false; onBack() }) { Text("Delete", color = Rose) } },
            dismissButton = { TextButton({ confirm = false }) { Text("Cancel") } },
        )
    }
}

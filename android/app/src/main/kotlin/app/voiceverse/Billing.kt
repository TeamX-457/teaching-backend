package app.voiceverse

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

private fun naira(n: Int) = "₦" + NumberFormat.getNumberInstance(Locale.US).format(n)
private fun hoursText(seconds: Long): String {
    val h = seconds / 3600.0
    return if (h >= 10) "${Math.round(h)} h" else "${Math.round(h * 10) / 10.0} h"
}

private val LEVEL_NAME = mapOf("captions" to "Captions", "standard" to "Standard voice", "local" to "Local voice")
private val EVENTS = listOf(
    "sermon" to "Sermon", "service" to "Church service", "conference" to "Conference", "classroom" to "Classroom",
)

/** Prices, the speaker's time left, and the listener pass. Payment happens on Paystack's own page. */
@Composable
fun BillingScreen(api: Api, user: AuthUser, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var pricing by remember { mutableStateOf<Pricing?>(null) }
    var me by remember { mutableStateOf<MeResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var paying by remember { mutableStateOf<String?>(null) }
    var tier by remember { mutableStateOf("local") }
    var hours by remember { mutableStateOf("5") }
    var event by remember { mutableStateOf("service") }
    val host = user.role == "educator"

    LaunchedEffect(Unit) {
        runCatching { pricing = api.pricing() }.onFailure { error = "Prices could not be loaded. Check your connection." }
        // Keep the balance fresh: it changes a moment after paying, when the person comes back to the app.
        while (true) {
            runCatching { me = api.me() }
            delay(6000)
        }
    }

    fun pay(plan: String) {
        if (paying != null) return
        error = null; paying = plan
        scope.launch {
            try {
                val c = api.checkout(plan)
                ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(c.authorizationUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (e: ApiException) {
                error = e.message
            } finally {
                paying = null
            }
        }
    }

    ScreenFrame("Time and plans", onBack) {
        ScrollBody {
            Muted("Listening is free. Speakers pay for the time their session runs, as a plan for the month or just the hours they need.")
            ErrorLine(error)
            val p = pricing
            if (p == null) {
                SkeletonCard()
                return@ScrollBody
            }

            if (host) {
                me?.balance?.let { b ->
                    Card2 {
                        Text("Your time", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(8.dp))
                        listOf("captions", "standard", "local").forEach { t ->
                            val tb = b.of(t)
                            if (tb.seconds > 0 || t == "captions") {
                                Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(LEVEL_NAME.getValue(t), Modifier.weight(1f))
                                    Text(hoursText(tb.seconds), style = MaterialTheme.typography.titleMedium)
                                }
                            }
                        }
                        Spacer(Modifier.height(4.dp))
                        Muted(
                            if (b.nothingBoughtYet) "You have a little free captions time each month. Buy time below for voice and longer sessions."
                            else "Higher levels also cover the lower ones. Time not used within ${p.rules.validDays} days expires.",
                        )
                    }
                }

                // ----- pay for the hours you need -----
                Card2 {
                    Text("Pay only for the hours you need", style = MaterialTheme.typography.titleMedium)
                    Muted("A day of speaking is about ${p.hours.dayHours} hours.")
                    ChoiceRow("What to include", p.levels.map { it.tier to it.name }, tier) { tier = it }
                    ChoiceRow("How many hours", p.hours.choices.map { it.toString() to (if (it == 1) "1 hour" else "$it hours") }, hours) { hours = it }
                    val price = p.hours.prices[tier]?.get(hours) ?: 0
                    Spacer(Modifier.height(4.dp))
                    Text(naira(price), style = MaterialTheme.typography.headlineSmall)
                    Muted(
                        "$hours ${if (hours == "1") "hour" else "hours"} of ${LEVEL_NAME.getValue(tier).lowercase()}, valid for ${p.rules.validDays} days" +
                            (if ((hours.toIntOrNull() ?: 0) >= p.hours.bulk.fromHours) " · ${p.hours.bulk.discountPercent}% off" else ""),
                    )
                    Spacer(Modifier.height(10.dp))
                    val plan = "hours-$tier-$hours"
                    Button({ pay(plan) }, Modifier.fillMaxWidth().height(50.dp), enabled = paying == null, shape = RoundedCornerShape(14.dp)) {
                        Text(if (paying == plan) "Opening payment…" else "Pay with Paystack")
                    }
                }

                // ----- monthly plans -----
                Card2 {
                    Text("Monthly plans", style = MaterialTheme.typography.titleMedium)
                    Muted("A better price for regular speakers. Pick the kind of event you run.")
                    ChoiceRow("Event", EVENTS, event) { event = it }
                    p.plans.filter { it.event == event }.forEach { plan ->
                        Spacer(Modifier.height(6.dp))
                        Text("${LEVEL_NAME.getValue(plan.tier)} · ${naira(plan.amount)} / month", style = MaterialTheme.typography.titleMedium)
                        plan.includes.forEach { Muted("${it.hours} hours of ${LEVEL_NAME.getValue(it.tier).lowercase()}") }
                        Muted(plan.about.replace(Regex("^\\d+ hours for 30 days\\.\\s*"), ""))
                        OutlinedButton({ pay(plan.id) }, Modifier.fillMaxWidth().height(46.dp), enabled = paying == null, shape = RoundedCornerShape(14.dp)) {
                            Text(if (paying == plan.id) "Opening payment…" else "Choose")
                        }
                    }
                }
            }

            // ----- listeners -----
            Card2 {
                Text("For listeners: the local voice", style = MaterialTheme.typography.titleMedium)
                Muted(p.listener.about)
                Spacer(Modifier.height(6.dp))
                Text("${naira(p.listener.amount)} / ${p.listener.days} days", style = MaterialTheme.typography.headlineSmall)
                val l = me?.listener
                Muted(
                    when {
                        l?.pass == true -> "Your listener pass is active."
                        else -> "Try it free first: about ${p.listener.trialMinutes} minutes of local voice, once."
                    },
                )
                Spacer(Modifier.height(10.dp))
                Button({ pay(p.listener.id) }, Modifier.fillMaxWidth().height(50.dp), enabled = paying == null, shape = RoundedCornerShape(14.dp)) {
                    Text(if (paying == p.listener.id) "Opening payment…" else if (l?.pass == true) "Add 30 more days" else "Get the listener pass")
                }
            }

            Card2 {
                Text("How it works", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(6.dp))
                Muted("Time you buy is valid for ${p.rules.validDays} days. Time you have not used by then expires and cannot be refunded, so buy what you will use.")
                Spacer(Modifier.height(6.dp))
                Muted("Only time your session is live and in use is counted. If the local voice is unavailable and we switch to the standard voice, your time is not used while that lasts.")
                Spacer(Modifier.height(6.dp))
                Muted("If your time ends, the session carries on for ${p.rules.graceMinutes} minutes so a talk is never cut off mid-sentence, then paid features stop until you add time.")
                if (p.rules.extraVoiceLanguages.isNotBlank()) { Spacer(Modifier.height(6.dp)); Muted(p.rules.extraVoiceLanguages) }
            }
        }
    }
}

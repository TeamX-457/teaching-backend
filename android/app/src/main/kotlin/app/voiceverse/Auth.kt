package app.voiceverse

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun AuthScreen(api: Api, onDone: (AuthUser) -> Unit) {
    val scope = rememberCoroutineScope()
    var signUp by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("student") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var forgot by remember { mutableStateOf(false) }

    fun submit() {
        if (busy) return
        error = null
        if (email.isBlank() || password.length < 8 || (signUp && name.isBlank())) {
            error = if (password.length < 8) "Use a password with at least 8 characters." else "Please fill in every field."
            return
        }
        busy = true
        scope.launch {
            try {
                onDone(if (signUp) api.signUp(name.trim(), email.trim(), password, role) else api.signIn(email.trim(), password))
            } catch (e: ApiException) {
                error = e.message
            } finally { busy = false }
        }
    }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).systemBarsPadding().imePadding()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 16.dp)) {
            Spacer(Modifier.height(24.dp))
            Box(Modifier.size(64.dp).clip(RoundedCornerShape(18.dp)).background(Ink), contentAlignment = Alignment.Center) {
                Waveform(Modifier.size(width = 40.dp, height = 30.dp), bars = 3, barWidth = 6.dp, gap = 5.dp)
            }
            Spacer(Modifier.height(24.dp))
            Text(if (signUp) "Create your account" else "Welcome back", style = MaterialTheme.typography.displaySmall)
            Spacer(Modifier.height(6.dp))
            Muted(if (signUp) "Hear every word, in your own language." else "Sign in to listen, host and review sessions.")
            Spacer(Modifier.height(28.dp))

            AnimatedVisibility(signUp) {
                Column {
                    OutlinedTextField(name, { name = it }, label = { Text("Full name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(12.dp))
                }
            }
            OutlinedTextField(
                email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                password, { password = it }, label = { Text("Password") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            )
            AnimatedVisibility(signUp) {
                Column(Modifier.padding(top = 16.dp)) {
                    Muted("I will mostly…")
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(role == "student", { role = "student" }, label = { Text("Listen") },
                            leadingIcon = { Icon(Icons.Filled.Headphones, null, Modifier.size(18.dp)) })
                        FilterChip(role == "educator", { role = "educator" }, label = { Text("Host sessions") },
                            leadingIcon = { Icon(Icons.Filled.Mic, null, Modifier.size(18.dp)) })
                    }
                }
            }
            ErrorLine(error)
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = ::submit, enabled = !busy, modifier = Modifier.fillMaxWidth().height(54.dp),
                shape = RoundedCornerShape(16.dp),
            ) {
                if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp, color = MaterialTheme.colorScheme.onPrimary)
                else Text(if (signUp) "Create account" else "Sign in", fontWeight = FontWeight.SemiBold)
            }
            if (!signUp) TextButton({ forgot = true }, Modifier.align(Alignment.CenterHorizontally)) { Text("Forgot your password?") }
            TextButton({ signUp = !signUp; error = null }, Modifier.align(Alignment.CenterHorizontally)) {
                Text(if (signUp) "I already have an account" else "New here? Create an account")
            }
        }
    }

    if (forgot) {
        AlertDialog(
            onDismissRequest = { forgot = false },
            title = { Text("Reset your password") },
            text = {
                Text(
                    "Voice Verse can't send email just now. Please contact the administrator of your organisation to have your " +
                        "password reset, or create a new account with a different email address.",
                )
            },
            confirmButton = { TextButton({ forgot = false }) { Text("OK") } },
        )
    }
}

package app.voiceverse

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dialpad
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Full-screen destinations opened on top of the tabs. */
sealed interface Overlay {
    data class SessionLive(val code: String) : Overlay
    data class HostLive(val code: String) : Overlay
    data class HistoryDetail(val id: String) : Overlay
    data object HostHub : Overlay
    data object Languages : Overlay
    data object Settings : Overlay
    data object Help : Overlay
    data object About : Overlay
    data object Accessibility : Overlay
    data object Privacy : Overlay
    data object Terms : Overlay
    data object Contact : Overlay
}

enum class Tab(val label: String, val icon: ImageVector) {
    Home("Home", Icons.Filled.Home),
    Listen("Listen", Icons.Filled.Mic),
    Join("Join", Icons.Filled.Dialpad),
    History("History", Icons.Filled.History),
    More("More", Icons.Filled.MoreHoriz),
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val store = remember { Store(applicationContext) }
            val s = store.settings
            VoiceVerseTheme(s.theme, s.highContrast, s.textSize, s.reducedMotion) { Root(store) }
        }
    }
}

@Composable
private fun Root(store: Store) {
    val ctx = LocalContext.current
    val api = remember { Api(ctx.applicationContext) }
    val scope = rememberCoroutineScope()
    var booting by remember { mutableStateOf(true) }
    var user by remember { mutableStateOf<AuthUser?>(null) }

    // Hold the loading screen for a beat so it reads as intentional, while the session is restored.
    LaunchedEffect(Unit) {
        val started = System.currentTimeMillis()
        val u = api.session()
        val left = 1900 - (System.currentTimeMillis() - started)
        if (left > 0) delay(left)
        user = u
        booting = false
    }

    AnimatedContent(
        targetState = if (booting) 0 else if (user == null) 1 else 2,
        transitionSpec = { fadeIn() togetherWith fadeOut() },
        label = "root",
    ) { phase ->
        Box(Modifier.fillMaxSize()) {
            when (phase) {
                0 -> LoadingScreen()
                1 -> AuthScreen(api, onDone = { user = it })
                else -> AppShell(api, store, user!!, onSignOut = { scope.launch { api.signOut(); user = null } })
            }
        }
    }
}

@Composable
private fun AppShell(api: Api, store: Store, user: AuthUser, onSignOut: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var tab by rememberSaveable { mutableStateOf(Tab.Home) }
    var overlay by remember { mutableStateOf<Overlay?>(null) }
    var langs by remember { mutableStateOf<List<LangCfg>>(emptyList()) }

    // The listening session lives here so switching tabs never loses it.
    val listen = remember { ListenController(ctx, api, store, scope) { id -> overlay = Overlay.HistoryDetail(id) } }
    DisposableEffect(Unit) { onDispose { listen.release() } }

    val feed = remember { Feed(api) }
    val join = remember { JoinState(api, scope) { code -> overlay = Overlay.SessionLive(code) } }
    LaunchedEffect(Unit) { runCatching { langs = api.languages() } }
    LaunchedEffect(Unit) { feed.run() }

    BackHandler(enabled = overlay != null) { overlay = null }
    BackHandler(enabled = overlay == null && tab != Tab.Home) { tab = Tab.Home }

    AnimatedContent(
        targetState = overlay,
        transitionSpec = {
            if (targetState != null) (slideInHorizontally { it / 6 } + fadeIn()) togetherWith fadeOut()
            else fadeIn() togetherWith (slideOutHorizontally { it / 6 } + fadeOut())
        },
        label = "overlay",
    ) { o ->
        Box(Modifier.fillMaxSize()) {
            if (o == null) {
                Scaffold(
                    contentWindowInsets = WindowInsets(0, 0, 0, 0),
                    bottomBar = {
                        NavigationBar {
                            Tab.entries.forEach { t ->
                                NavigationBarItem(
                                    selected = tab == t, onClick = { tab = t },
                                    icon = {
                                        BadgedBox(badge = { if (t == Tab.Listen && listen.isLive) Badge() }) { Icon(t.icon, t.label) }
                                    },
                                    label = { Text(t.label) },
                                )
                            }
                        }
                    },
                ) { pad ->
                    Box(Modifier.padding(pad).fillMaxSize()) {
                        when (tab) {
                            Tab.Home -> HomeTab(
                                user, store, feed, join,
                                onListen = { tab = Tab.Listen },
                                onHostHub = { overlay = Overlay.HostHub },
                                onOpenHistory = { overlay = Overlay.HistoryDetail(it) },
                                onAllHistory = { tab = Tab.History },
                            )
                            Tab.Listen -> ListenTab(listen)
                            Tab.Join -> JoinTab(feed, join)
                            Tab.History -> HistoryTab(store, langs, onOpen = { overlay = Overlay.HistoryDetail(it) }, onListen = { tab = Tab.Listen })
                            Tab.More -> MoreTab(user, onOpen = { overlay = it }, onSignOut = onSignOut)
                        }
                    }
                }
            } else {
                val back = { overlay = null }
                when (o) {
                    is Overlay.SessionLive -> ListenScreen(api, o.code, onBack = back)
                    is Overlay.HostLive -> HostScreen(api, o.code, onBack = back)
                    is Overlay.HistoryDetail -> HistoryDetail(store, o.id, langs, onBack = back)
                    Overlay.HostHub -> HostHub(api, onBack = back) { code, live ->
                        overlay = if (live) Overlay.HostLive(code) else Overlay.SessionLive(code)
                    }
                    Overlay.Languages -> LanguagesScreen(api, onBack = back)
                    Overlay.Settings -> SettingsScreen(store, user, api, onBack = back, onSignOut = onSignOut)
                    Overlay.Help -> HelpScreen(onBack = back)
                    Overlay.About -> AboutScreen(onBack = back)
                    Overlay.Accessibility -> AccessibilityScreen(onBack = back)
                    Overlay.Privacy -> PrivacyScreen(onBack = back)
                    Overlay.Terms -> TermsScreen(onBack = back)
                    Overlay.Contact -> ContactScreen(api, user, onBack = back)
                }
            }
        }
    }
}

package app.voiceverse

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import android.app.Activity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.sp

val Ink = Color(0xFF0E1B1A)
val Paper = Color(0xFFF6F3EC)
val Teal = Color(0xFF1F8A78)
val Mint = Color(0xFF2FB59C)
val Amber = Color(0xFFE0A63A)
val Rose = Color(0xFFC4554D)

/** True when the person asked for less motion in Settings. */
val LocalReduceMotion = compositionLocalOf { false }

private val Light = lightColorScheme(
    primary = Teal, onPrimary = Color.White, background = Paper, onBackground = Ink,
    surface = Color.White, onSurface = Ink, surfaceVariant = Color(0xFFEAE5D8), onSurfaceVariant = Color(0xFF5B6665),
    outline = Color(0xFFD5CFBF), error = Rose,
)
private val Dark = darkColorScheme(
    primary = Mint, onPrimary = Ink, background = Ink, onBackground = Paper,
    surface = Color(0xFF162826), onSurface = Paper,
    surfaceVariant = Color(0xFF1D3431), onSurfaceVariant = Color(0xFFA8B5B2),
    outline = Color(0xFF2C4A45), error = Color(0xFFE88A83),
)

private val vvType = Typography(
    displaySmall = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Medium, fontSize = 34.sp, lineHeight = 40.sp),
    headlineSmall = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Medium, fontSize = 24.sp, lineHeight = 30.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 21.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 12.sp, letterSpacing = 0.4.sp),
)

@Composable
fun VoiceVerseTheme(
    mode: String = "system",
    highContrast: Boolean = false,
    textSize: String = "default",
    reducedMotion: Boolean = false,
    content: @Composable () -> Unit,
) {
    val dark = when (mode) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
    var scheme = if (dark) Dark else Light
    if (highContrast) {
        scheme = if (dark) scheme.copy(onSurfaceVariant = Color.White, outline = Color(0xFF9FB5B0), onBackground = Color.White)
        else scheme.copy(onSurfaceVariant = Color(0xFF1A2322), outline = Color(0xFF6B7573), background = Color.White)
    }
    // Keep status and navigation bar icons readable when the in-app theme differs from the phone's.
    val view = LocalView.current
    SideEffect {
        val window = (view.context as? Activity)?.window ?: return@SideEffect
        val controller = WindowCompat.getInsetsController(window, view)
        controller.isAppearanceLightStatusBars = !dark
        controller.isAppearanceLightNavigationBars = !dark
    }
    val base = LocalDensity.current
    val scale = when (textSize) { "large" -> 1.15f; "xl" -> 1.3f; else -> 1f }
    CompositionLocalProvider(
        LocalReduceMotion provides reducedMotion,
        LocalDensity provides Density(base.density, base.fontScale * scale),
    ) {
        MaterialTheme(colorScheme = scheme, typography = vvType, content = content)
    }
}

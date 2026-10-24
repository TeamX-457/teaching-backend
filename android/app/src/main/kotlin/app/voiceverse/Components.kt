package app.voiceverse

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

/** Row of sound bars that breathe like a voice. `level` 0..1 scales how energetic they are. */
@Composable
fun Waveform(
    modifier: Modifier = Modifier,
    color: Color = Mint,
    bars: Int = 5,
    level: Float = 0.8f,
    barWidth: Dp = 8.dp,
    gap: Dp = 6.dp,
) {
    val reduce = LocalReduceMotion.current
    val t = rememberInfiniteTransition(label = "wave")
    val moving by t.animateFloat(
        0f, 1f,
        infiniteRepeatable(tween(1500, easing = LinearEasing), RepeatMode.Restart),
        label = "phase",
    )
    val phase = if (reduce) 0.25f else moving
    Canvas(modifier) {
        val bw = barWidth.toPx()
        val g = gap.toPx()
        val total = bars * bw + (bars - 1) * g
        val startX = (size.width - total) / 2f
        for (i in 0 until bars) {
            val wave = abs(sin((phase * 2 * PI) + i * 0.9)).toFloat()
            val h = size.height * (0.22f + 0.78f * wave * level)
            drawRoundRect(
                color = color,
                topLeft = Offset(startX + i * (bw + g), (size.height - h) / 2f),
                size = Size(bw, h),
                cornerRadius = CornerRadius(bw / 2f),
            )
        }
    }
}

/** First thing people see: calm, branded, never a blank white flash. */
@Composable
fun LoadingScreen(label: String = "Preparing your space") {
    val t = rememberInfiniteTransition(label = "load")
    val glow by t.animateFloat(
        0.35f, 0.85f,
        infiniteRepeatable(tween(1800, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "glow",
    )
    val dots by t.animateFloat(0f, 3f, infiniteRepeatable(tween(1500, easing = LinearEasing)), label = "dots")
    Box(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Ink, Color(0xFF123530)))),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(280.dp).alpha(glow * 0.35f)
                .background(Brush.radialGradient(listOf(Mint, Color.Transparent)), RoundedCornerShape(50)),
        )
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(28.dp)) {
            Waveform(Modifier.size(width = 120.dp, height = 72.dp), color = Mint, bars = 5, level = 0.9f, barWidth = 10.dp, gap = 8.dp)
            Text("Voice Verse", style = MaterialTheme.typography.displaySmall, color = Paper, textAlign = TextAlign.Center)
            Text(
                label + ".".repeat(dots.toInt() + 1),
                style = MaterialTheme.typography.bodyMedium,
                color = Paper.copy(alpha = 0.6f),
            )
        }
    }
}

/** Skeleton row used while lists load, so layout does not jump. */
@Composable
fun SkeletonCard(modifier: Modifier = Modifier) {
    val t = rememberInfiniteTransition(label = "sk")
    val a by t.animateFloat(0.35f, 0.75f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "a")
    Box(
        modifier.fillMaxWidth().height(76.dp).alpha(a)
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(18.dp)),
    )
}

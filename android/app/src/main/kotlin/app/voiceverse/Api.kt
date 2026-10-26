package app.voiceverse

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

@Serializable data class AuthUser(val id: String, val name: String, val email: String, val role: String = "student")
@Serializable data class UserEnvelope(val user: AuthUser? = null)
/** What listeners may know about how a session is paid for. Never any money. */
@Serializable data class SessionBilling(val tier: String = "free", val voice: String = "none", val translation: Boolean = true, val stopped: String? = null)
@Serializable data class LiveSession(
    val id: String = "", val code: String, val title: String, val venueType: String = "other",
    val sourceLang: String = "en", val status: String = "live", val hostName: String? = null,
    val listenerCount: Int? = null, val createdAt: String = "", val billing: SessionBilling? = null,
)
@Serializable data class SessionEnvelope(val session: LiveSession)
@Serializable data class SessionList(val sessions: List<LiveSession> = emptyList())
@Serializable data class InvitedSession(
    val code: String, val title: String, val venueType: String = "other", val sourceLang: String = "en",
    val hostName: String? = null, val createdAt: String = "",
)
@Serializable data class InvitedList(val sessions: List<InvitedSession> = emptyList())
@Serializable data class Caption(val id: String = "", val seq: Int, val text: String, val translatedText: String? = null, val translated: Boolean = false)
@Serializable data class CaptionPage(val status: String = "live", val captions: List<Caption> = emptyList(), val billing: SessionBilling? = null)

// ---- time, plans and the listener pass ----
@Serializable data class TierBalance(val seconds: Long = 0, val nextExpiry: String? = null)
@Serializable data class Balance(
    val captions: TierBalance = TierBalance(), val standard: TierBalance = TierBalance(), val local: TierBalance = TierBalance(),
    val nothingBoughtYet: Boolean = true,
) { fun of(tier: String) = when (tier) { "local" -> local; "standard" -> standard; else -> captions } }
@Serializable data class ListenerAccess(val pass: Boolean = false, val passUntil: String? = null, val trialSecondsLeft: Int = 0, val signedIn: Boolean = false)
@Serializable data class MeResponse(val balance: Balance = Balance(), val listener: ListenerAccess = ListenerAccess())
@Serializable data class LevelInfo(val tier: String, val name: String, val about: String = "")
@Serializable data class BulkInfo(val fromHours: Int = 10, val discountPercent: Int = 10)
@Serializable data class HoursInfo(
    val min: Int = 1, val max: Int = 40, val dayHours: Int = 5, val choices: List<Int> = emptyList(),
    val prices: Map<String, Map<String, Int>> = emptyMap(), val bulk: BulkInfo = BulkInfo(),
)
@Serializable data class PlanPart(val tier: String, val hours: Int)
@Serializable data class PlanInfo(
    val id: String, val event: String, val tier: String, val name: String, val hours: Int, val amount: Int,
    val about: String = "", val includes: List<PlanPart> = emptyList(),
)
@Serializable data class ListenerPlan(val id: String = "listener-pass", val amount: Int = 2000, val days: Int = 30, val trialMinutes: Int = 5, val about: String = "")
@Serializable data class Rules(val validDays: Int = 30, val refundable: Boolean = false, val graceMinutes: Int = 15, val extraVoiceLanguages: String = "")
@Serializable data class Pricing(
    val levels: List<LevelInfo> = emptyList(), val hours: HoursInfo = HoursInfo(), val plans: List<PlanInfo> = emptyList(),
    val listener: ListenerPlan = ListenerPlan(), val rules: Rules = Rules(),
)
@Serializable data class Estimate(
    val usesHours: Double = 0.0, val haveHours: Double = 0.0, val leftAfterHours: Double = 0.0,
    val enough: Boolean = true, val buyHours: Int = 0, val buyPrice: Int = 0, val buyPlan: String? = null,
)
@Serializable data class Checkout(val reference: String = "", val authorizationUrl: String = "")
@Serializable data class SessionUsage(
    val tier: String = "free", val voiceLanguages: Int = 1, val capSeconds: Int? = null, val sessionSeconds: Int = 0,
    val pausedSeconds: Int = 0, val secondsLeft: Int? = null, val secondsUntilCap: Int? = null,
    val backupVoice: Boolean = false, val stopped: String? = null,
)
@Serializable data class SpeechCfg(val supported: Boolean = false, val locale: String? = null, val cloud: Boolean = false)
@Serializable data class LangCfg(
    val code: String, val name: String, val speechRecognition: SpeechCfg = SpeechCfg(),
    val translation: Boolean = false, val textToSpeech: SpeechCfg = SpeechCfg(),
)
@Serializable data class LangList(val languages: List<LangCfg> = emptyList(), val translationProviderConfigured: Boolean = false)
@Serializable data class TranslateResult(val text: String = "", val translated: Boolean = false, val reason: String? = null)
@Serializable data class ErrorBody(val error: String? = null, val message: String? = null, val code: String? = null)

class ApiException(message: String, val status: Int, val code: String? = null) : Exception(message)

/** Persists the auth cookie across launches so people stay signed in. */
private class PersistentCookies(ctx: Context) : CookieJar {
    private val prefs = ctx.getSharedPreferences("vv_cookies", Context.MODE_PRIVATE)
    private val jar = HashMap<String, Cookie>()

    init {
        prefs.all.forEach { (k, v) ->
            val raw = v as? String ?: return@forEach
            val host = k.substringBefore('|')
            val url = HttpUrl.Builder().scheme("http").host(host).build()
            Cookie.parse(url, raw)?.let { jar[k] = it }
        }
    }

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val e = prefs.edit()
        cookies.forEach { c ->
            val key = "${url.host}|${c.name}"
            if (c.expiresAt < System.currentTimeMillis()) {
                jar.remove(key); e.remove(key)
            } else {
                jar[key] = c; e.putString(key, c.toString())
            }
        }
        e.apply()
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> =
        jar.filter { it.key.startsWith("${url.host}|") && it.value.expiresAt > System.currentTimeMillis() }.values.toList()

    @Synchronized
    fun clear() { jar.clear(); prefs.edit().clear().apply() }
}

class Api(ctx: Context) {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
    private val userPrefs = ctx.getSharedPreferences("vv_user", Context.MODE_PRIVATE)
    private val cookies = PersistentCookies(ctx)
    private val jsonType = "application/json".toMediaType()

    private val client = OkHttpClient.Builder()
        .cookieJar(cookies)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(35, TimeUnit.SECONDS)
        .build()

    private val baseUrl: String get() = BASE_URL

    private suspend fun call(method: String, path: String, body: JsonObject? = null): String = withContext(Dispatchers.IO) {
        val base = baseUrl
        val req = Request.Builder().url(base + path)
            .header("Origin", base)
            .header("Accept", "application/json")
            .method(method, if (method == "GET") null else (body ?: buildJsonObject { }).toString().toRequestBody(jsonType))
            .build()
        try {
            client.newCall(req).execute().use { res ->
                val text = res.body?.string().orEmpty()
                if (!res.isSuccessful) {
                    val msg = runCatching { json.decodeFromString<ErrorBody>(text) }.getOrNull()
                    throw ApiException(msg?.message ?: msg?.error ?: "Request failed (${res.code})", res.code, msg?.code)
                }
                text
            }
        } catch (e: IllegalArgumentException) {
            throw ApiException("Something went wrong reaching Voice Verse. Please try again.", 0)
        } catch (e: IOException) {
            throw ApiException("Can't reach Voice Verse. Check your internet connection and try again.", 0)
        }
    }

    private inline fun <reified T> parse(s: String): T = json.decodeFromString(s)

    /**
     * The signed-in user. When the server cannot be reached we keep the remembered user, so a bad
     * signal at launch does not look like being signed out. Only the server saying "no session" signs out.
     */
    suspend fun session(): AuthUser? {
        val body = try {
            call("GET", "/api/auth/get-session")
        } catch (e: ApiException) {
            if (e.status == 0 || e.status >= 500) return cachedUser()
            forgetUser(); return null
        }
        val user = if (body.isBlank() || body == "null") null else runCatching { parse<UserEnvelope>(body).user }.getOrNull()
        if (user != null) rememberUser(user) else forgetUser()
        return user
    }

    private fun rememberUser(u: AuthUser) {
        userPrefs.edit().putString("user", json.encodeToString(AuthUser.serializer(), u)).apply()
    }
    private fun cachedUser(): AuthUser? =
        userPrefs.getString("user", null)?.let { runCatching { json.decodeFromString<AuthUser>(it) }.getOrNull() }
    private fun forgetUser() { userPrefs.edit().clear().apply() }

    suspend fun signIn(email: String, password: String): AuthUser =
        (parse<UserEnvelope>(call("POST", "/api/auth/sign-in/email", buildJsonObject { put("email", email); put("password", password) })).user
            ?: throw ApiException("Sign-in failed", 401)).also { rememberUser(it) }

    suspend fun signUp(name: String, email: String, password: String, role: String): AuthUser =
        parse<UserEnvelope>(call("POST", "/api/auth/sign-up/email", buildJsonObject {
            put("name", name); put("email", email); put("password", password); put("role", role)
        })).user?.also { rememberUser(it) } ?: throw ApiException("Sign-up failed", 400)

    suspend fun signOut() { runCatching { call("POST", "/api/auth/sign-out") }; cookies.clear(); forgetUser() }

    suspend fun languagesFull(): LangList = parse(call("GET", "/api/languages"))
    suspend fun languages(): List<LangCfg> = languagesFull().languages
    /**
     * Spoken audio (MP3) made by the server. Used for Hausa, Yoruba and Igbo, which phones cannot pronounce.
     * Returns null when audio cannot be made; never throws.
     */
    suspend fun speech(text: String, language: String, rate: Float = 1f, session: String? = null): ByteArray? = withContext(Dispatchers.IO) {
        try {
            val body = buildJsonObject {
                put("text", text); put("language", language); put("voice", "female"); put("rate", rate.toDouble())
                if (session != null) put("session", session)
            }
            val req = Request.Builder().url("$baseUrl/api/speech")
                .header("Origin", baseUrl).header("Accept", "audio/mpeg")
                .post(body.toString().toRequestBody(jsonType)).build()
            client.newCall(req).execute().use { res ->
                if (res.isSuccessful) res.body?.bytes()?.takeIf { it.isNotEmpty() } else null
            }
        } catch (e: Exception) { null }
    }

    suspend fun translate(text: String, source: String, target: String, session: String? = null): TranslateResult =
        parse(call("POST", "/api/translate", buildJsonObject {
            put("text", text); put("source", source); put("target", target)
            if (session != null) put("session", session)
        }))
    suspend fun contact(name: String, email: String, topic: String, message: String) {
        call("POST", "/api/contact", buildJsonObject { put("name", name); put("email", email); put("topic", topic); put("message", message) })
    }
    suspend fun invited(): List<InvitedSession> = parse<InvitedList>(call("GET", "/api/live/invited")).sessions
    suspend fun mine(): List<LiveSession> = parse<SessionList>(call("GET", "/api/live/sessions/mine")).sessions
    suspend fun get(code: String): LiveSession = parse<SessionEnvelope>(call("GET", "/api/live/sessions/${enc(code)}")).session
    suspend fun join(code: String) { call("POST", "/api/live/sessions/${enc(code)}/join") }
    suspend fun end(code: String) { call("POST", "/api/live/sessions/${enc(code)}/end") }
    suspend fun create(title: String, venue: String, lang: String, tier: String? = null, voiceLanguages: Int = 1, capMinutes: Int? = null): LiveSession =
        parse<SessionEnvelope>(call("POST", "/api/live/sessions", buildJsonObject {
            put("title", title); put("venueType", venue); put("sourceLang", lang)
            if (tier != null) { put("tier", tier); put("voiceLanguages", voiceLanguages) }
            if (capMinutes != null) put("capMinutes", capMinutes)
        })).session
    suspend fun addCaption(code: String, text: String) {
        call("POST", "/api/live/sessions/${enc(code)}/captions", buildJsonObject { put("text", text) })
    }
    /** `wait` > 0 holds the request on the server until the speaker's next line arrives (real time). */
    suspend fun captions(code: String, after: Int, lang: String?, wait: Int = 0): CaptionPage =
        parse(call("GET", "/api/live/sessions/${enc(code)}/captions?after=$after" + (lang?.let { "&lang=${enc(it)}" } ?: "") + (if (wait > 0) "&wait=$wait" else "")))
    suspend fun usage(code: String): SessionUsage = parse(call("GET", "/api/live/sessions/${enc(code)}/usage"))

    // ---- time, plans, listener pass ----
    suspend fun pricing(): Pricing = parse(call("GET", "/api/billing/pricing"))
    suspend fun me(): MeResponse = parse(call("GET", "/api/billing/me"))
    suspend fun estimate(tier: String, minutes: Int, voiceLanguages: Int): Estimate =
        parse(call("POST", "/api/billing/estimate", buildJsonObject {
            put("tier", tier); put("minutes", minutes); put("voiceLanguages", voiceLanguages)
        }))
    /** Starts a payment. Open the returned address in the browser: it is Paystack's own page. */
    suspend fun checkout(plan: String): Checkout =
        parse(call("POST", "/api/payments/checkout", buildJsonObject { put("plan", plan) }))

    private fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8")

    companion object {
        /** The live Voice Verse server. The app always talks to this. */
        const val BASE_URL = "https://voiceverse-rose.vercel.app"
    }
}

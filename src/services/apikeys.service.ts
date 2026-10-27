import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/config/db/db";
import { apiKeys } from "@/models/schema";

export const KEY_PREFIX = "vv_";
const MAX_KEYS_PER_USER = 10;

export const hashKey = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** 256 bits of randomness, e.g. vv_k3J9...  (46 characters). */
export function generateKey() {
  const secret = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { secret, prefix: secret.slice(0, KEY_PREFIX.length + 6), hash: hashKey(secret) };
}

/** Cheap shape check so junk never reaches the database. */
export const looksLikeKey = (s: string) => /^vv_[A-Za-z0-9_-]{43}$/.test(s);

export type VerifiedKey = { id: string; userId: string; capKobo: number | null };

// Verified keys are remembered briefly so a busy client does not cost a query per call.
const CACHE_MS = 30_000;
const cache = new Map<string, { key: VerifiedKey | null; until: number }>();
const lastTouch = new Map<string, number>();

export const apiKeysService = {
  async create(userId: string, name: string) {
    const existing = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
    if (existing.length >= MAX_KEYS_PER_USER) return { error: "KEY_LIMIT" as const };

    const { secret, prefix, hash } = generateKey();
    const [row] = await db
      .insert(apiKeys)
      .values({ userId, name, prefix, keyHash: hash })
      .returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt });
    return { key: row!, secret };
  },

  /** Drops cached copies of a key (after its limit changes) so the change applies at once on this instance. */
  forget(keyId: string) {
    for (const [hash, v] of cache) if (v.key?.id === keyId) cache.delete(hash);
  },

  list(userId: string) {
    return db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
      .orderBy(desc(apiKeys.createdAt));
  },

  async revoke(userId: string, id: string) {
    const rows = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id, keyHash: apiKeys.keyHash });
    for (const r of rows) cache.delete(r.keyHash); // takes effect immediately on this instance
    return rows.length > 0;
  },

  /** Returns the key's owner, or null for unknown or revoked keys. */
  async verify(secret: string): Promise<VerifiedKey | null> {
    if (!looksLikeKey(secret)) return null;
    const hash = hashKey(secret);
    const now = Date.now();
    const hit = cache.get(hash);
    if (hit && hit.until > now) return hit.key;

    const [row] = await db
      .select({ id: apiKeys.id, userId: apiKeys.userId, capKobo: apiKeys.monthlyCapKobo })
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
      .limit(1);
    const key = row ?? null;
    cache.set(hash, { key, until: now + (key ? CACHE_MS : 5_000) });
    if (cache.size > 2000) for (const [k, v] of cache) if (v.until <= now) cache.delete(k);

    // Record usage at most once a minute per key.
    if (key && (lastTouch.get(key.id) ?? 0) < now - 60_000) {
      lastTouch.set(key.id, now);
      db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id)).catch(() => {});
    }
    return key;
  },
};

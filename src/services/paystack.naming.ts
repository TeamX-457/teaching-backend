/**
 * How Voice Verse labels its money on the shared Paystack account.
 *
 * One Paystack account serves several products (Choropia, MirrorCentral, NutriScan, RentSplit, VisionMirror and
 * Voice Verse; their codes are in PRODUCTS below), so every reference starts with the product code and every transaction carries the same metadata
 * keys. That is what lets the dashboard, exports, the webhook router and `scripts/paystack-report.ts` tell each
 * product's money apart, so profit and loss can be worked out per product.
 *
 * This is the same convention Choropia uses (payments/naming.py there):
 *
 *     VOICEVERSE-API-20261023-4F9A2C7B1E0D     a payment for the API
 *
 * Paystack only allows letters, digits, "-", "." and "=" in a reference, so purposes are reduced to those.
 */
import { randomBytes } from "node:crypto";

export const APP_CODE = "VOICEVERSE";
export const APP_NAME = "Voice Verse";

/**
 * Product codes on the shared account (each product's own APP_CODE), used by the report to name each bucket.
 * Note MirrorCentral is MIRROR and RentSplit is SPLITPAY. A prefix is matched whole ("MIRROR-" never matches
 * "VISIONMIRROR-"), so none of these collide.
 */
export const PRODUCTS: Record<string, string> = {
  CHOROPIA: "Choropia",
  MIRROR: "MirrorCentral",
  NUTRISCAN: "NutriScan",
  SPLITPAY: "RentSplit",
  VISIONMIRROR: "VisionMirror",
  VOICEVERSE: "Voice Verse",
};

/** "api starter" -> "API-STARTER". Never empty. */
export function cleanPurpose(purpose: string): string {
  const cleaned = purpose
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "PAYMENT";
}

export function makeReference(purpose: string, now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const id = randomBytes(6).toString("hex").toUpperCase(); // 12 hex characters, like Choropia
  return `${APP_CODE}-${cleanPurpose(purpose)}-${stamp}-${id}`;
}

/** True only for references this product made. Other products' events must be left alone. */
export function isOurs(reference: string | null | undefined): boolean {
  return (reference ?? "").toUpperCase().startsWith(`${APP_CODE}-`);
}

/** The product a reference belongs to, from its prefix, or null when it has none of ours. */
export function productOf(reference: string | null | undefined): string | null {
  const prefix = /^([A-Z0-9]+)-/.exec((reference ?? "").toUpperCase())?.[1];
  return prefix && prefix in PRODUCTS ? prefix : null;
}

/** Sent with every transaction. custom_fields appear on the Paystack dashboard. */
export function paystackMetadata(purpose: string, description: string, extra: Record<string, unknown> = {}) {
  return {
    app: APP_CODE,
    app_name: APP_NAME,
    purpose: cleanPurpose(purpose),
    ...extra,
    custom_fields: [
      { display_name: "App", variable_name: "app", value: APP_NAME },
      { display_name: "Payment for", variable_name: "purpose", value: description.slice(0, 200) },
    ],
  };
}

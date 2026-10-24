/**
 * What Voice Verse sells. NOTHING is for sale until a plan here has a price and `enabled: true`.
 *
 * - `id`        stable key the app and the ledger use
 * - `purpose`   goes into the Paystack reference, e.g. VOICEVERSE-API-20261023-4F9A2C7B1E0D, so the
 *               dashboard, exports and the profit report show what each payment was for
 * - `amountNaira` the price in naira. Checked on the server: the app can never choose the amount.
 *
 * To start selling: set `amountNaira`, set `enabled: true`, redeploy.
 */
export type Plan = {
  id: string;
  name: string;
  purpose: string;
  description: string;
  amountNaira: number | null;
  enabled: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "api-starter",
    name: "API Starter",
    purpose: "API",
    description: "Voice Verse API access",
    amountNaira: null, // not decided yet
    enabled: false,
  },
];

/** Plans a customer can actually buy right now. */
export const sellable = (plans: Plan[] = PLANS) =>
  plans.filter((p) => p.enabled && typeof p.amountNaira === "number" && p.amountNaira > 0);

# Payments (Paystack)

Voice Verse takes payments through the **shared Paystack account** that six products use. Everything it sends is
labelled so its money can be told apart from the others', for profit and loss per product.

## How a Voice Verse transaction is labelled

Same convention as the other products (see `choropia/payments/naming.py`), implemented in
`src/services/paystack.naming.ts`:

| Where it shows | What Voice Verse sends | Example |
| --- | --- | --- |
| **Reference** (dashboard, exports, webhooks) | `VOICEVERSE-<PURPOSE>-<YYYYMMDD>-<12 hex>` | `VOICEVERSE-API-20261023-4F9A2C7B1E0D` |
| **Metadata** `app` / `app_name` / `purpose` | `VOICEVERSE` / `Voice Verse` / `API` | |
| **Dashboard custom fields** | "App: Voice Verse", "Payment for: ..." | |

Product codes on the shared account (the start of every reference, and `metadata.app`):

| Product | Code |
| --- | --- |
| Choropia | `CHOROPIA` |
| MirrorCentral | `MIRROR` |
| NutriScan | `NUTRISCAN` |
| RentSplit | `SPLITPAY` (see "Known mismatch" below) |
| VisionMirror | `VISIONMIRROR` |
| Voice Verse | `VOICEVERSE` |

Codes are matched whole, so `MIRROR-` never matches `VISIONMIRROR-`.

## What exists

- **Ledger**: table `payments`, one row per transaction (reference, user, plan, amount in kobo, status, fee, live/test).
  A row is written *before* the customer is sent to pay.
- **Endpoints** (`src/routes/payments.route.ts`, prefix `/api/payments`):
  `GET /plans`, `POST /checkout` (signed in), `GET /verify/:reference` (signed in, own payments only),
  `GET /mine` (signed in; re-checks anything still pending), `GET /return` (where Paystack sends the customer),
  `POST /webhook`.
- **Gifts**: `POST /api/support/checkout` (`src/routes/support.route.ts`) takes one-off support payments
  (`VOICEVERSE-SUPPORT-...`).
- **Rules that protect the money**: the price always comes from the server (`src/config/pricing.ts`), never the app;
  a payment is only accepted if Paystack confirms it and the amount and currency match; a paid payment is
  fulfilled exactly once; the webhook checks Paystack's signature on the raw bytes and ignores other products' events.

## Turning selling on

Nothing is for sale until a plan has a price and is enabled. Edit `src/config/pricing.ts`:
set `amountNaira` and `enabled: true`, then redeploy. To grant something after payment, add an entry to
`fulfilments` in `src/services/payments.service.ts` (runs once per paid payment).

## The webhook

Paystack allows **one webhook URL per account**. It points at Choropia (`/api/paystack-webhook`), whose router checks
the signature and forwards each product's events, untouched, to `ROUTE_<APP>`. For Voice Verse set this on
**Choropia's** deployment, then redeploy Choropia:

```
ROUTE_VOICEVERSE=https://voiceverse-rose.vercel.app/api/payments/webhook
```

Until that is set the router acknowledges Voice Verse's events and forwards nothing. Payments still complete: the
return page and `GET /api/payments/mine` confirm directly with Paystack. The webhook only makes it faster and covers
customers who close the tab.

## Reports: profit and loss

```
bun scripts/paystack-report.ts                               # every product, all time
bun scripts/paystack-report.ts --from 2026-10-01 --to 2026-10-31
bun scripts/paystack-report.ts --only VOICEVERSE
bun scripts/paystack-report.ts --csv october.csv             # one row per transaction, for the books
```

It reads the account (read-only) and splits by `metadata.app` or the reference prefix. Only successful payments are
income; Paystack's fee is shown. Anything without a product code is listed as **UNTAGGED**, which means something is
creating payments without labelling them. Hosting, AI and other costs are yours to subtract.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PAYSTACK_SECRET_KEY` | The secret key (`sk_live_...`). `PAYSTACK_API` is accepted if this is not set at all. A variable that is set but empty means "no key". |
| `PUBLIC_API_URL` | Where Paystack sends the customer back (default `https://voiceverse-rose.vercel.app`). |
| `SUPPORT_MIN_NGN` / `SUPPORT_MAX_NGN` | Limits for gifts (default 500 to 1,000,000). |

The key is a **live** key. Never commit it (`.env` is git-ignored), never log it. Tests clear or fake the key and block
the network, so they cannot create real transactions.

## Known mismatch in the other products

Choropia's router (`payments/webhook_router.py`) lists `SPLITSTAY` in `APP_CODES`, but RentSplit labels its payments
`SPLITPAY`. RentSplit's events therefore are not routed. Fix one side so they match.

## Launch checklist

- [ ] `PAYSTACK_SECRET_KEY` set on the Vercel project (production, sensitive)
- [ ] `payments` migration applied to the production database
- [ ] `ROUTE_VOICEVERSE` set on Choropia and Choropia redeployed
- [ ] A plan priced and enabled in `src/config/pricing.ts` (only if you are selling at launch)
- [ ] One real small payment made and found in `bun scripts/paystack-report.ts --only VOICEVERSE`
- [ ] Paystack keys rotated if they were ever pasted into a chat or screenshot

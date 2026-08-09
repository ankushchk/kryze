# Splitx — Revenue Model PRD (Coins + Premium)
> Scope: Coins + Premium only. Partner Network is explicitly **out of scope** for this PRD (deferred to a later phase, since Coins redemption depends on it in the long run).
> Timeline: New sprints appended **after Sprint 9** of the v1 plan (post-MVP phase, Day 31+).

---

## 0. Rebrand Note (SmartSplit → Splitx)

Since the whole app is being renamed, every reference to `smartsplit` needs to change before or alongside this feature work:

- `package.json` name fields (root + all workspaces): `smartsplit` → `splitx`
- Shared package names: `@smartsplit/types` → `@splitx/types`, `@smartsplit/utils` → `@splitx/utils`
- `apps/mobile/app.json` — app display name, `slug`, bundle identifier / package name (Android `applicationId`)
- Any hardcoded strings in UI copy ("SmartSplit" → "Splitx")
- Repo name / README title (cosmetic, not urgent)

**Open question:** Are you renaming the Android `applicationId` / iOS bundle ID too? If the app has already been installed on test devices under the old ID, changing it means a fresh install (old install won't auto-update). Flagging this so it's a conscious choice, not an accident.

This rebrand is listed as **Sprint 10, Day 0** below — do it first, before any new revenue code lands, so you're not renaming a file structure that already has new feature code mixed in.

---

## 1. Goals

| Goal | Why |
|---|---|
| Give users a reason to keep using Splitx daily (not just when splitting a bill) | Coins = engagement/retention loop |
| Create a monetizable premium tier | Direct revenue, no dependency on Partner Network being live |
| Reduce settle-up friction via WhatsApp | Directly ties into Premium's value prop |

## 2. Non-Goals (this phase)

- Partner Network / restaurant redemption (Coins → restaurant discount) — later phase
- Any restaurant-facing dashboard, onboarding flow, or POS integration
- Payment gateway integration is **in scope** only to the extent Premium needs a subscription charge (see open questions, §7)

---

## 3. Feature 1 — Splitx Coins

### 3.1 Mechanic
- Users earn Coins based on **amount settled in-app** (not just spent — specifically for transactions that go through the full flow: SMS/manual entry → split → settlement marked paid).
- Coins are **not** redeemable for restaurant discounts in this phase (that requires Partner Network). Instead:
  - **Confirmed:** Coins can be redeemed for a **Premium discount or free month(s)**.

### 3.2 Open questions (need your input before implementation)
- **Earn rate:** e.g. 1 coin per ₹100 settled? Flat rate per transaction? Needs a formula — not assuming one.
- **Redemption rate:** how many Coins = 1 free Premium month, or what % discount per X coins?
- **Coin expiry:** do Coins expire (e.g. 12 months), or do they persist indefinitely?
- **Do Coins accrue per-user or per-group?** (Likely per-user, but confirming — group settlement means multiple people could "earn" from one transaction.)

### 3.3 Data model (Prisma additions)
```prisma
model CoinLedger {
  id            String   @id @default(cuid())
  userId        String
  amount        Int                // positive = earned, negative = redeemed
  reason        String             // "SETTLEMENT" | "REDEEMED_PREMIUM" | "ADJUSTMENT"
  referenceId   String?            // e.g. settlementId or subscriptionId
  createdAt     DateTime @default(now())
  user          User     @relation(fields: [userId], references: [id])
}

model CoinBalance {
  userId        String   @id
  balance       Int      @default(0)
  updatedAt     DateTime @updatedAt
  user          User     @relation(fields: [userId], references: [id])
}
```
A ledger table (not just a mutable balance column) is used so every earn/redeem event is auditable — important once real money/discounts are involved.

### 3.4 Backend
```
apps/api/src/
├── routes/
│   └── coins.routes.ts         # GET /coins/balance, GET /coins/history, POST /coins/redeem
├── controllers/
│   └── coins.controller.ts
└── services/
    └── coins.service.ts        # awardCoins(userId, settlementId), redeemCoins(userId, amount)
```

**New endpoints:**

| Method | Route | Description |
|---|---|---|
| GET | `/coins/balance` | Current coin balance for authed user |
| GET | `/coins/history` | Ledger of earn/redeem events |
| POST | `/coins/redeem` | Redeem coins toward Premium (body: `{ redemptionType }`) |

`awardCoins()` is triggered from `settlement.service.ts` (existing file) when a `Settlement` entry is marked `isPaid: true` — this is the natural hook point since it already exists in the v1 codebase.

### 3.5 Mobile
```
apps/mobile/src/
├── screens/
│   └── coins/
│       └── CoinsScreen.tsx         # balance, history, "Redeem for Premium" CTA
├── components/
│   └── coins/
│       ├── CoinBalanceCard.tsx
│       └── CoinHistoryRow.tsx
├── services/api/
│   └── coins.api.ts                # getBalance(), getHistory(), redeem()
└── store/
    └── coinsStore.ts                # balance, history[]
```

---

## 4. Feature 2 — Splitx Premium

### 4.1 What Premium includes (per the diagram, confirmed scope)
1. Detailed analytics (deferred detail — see open question below)
2. Multi-page / long-bill OCR support
3. WhatsApp bot integration:
   - Forward a receipt photo to the bot → get an itemized split back in seconds, no need to open the app
   - Automated settle-up nudges via WhatsApp instead of in-app notifications
   - Slash commands: `/own`, `/remind <user>`, `/status`

### 4.2 Open questions
- **"App integrations"** is mentioned on the diagram (underlined) with no further detail — I'm not inventing what this means. Please clarify: integrations with what (UPI apps, calendar, other expense tools)?
- **"Detailed analytics"** — what specifically? (Spending trends over time? Per-group breakdown? Category tagging, which doesn't exist in the current schema?)
- **Pricing:** monthly price point, or coins-only redemption with no direct cash price?
- **Payment gateway for cash purchase:** Razorpay/Stripe/other? (Only needed if Premium can be bought directly, not just via Coins.)

### 4.3 WhatsApp Bot — integration approach

You asked me to flag this and recommend rather than decide it. Here's the actual tradeoff:

| Approach | Pros | Cons |
|---|---|---|
| **Meta WhatsApp Cloud API** (official) | Free tier, ToS-compliant, won't get banned, scales properly | Business verification can take days–weeks, template message approval needed for proactive nudges |
| **Twilio WhatsApp API** | Faster to get running, good docs, still official (uses Meta's API under the hood) | Costs per message, still needs Meta template approval for outbound nudges |
| **Unofficial (Baileys / whatsapp-web.js)** | No verification wait, works today | Violates WhatsApp's ToS, real risk of number ban — bad for a product real users depend on for settle-up tracking |

**My recommendation: Meta WhatsApp Cloud API directly**, started in Sprint 10 (not the sprint you actually build the bot feature) purely to kick off business verification early, since that's the long pole. Twilio is a reasonable fallback if verification is still pending when you hit the WhatsApp sprint — it sits on the same official rails, just with a faster onboarding wrapper, so you're not stuck.

Either way: **do not use Baileys/whatsapp-web.js** for something users will rely on for money tracking — an account ban mid-feature is a much worse failure mode than a slower rollout.

**Action needed from you before Sprint 12:** confirm Meta Cloud API (start verification now) vs Twilio (start Sprint 12 with no lead time needed).

### 4.4 Data model
```prisma
model Subscription {
  id            String   @id @default(cuid())
  userId        String   @unique
  status        String   @default("inactive") // "active" | "inactive" | "cancelled"
  source        String                          // "COINS_REDEMPTION" | "PAID"
  startedAt     DateTime?
  expiresAt     DateTime?
  user          User     @relation(fields: [userId], references: [id])
}

model WhatsAppSession {
  id            String   @id @default(cuid())
  userId        String
  phone         String   @unique
  linkedAt      DateTime @default(now())
  user          User     @relation(fields: [userId], references: [id])
}

model BotCommandLog {
  id            String   @id @default(cuid())
  userId        String
  command       String   // "/own" | "/remind" | "/status"
  payload       String?
  createdAt     DateTime @default(now())
}
```

### 4.5 Backend
```
apps/api/src/
├── routes/
│   ├── premium.routes.ts         # POST /premium/subscribe, GET /premium/status, POST /premium/cancel
│   └── whatsapp.routes.ts        # POST /whatsapp/webhook (inbound), POST /whatsapp/link
├── controllers/
│   ├── premium.controller.ts
│   └── whatsapp.controller.ts
└── services/
    ├── premium.service.ts        # activatePremium(), checkGate() — used to gate multi-page OCR etc.
    ├── whatsapp.service.ts       # sendMessage(), parseIncoming(), routeCommand()
    └── ocr.service.ts            # EXTEND existing file — add multi-page support (currently single-image only)
```

**New/updated endpoints:**

| Method | Route | Description |
|---|---|---|
| POST | `/premium/subscribe` | Start subscription (via coins or payment) |
| GET | `/premium/status` | Current plan status + expiry |
| POST | `/premium/cancel` | Cancel active subscription |
| POST | `/whatsapp/link` | Link a phone number to WhatsApp bot for a user |
| POST | `/whatsapp/webhook` | Inbound webhook — receipt images + slash commands |
| POST | `/ocr/parse` | **Extend existing route** — accept multi-page payload, gate multi-page behind Premium |

### 4.6 Mobile
```
apps/mobile/src/
├── screens/
│   └── premium/
│       ├── PremiumUpsellScreen.tsx   # what you get, price, "Redeem with Coins" or "Subscribe"
│       └── PremiumStatusScreen.tsx   # in Settings — current plan, expiry, cancel
├── services/api/
│   └── premium.api.ts
└── store/
    └── premiumStore.ts               # isPremium, expiresAt — used to gate UI (e.g. multi-page scan button)
```

`SplitMappingScreen`'s existing "Scan Receipt" flow (from v1 Sprint 6) needs a **Premium gate check** before allowing multi-page capture — single-page OCR stays free, multi-page becomes a Premium-only path.

---

## 5. Data Flow — Coins + Premium

```
[Settlement marked isPaid: true]  (existing v1 flow)
        ↓
[settlement.service.ts] → calls coins.service.ts::awardCoins(userId, settlementId)
        ↓
[CoinLedger entry created] → [CoinBalance updated]
        ↓
[CoinsScreen] → user sees balance → taps "Redeem for Premium"
        ↓
[POST /coins/redeem] → coins.service.ts validates balance → deducts coins
        ↓
[premium.service.ts::activatePremium(userId, source: "COINS_REDEMPTION")]
        ↓
[Subscription row created/updated] → [premiumStore.isPremium = true]
        ↓
[Multi-page OCR + WhatsApp bot linking now unlocked in UI]
```

```
[User forwards receipt photo to Splitx WhatsApp number]
        ↓
[whatsapp.routes.ts webhook receives image]
        ↓
[whatsapp.service.ts::parseIncoming] → checks premium.service.ts::checkGate(userId)
        ↓ (if Premium active)
[ocr.service.ts parses receipt] → [whatsapp.service.ts::sendMessage] → itemized split sent back on WhatsApp
        ↓
Slash commands (/own, /remind <user>, /status) → [routeCommand()] → [BotCommandLog] → relevant service called
```

---

## 6. Sprint Timeline (post-MVP, appended after Sprint 9)

### Sprint 10 — Days 31–33: Rebrand + Coins Backend
- **Day 0 of this sprint:** full SmartSplit → Splitx rebrand (see §0)
- Prisma migration: `CoinLedger`, `CoinBalance`
- `coins.service.ts` — `awardCoins()` hooked into existing `settlement.service.ts`
- `GET /coins/balance`, `GET /coins/history`
- **Kick off Meta WhatsApp Cloud API business verification now** (long lead time — don't wait for Sprint 12)

**Done when:** settling a transaction visibly increases coin balance via API.

### Sprint 11 — Days 34–36: Coins UI + Premium Subscription Model
- `CoinsScreen`, `CoinBalanceCard`, `CoinHistoryRow`
- Prisma migration: `Subscription`
- `POST /coins/redeem`, `premium.service.ts::activatePremium()`
- `PremiumUpsellScreen` — redeem-with-coins path only (payment gateway path depends on open question §4.2)

**Done when:** redeem coins in-app → Subscription row flips to active → `premiumStore.isPremium` reflects it.

### Sprint 12 — Days 37–39: WhatsApp Bot — Receipt Forwarding
- WhatsApp integration finalized (Cloud API or Twilio fallback per §4.3 decision)
- `POST /whatsapp/link`, `POST /whatsapp/webhook`
- `whatsapp.service.ts` — receive image → route to `ocr.service.ts` → reply with itemized split
- Premium gate check before processing

**Done when:** forward a receipt on WhatsApp → itemized reply arrives, only for Premium accounts.

### Sprint 13 — Days 40–42: Multi-page OCR + Slash Commands + Nudges
- Extend `ocr.service.ts` for multi-page bill support
- `/own`, `/remind <user>`, `/status` command routing + `BotCommandLog`
- Automated settle-up nudges sent via WhatsApp (replacing/supplementing in-app notification from v1 Sprint 7)
- `PremiumStatusScreen` in Settings

**Done when:** multi-page receipt scans correctly (Premium-gated); `/status` in WhatsApp returns correct settlement summary.

### Sprint 14 — Days 43–45: Polish + Demo Prep
- Empty/edge states: zero coins, expired Premium, unlinked WhatsApp number
- Error handling: webhook failures, OCR failures on bad multi-page scans
- Demo script update: settle a transaction → show coins earned → redeem → show Premium unlock → demo WhatsApp receipt flow live
- README update reflecting Splitx rebrand + new revenue features

---

## 7. Consolidated Open Questions (blocking full implementation)

1. Coin earn rate formula (per ₹ settled, or flat per transaction)
2. Coin-to-Premium redemption rate (how many coins = how much discount/free time)
3. Coin expiry policy
4. Whether Coins accrue per-user or somehow shared/split across a group's members
5. Meaning of "app integrations" under Premium (diagram term, undefined)
6. Scope of "detailed analytics" under Premium
7. Premium direct cash price, if purchasable without coins
8. Payment gateway choice for direct Premium purchase (if applicable)
9. Whether Android `applicationId` / iOS bundle ID change as part of the rebrand (affects existing test installs)

Nothing above has been assumed or filled in with a default — flagging all of it for your call before the relevant sprint starts.

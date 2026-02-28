# NutriVault - Complete Setup & Launch Guide

## Status

### Wat is klaar (in de code)
- [x] Volledige app: food logging, foto-analyse, voice input, coach, workouts
- [x] AI food logging op MyFitnessPal/Lose It! niveau
- [x] TypeScript: 0 errors, Build: PASS
- [x] Apple Developer Account
- [x] Website (docs/)
- [x] Supabase backend (activatiecode systeem)
- [x] Privacy Policy (NL)
- [x] 6 talen (EN, NL, DE, FR, ES, IT)
- [x] iOS Capacitor configuratie (com.nutrivault.app)

---

## Fase 0: Schone Start op je Mac

> **Status: VOLTOOID** — Repository is hernoemd naar NutriVault en code is gepusht.

### Stap 1 — Dependencies installeren

```bash
# Installeer alle packages
npm install
```

### Stap 2 — Controleer of alles werkt

```bash
# TypeScript check
npx tsc --noEmit

# Production build
npm run build
```

Je moet zien: `✓ built in X.XXs` zonder errors.

### Stap 3 — Dev server starten (testen in browser)

```bash
npm run dev
```

Open http://localhost:5173 in je browser. De app moet laden.
Stop met `Ctrl+C`.

---

## Fase 1: Vercel Deployment

De app heeft een Vercel backend nodig voor de Gemini API (key blijft server-side).

### Stap 1 — Vercel CLI installeren

```bash
npm install -g vercel
```

### Stap 2 — Vercel project aanmaken

```bash
cd ~/NutriVault
vercel
```

Beantwoord de vragen:
- **Set up and deploy?** → `Y`
- **Which scope?** → kies je account
- **Link to existing project?** → `N`
- **Project name?** → `nutrivault`
- **Directory?** → `./`
- **Override settings?** → `N`

### Stap 3 — Gemini API key instellen

```bash
vercel env add GEMINI_API_KEY
```

- **Environment:** kies `Production`, `Preview`, `Development` (alle drie)
- **Value:** plak je Google Gemini API key

Heb je nog geen Gemini key? Haal er een op: https://aistudio.google.com/apikey

### Stap 4 — Opnieuw deployen met de key

```bash
vercel --prod
```

### Stap 5 — Testen

Open de URL die Vercel geeft (bijv. `nutrivault.vercel.app`).
Test of food logging werkt door iets in te typen.

---

## Fase 2: iOS App Bouwen

### Stap 1 — Capacitor sync

```bash
cd ~/NutriVault
npm run build
npx cap sync ios
```

### Stap 2 — Open in Xcode

```bash
npx cap open ios
```

Xcode opent automatisch.

### Stap 3 — Xcode configuratie

In Xcode, klik op het project (bovenaan links in de navigator):
1. **Signing & Capabilities** tab:
   - Team: selecteer je Apple Developer account
   - Bundle Identifier: moet `com.nutrivault.app` zijn
2. **General** tab:
   - Display Name: `NutriVault`
   - Minimum Deployments: `iOS 15.0`

### Stap 4 — Testen op je iPhone

1. Sluit je iPhone aan met USB
2. Selecteer je iPhone als target (bovenaan in Xcode)
3. Klik de ▶ Play knop
4. Bij eerste keer: ga op je iPhone naar Instellingen → Algemeen → VPN & Apparaatbeheer → vertrouw je developer profiel

### Stap 5 — App Icon toevoegen

Je hebt een 1024x1024px PNG nodig (geen transparantie/alpha).
In Xcode: Assets.xcassets → AppIcon → sleep je icon erin.

---

## Fase 3: App Store Voorbereiden

### Stap 1 — App Store Connect

1. Ga naar https://appstoreconnect.apple.com
2. Klik **My Apps** → **+** → **New App**
3. Vul in:
   - **Platform:** iOS
   - **Name:** NutriVault
   - **Primary Language:** Dutch
   - **Bundle ID:** com.nutrivault.app
   - **SKU:** nutrivault001

### Stap 2 — App informatie invullen

- **Subtitle:** Voeding & Fitness Tracker
- **Category:** Health & Fitness
- **Content Rights:** Does not contain third-party content
- **Age Rating:** 4+

### Stap 3 — Screenshots maken

Je hebt screenshots nodig in deze formaten:

| Device | Resolutie |
|--------|-----------|
| iPhone 6.7" (15 Pro Max) | 1290 × 2796 |
| iPhone 6.5" (11 Pro Max) | 1242 × 2688 |
| iPhone 5.5" (8 Plus) | 1242 × 2208 |

**Tip:** Gebruik de Simulator in Xcode → File → Screenshot (⌘S).

### Stap 4 — Beschrijving & Keywords

**Beschrijving (NL):**
```
NutriVault is je persoonlijke voedingscoach. Log je eten met tekst, foto of spraak — de AI herkent alles van een simpel "koffie" tot "broodje kroket met fritessaus".

✓ Slim food logging met AI
✓ Foto-analyse van je maaltijd
✓ Spraakherkenning
✓ Persoonlijke coach
✓ Workout suggesties
✓ 6 talen ondersteund
✓ Privacy-first: data op je device
```

**Keywords (max 100 chars):**
```
voeding,calorieën,fitness,dieet,tracker,macro,eten,gezond,afvallen,coach
```

### Stap 5 — URLs invullen

- **Support URL:** `https://mt1989mt.github.io/NutriVault/support.html`
- **Privacy Policy URL:** `https://mt1989mt.github.io/NutriVault/privacy-policy.html`

---

## Fase 4: In-App Purchase (RevenueCat)

### Stap 1 — App Store Connect: Subscription aanmaken

1. In App Store Connect → je app → **Subscriptions**
2. Klik **+** bij Subscription Groups → naam: `NutriVault Premium`
3. Voeg subscription toe:
   - **Reference Name:** Monthly Premium
   - **Product ID:** `nutrivault_monthly`
   - **Duration:** 1 Month
   - **Price:** €4,99 (Tier 5)

### Stap 2 — RevenueCat account

1. Ga naar https://app.revenuecat.com → maak account
2. **New Project** → naam: NutriVault
3. **Apps** → **+ New** → kies Apple App Store
4. Vul je **Bundle ID** in: `com.nutrivault.app`
5. Upload je **App Store Connect API Key** (Shared Secret)

### Stap 3 — RevenueCat configureren

1. **Entitlements** → **+ New** → ID: `premium`
2. **Products** → **+ New** → ID: `nutrivault_monthly`, koppel aan App Store
3. **Offerings** → Default → voeg je product toe
4. Kopieer je **Public API Key** (begint met `appl_`)

### Stap 4 — API key instellen

```bash
cd ~/NutriVault
echo "VITE_REVENUECAT_API_KEY=appl_jouw_key_hier" >> .env.local
```

---

## Fase 5: Supabase Edge Functions

```bash
# Installeer Supabase CLI (als je die nog niet hebt)
brew install supabase/tap/supabase

# Link aan je project
cd ~/NutriVault
supabase link --project-ref gbdrsqskqvsfnwyeidda

# Deploy alle edge functions
supabase functions deploy create-code
supabase functions deploy verify-code
supabase functions deploy extend-subscription
```

---

## Fase 6: App Store Submit

### Stap 1 — Archive bouwen

In Xcode:
1. Selecteer **Any iOS Device** als target (niet je iPhone)
2. Menu: **Product** → **Archive**
3. Wacht tot de build klaar is

### Stap 2 — Upload naar App Store Connect

1. In het Organizer venster: selecteer je archive
2. Klik **Distribute App**
3. Kies **App Store Connect** → **Upload**
4. Volg de wizard, laat alles op defaults

### Stap 3 — Submit voor review

1. Ga naar App Store Connect in je browser
2. Selecteer je build
3. Vul de review informatie in
4. Klik **Submit for Review**

Review duurt meestal 1-3 dagen (eerste keer soms langer).

---

## Fase 7: Na Launch

### GitHub Pages activeren (voor support/privacy URLs)

```bash
cd ~/NutriVault
git push origin main
```

Op GitHub:
1. Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main`, folder: `/docs`
4. Save

### Marketing (optioneel)

- [ ] Apple Search Ads: https://searchads.apple.com
- [ ] Keywords: "calorie tracker", "voeding app", "macro tracker"
- [ ] Budget: €50-100/maand

---

## Environment Variabelen

| Variabele | Waar instellen | Verplicht |
|-----------|---------------|-----------|
| `GEMINI_API_KEY` | Vercel dashboard | Ja |
| `VITE_API_BASE_URL` | .env.local | Nee (default: vercel URL) |
| `VITE_SUPABASE_URL` | .env.local | Nee (ingebouwd) |
| `VITE_SUPABASE_ANON_KEY` | .env.local | Nee (ingebouwd) |
| `VITE_REVENUECAT_API_KEY` | .env.local | Nee (test key) |

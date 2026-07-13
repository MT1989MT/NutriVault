# NutriVault — Roadmap & Checklist voor iOS-launch

**Bijgewerkt:** 9 juli 2026 · Vervangt de verouderde statusinfo in `LAUNCH_READINESS.md` / `NEXT_STEPS.md`.

## Waar we staan

De grote code-doorlichting van juli 2026 is gemerged naar `main` (PR #35):
kern-logging-loop gerepareerd (immutable storage writes), lokale datums,
IndexedDB clear/import/merge, taalschakelaar (6 talen actief), coach-cache,
portie-bewerking, meerweekse trainingsplannen, error-UI voor AI-fouten, en
backend-hardening (Gemini-gate, extend-lockdown, durable rate-limiting —
alles flag-gated, standaard uit). Productie deployt automatisch via Vercel.

**Volledige app-test (9 juli 2026):** 9 flows end-to-end in echte browsers
tegen de productie-build met gemockte AI — onboarding+wizard, AI-logging,
water/handmatig, workouts+plan, recepten, coach, overzicht/gewicht,
instellingen/taal/data-wissen, profiel-validatie. **43 checks, alle
regressie-fixes bevestigd, nul console-errors.** Vier kleine bevindingen
zijn direct gefixt (nette fout bij niet-array AI-antwoord, custom
macro-split zichtbaar in Profiel, wizard-hint bij uitgeschakelde knop,
bevestiging bij plan-verwijderen + duidelijker wis-waarschuwing).

---

## Fase 1 — Backend activeren (½ dag, eenmalig)

- [ ] `supabase functions deploy check-entitlement` (vanuit de projectroot)
- [ ] Vercel env: `REQUIRE_GEMINI_AUTH=true` zetten (PAS NA de deploy hierboven,
      anders krijgen alle AI-calls een 402)
- [ ] Upstash Redis aanmaken (gratis tier: console.upstash.com) en
      `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Vercel zetten
      → durable rate-limiting over alle instances
- [ ] Controleren dat `VITE_TEST_MODE` NIET in de productie-env staat
- [ ] `ALLOW_MANUAL_EXTEND` NIET zetten (verlengingen lopen via de webhook)
- [ ] E2e-check: app openen, inloggen met echte code, eten loggen → werkt;
      `curl -X POST .../api/gemini` zonder code → 402

## Fase 2 — Betalingen beslissen & bouwen (1-3 dagen)

**Beslispunt:** native in-app purchases in v1, of eerst zonder betaalmuur
lanceren (bijv. TestFlight-only)?

Bij native purchases (App Store vereist dit voor digitale abonnementen):
- [ ] `npm install @revenuecat/purchases-capacitor @revenuecat/purchases-capacitor-ui`
      (nu NIET geïnstalleerd — elk aankooppad geeft "Payment system not available")
- [ ] `externals` in `vite.config.ts` kloppen dan nog; `npx cap sync ios`
- [ ] App Store Connect: subscription group + product `nutrivault_monthly` (€4,99)
- [ ] RevenueCat: project, entitlement `premium`, offering koppelen,
      `VITE_REVENUECAT_API_KEY` (public, appl_…) in build-env
- [ ] Webhook: URL instellen + `REVENUECAT_WEBHOOK_SECRET` in Vercel
- [ ] Receipt-gate aanzetten: `REQUIRE_PURCHASE_RECEIPT=true` +
      `REVENUECAT_SECRET_KEY` in Vercel; client stuurt `appUserId` mee bij
      create-code (kleine client-wijziging — TODO in `AuthScreen.tsx`)
- [ ] Sandbox-tester account; volledige koop → code → login flow op device testen
- [ ] "Restore purchases" testen (Apple-vereiste 3.1.1)

## Fase 3 — iOS build & device-test (1-2 dagen, op je Mac)

- [ ] `npm run build && npx cap sync ios && npx cap open ios`
- [ ] Xcode: team selecteren, bundle `com.nutrivault.app`, min. iOS 15.0
- [ ] `PrivacyInfo.xcprivacy` in het Xcode-project opnemen (File > Add Files,
      "Copy items" UIT) — App Store-vereiste
- [ ] App-icon 1024×1024 PNG (zonder alpha) in Assets.xcassets
      (de webiconen `public/icons/icon-*.png` zijn al PNG; maak een 1024-variant)
- [ ] Op fysiek device de volledige checklist doorlopen:
  - [ ] Onboarding + wizard (10 stappen) → dashboard
  - [ ] Eten loggen: tekst, foto (camera én bibliotheek), spraak
  - [ ] Tweede item loggen → verschijnt direct (regressietest)
  - [ ] Water, habits, handmatige invoer, portie bewerken
  - [ ] Workouts: genereren, handmatig, trainingsplan week 1→N verschilt,
        dag verplaatsen met pijltjes (touch!)
  - [ ] Recepten: genereren, porties-stepper, boodschappenlijst
  - [ ] Coach: meerdere berichten → verschillende antwoorden; chat wissen
        blijft gewist na herstart
  - [ ] Overzicht: weekgrafiek, gewicht loggen, streak
  - [ ] Instellingen: taal wisselen (alle 6), export → import, data wissen
        (blijft weg na herstart!), uitloggen/inloggen met code
  - [ ] Offline gedrag: vliegtuigmodus → app opent, nette foutmelding bij AI
  - [ ] Timezone-test: logs rond middernacht belanden op de juiste dag
- [ ] Let op: `CapacitorHttp` patcht fetch — controleer dat AI-timeouts op
      device redelijk aanvoelen (AbortController werkt daar niet)

## Fase 4 — App Store Connect (½ dag)

- [ ] New App: NutriVault, bundle `com.nutrivault.app`, SKU nutrivault001,
      primaire taal Nederlands
- [ ] Metadata: categorie Health & Fitness, age rating 4+
- [ ] Support-URL: `https://nutri-vault-two.vercel.app/docs/support.html`
- [ ] Privacy-URL: `https://nutri-vault-two.vercel.app/docs/privacy-policy.html`
- [ ] App Privacy vragenlijst: geen tracking; health-data lokaal;
      food-tekst naar Gemini (verwerking, niet gekoppeld aan identiteit)
- [ ] Screenshots: 6.7" (1290×2796), 6.5" (1242×2688), 5.5" (1242×2208)
      — via Xcode Simulator, in het Nederlands
- [ ] Beschrijving + keywords (zie `NEXT_STEPS.md` voor de teksten)

## Fase 5 — Submit & release (1-3 dagen review)

- [ ] Xcode: Product → Archive → Distribute → App Store Connect
- [ ] Eerst TestFlight: interne test met 2-3 mensen, minimaal een paar dagen echt gebruik
- [ ] Submit for Review (reviewnotes: leg het anonieme code-model uit +
      geef een werkende testcode mee!)
- [ ] Na goedkeuring: gefaseerde release aanzetten

## Bekende beperkingen (bewust, v1-acceptabel)

| Item | Status |
|---|---|
| Sessie verloopt hard na 7 dagen → code opnieuw invoeren | Heroverwegen in v1.1 (bijv. verlengen bij actief gebruik) |
| Rate-limiter zonder Upstash is per-instance | Opgelost zodra Fase 1 Upstash-stap gedaan is |
| `create-code` zonder receipt-gate is publiek (5/uur/IP-limiet) | Dicht zodra Fase 2 receipt-gate aan staat |
| Drag-and-drop plan-dagen werkt niet op touch | Pijltjes-knoppen zijn het touch-alternatief |
| Web-versie heeft geen betaalmuur op de AI zonder Fase 1 | Fase 1 lost dit op |

## v1.1-ideeën (na launch)

- **i18n-sweep:** Profiel, Workouts, History en Onboarding bevatten nog
  hardcoded Engelse strings in een NL UI (gevonden in de app-test); ook
  "Kopieer gisteren's" → "Kopieer … van gisteren"
- Streak zichtbaar maken op het dashboard (wordt al berekend)
- Habits-feature afmaken of verwijderen (nu dood: niets zet `profile.habits`)
- Gewicht met terugwerkende kracht kunnen loggen/corrigeren
- "Verlengen"-knop op web: nette melding "alleen in de app" i.p.v. stille no-op
- Servings-stepper: hele porties sneller (nu 4× tikken voor 2 porties)
- Web Worker voor foto-verwerking; focus-trap + Escape in modals
- Unit tests voor `calculations.ts`, `storage.ts` en `auth.ts`
- Éen calorieverbrand-model voor Dashboard én History (nu twee verschillende)

# Privacy Policy - NutriVault

**Laatst bijgewerkt:** December 2025

## Samenvatting

NutriVault respecteert je privacy volledig. We slaan **geen persoonlijke gegevens** op. Je gezondheidsdata blijft **100% lokaal op je eigen device**.

---

## Wat we opslaan

### Op onze servers (Supabase)
We slaan **uitsluitend** het volgende op:

| Gegeven | Omschrijving |
|---------|--------------|
| Code Hash | Een versleutelde (SHA-256) versie van je 16-cijferige toegangscode |
| Weergavenaam | Een willekeurig gegenereerde naam (bijv. "Blue Phoenix") |
| Vervaldatum | Wanneer je abonnement verloopt |
| Aanmaakdatum | Wanneer je account is aangemaakt |

**We slaan NIET op:**
- Je originele toegangscode (alleen de hash)
- Je naam, email, of telefoonnummer
- Je gezondheidsdata (gewicht, calorieën, maaltijden, workouts)
- Je locatie
- Je apparaatgegevens
- Tracking of analytics data

### Op je device (lokaal)
Al je persoonlijke gezondheidsdata wordt **uitsluitend** opgeslagen op je eigen device:

- Voedingslogboek
- Calorieën en macro's
- Workout geschiedenis
- Recepten en boodschappenlijsten
- Persoonlijk profiel (gewicht, lengte, doelen)

Deze data verlaat **nooit** je device en wordt **nooit** naar onze servers gestuurd.

---

## Hoe de toegangscode werkt

1. Bij aanmelding genereren we een unieke 16-cijferige code
2. We versleutelen deze code met SHA-256 (one-way hash)
3. Alleen de hash wordt opgeslagen - de originele code niet
4. Zonder je code kunnen wij (of anderen) nooit bij je account

---

## Betalingen

Betalingen worden verwerkt door Apple App Store of Google Play Store. NutriVault ontvangt **geen** betalingsgegevens zoals creditcardnummers. We ontvangen alleen een bevestiging dat de betaling is geslaagd.

---

## Delen met derden

Wij delen **geen data** met derden. Punt.

- Geen advertentienetwerken
- Geen analytics bedrijven
- Geen datahandelaren
- Geen social media platforms

---

## Data verwijderen

### Lokale data verwijderen
Verwijder de NutriVault app van je device. Al je lokale gezondheidsdata wordt dan permanent verwijderd.

### Account verwijderen
Je toegangscode hash blijft in onze database tot de vervaldatum. Na verloop wordt deze automatisch inactief. Als je wilt dat we je code hash eerder verwijderen, neem contact met ons op.

---

## Beveiliging

- Alle communicatie met onze servers verloopt via HTTPS (TLS 1.3)
- Toegangscodes worden versleuteld opgeslagen (SHA-256)
- Database wordt gehost op Supabase met Row Level Security
- We bewaren geen logs van API verzoeken

---

## Kinderen

NutriVault is niet bedoeld voor kinderen onder de 16 jaar. We verzamelen bewust geen gegevens van kinderen.

---

## Wijzigingen

Bij wijzigingen in dit privacybeleid wordt de "Laatst bijgewerkt" datum aangepast. Grote wijzigingen worden aangekondigd in de app.

---

## Contact

Vragen over privacy? Neem contact op:

**Email:** [jouw-email@example.com]
**Website:** [jouw-website.com]

---

## Rechten (AVG/GDPR)

Je hebt het recht om:
- Te weten welke data we van je hebben (alleen je code hash)
- Je data te laten verwijderen
- Je data te exporteren (niet van toepassing - we hebben alleen een hash)
- Bezwaar te maken tegen verwerking

Aangezien we alleen een versleutelde hash opslaan en geen persoonlijke gegevens, zijn de meeste AVG-rechten automatisch gewaarborgd.

---

## Technische Details

Voor de technisch geïnteresseerden:

```
Data opgeslagen in cloud:
- code_hash: SHA-256 hash (64 karakters hex)
- display_name: String (bijv. "Blue Phoenix")
- created_at: Timestamp
- expires_at: Timestamp
- is_active: Boolean

Data opgeslagen lokaal (device):
- Alle gezondheidsdata in localStorage/IndexedDB
- Sessietoken voor authenticatie
```

---

*Deze privacy policy is geschreven in duidelijke taal, niet in juridisch jargon, omdat we geloven dat je moet begrijpen wat er met je data gebeurt.*

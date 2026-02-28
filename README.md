<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# NutriVault - AI-Powered Nutrition & Fitness Tracker

A minimalist, privacy-first calorie and macro tracker that logs food via natural language, voice, or photo. Powered by **Google Gemini AI**.

## Features

- Natural language food logging with AI parsing
- Photo-based meal analysis
- Voice input for hands-free logging
- Recipe generation based on mood and preferences
- Personalized AI coaching with multiple personality styles
- Workout planning and training programs
- Weekly nutrition insights and analytics
- 6 languages supported (EN, NL, DE, FR, ES, IT)
- Privacy-first: health data stays 100% on your device

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS
- **Build:** Vite
- **Mobile:** Capacitor (iOS)
- **Backend:** Supabase (auth & activation codes)
- **AI:** Google Gemini API (server-side via Vercel)
- **Payments:** RevenueCat
- **Hosting:** Vercel

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file in the root directory and add your API key:
   ```
   GEMINI_API_KEY=your-gemini-api-key
   ```

3. Run the app:
   ```bash
   npm run dev
   ```

## Getting an API Key

Get your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

## iOS Build

```bash
npm run build
npx cap sync ios
npx cap open ios
```

See [NEXT_STEPS.md](NEXT_STEPS.md) for the complete setup and App Store submission guide.

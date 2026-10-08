# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Scanare facială, voce și chestionar (1.618)

### Scanarea
- **Web** (`FaceScanner.web.tsx`): mesh facial 3D cu 478 de puncte (MediaPipe Face Landmarker, rulat local în browser).
  Ghidează ca la Face ID: față → profil → celălalt profil → capul în jos (scalp). Fiecare poză se face automat când
  lumina, distanța, expresia și poziția capului sunt bune. Dacă modelul nu se poate încărca, trecem pe o poză simplă.
  Camera cere **https** (sau `localhost`); pe telefon deschide build-ul web printr-un link https.
- **Nativ** (`FaceScanner.tsx`): trei poze cu expo-camera și verificare live de lumină/claritate. Un scan 3D real pe
  telefon cere un development build cu un detector facial nativ (ARKit / vision-camera); nu rulează în Expo Go.
- Adâncimea 3D e **estimată** dintr-o cameră obișnuită, nu măsurată cu senzor TrueDepth. Pragurile (lumină, distanță, unghiuri)
  sunt în `src/lib/faceGeometry.ts` și `FaceScanner.web.tsx` și trebuie calibrate pe dispozitive reale.
- `scan-face` (Edge Function) primește `image` (față) și, opțional, `image_left`, `image_right`, `image_down`.

### Vocea asistentului
Funcția `tts` sintetizează replicile fixe ale asistentului și le ține în bucket-ul public `tts-cache` (o singură dată per replică;
tot catalogul are ~5.000 de caractere). Fără secrete setate, aplicația folosește vocea dispozitivului (expo-speech).
Secrete (Supabase → Edge Functions → Secrets), la alegere:
- **ElevenLabs** (voce mai naturală): `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, opțional `ELEVENLABS_MODEL`
  (implicit `eleven_multilingual_v2`; `eleven_flash_v2_5` costă pe jumătate). Planul gratuit (10.000 credite/lună) merge pentru
  dezvoltare și teste, dar **nu are licență comercială** și cere atribuire; pentru lansare cu abonamente e nevoie de planul Starter.
  Dacă ElevenLabs refuză o voce din bibliotecă pe planul gratuit, alege una din vocile implicite.
- **Azure Speech** (alternativă): `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, opțional `TTS_VOICE`.
Dacă sunt setate ambele, câștigă ElevenLabs.
Textele personale (rezultatele) se rostesc doar cu vocea dispozitivului, nu se trimit la server.

### Chestionar
`src/lib/questionnaire.ts` (52 de întrebări, ~28–47 afișate, în funcție de răspunsuri) și `src/lib/profile.ts`, care derivă
scoruri orientative (stres, somn, fumat, alcool) și semnale de siguranță. Scorurile sunt euristice, **nu clinice**.

### Scanarea 3D pe telefon, prin browser (https)
Scannerul 3D rulează în browserul telefonului, dar camera cere https. Publică build-ul web cu EAS Hosting (cont Expo gratuit):
`npx eas-cli@latest login`, apoi `npm run deploy:web` (prima dată te întreabă numele subdomeniului). Deschizi linkul `*.expo.app` pe telefon.

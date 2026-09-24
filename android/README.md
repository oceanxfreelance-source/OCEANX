# MV Markets — Android app

A small native Android app (no Play Store needed) that opens the MV Markets website full-screen.
Pages of the site open inside the app; calls, WhatsApp, e-mail and other websites open in their own apps;
photo/slip uploads, the back button, file downloads (e.g. revenue PDFs) and an offline screen are handled natively.

Because the app shows the live website, **every website update appears in the app automatically** —
you only need to rebuild the APK to change the app itself (name, icon, domain).

The built APK is published at `public/downloads/mv-markets.apk` → https://mvmarkets.vercel.app/downloads/mv-markets.apk
and offered to customers on https://mvmarkets.vercel.app/app

## Rebuilding

Requirements: JDK 17+, Gradle 8.9+, Android SDK (platform 35, build-tools 35).

1. Put the signing key somewhere safe on your machine and create `android/keystore.properties` (never commit it — this repo is public):

   ```
   MVM_KEYSTORE=/absolute/path/to/mvmarkets-release.jks
   MVM_KEYSTORE_PASSWORD=...
   MVM_KEY_ALIAS=mvmarkets
   MVM_KEY_PASSWORD=...
   ```

2. Increase `versionCode` (and `versionName`) in `app/build.gradle`.
3. Build: `cd android && gradle assembleRelease`
4. Copy `app/build/outputs/apk/release/app-release.apk` to `public/downloads/mv-markets.apk`,
   update `ANDROID_APK` in `src/components/pwa.tsx`, commit and push.

**Always sign with the same key.** Android only installs an update over the existing app if it is signed with
the same key. Its SHA-256 fingerprint is in `public/.well-known/assetlinks.json` (lets site links open in the app).

If you move to a custom domain, update `START_URL` / `APP_HOSTS` in `app/build.gradle`, the host in
`AndroidManifest.xml`, and rebuild.

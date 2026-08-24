# Deployment Guide for SplitX React Native App

This application is built with **Expo SDK 56** and **React Native**, utilizing **pnpm** for package management and **EAS (Expo Application Services)** for cloud builds and deployments.

---

## Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Environment Variables Config](#2-environment-variables-config)
3. [Building for Testing (Preview/Beta)](#3-building-for-testing-previewbeta)
4. [Building for App Store & Play Store (Production)](#4-building-for-app-store--play-store-production)
5. [Submitting to the Stores](#5-submitting-to-the-stores)
6. [Alternative: Local Builds (Offline / Free)](#6-alternative-local-builds-offline--free)

---

## 1. Prerequisites

Before running builds, make sure you have the Expo EAS CLI installed and are authenticated.

### Install EAS CLI
Install the EAS CLI globally (or run it using `pnpm dlx`):
```bash
npm install -g eas-cli
```

### Log In to Expo
Log in to your Expo account:
```bash
eas login
```
*Note: Your `app.json` has `owner` set to `ankushchk` and a project ID already configured. Make sure you log into the account that owns this project or update the owner field if deploying to a different account.*

---

## 2. Environment Variables Config

Your app uses the following configuration variables defined in `.env`:
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`

Since these variables start with `EXPO_PUBLIC_`, they will be automatically bundled into the application binary during build time.

### IMPORTANT: Update the API URL for Production
Before building the app for production, ensure `EXPO_PUBLIC_API_URL` points to your **production backend API address** (e.g., `https://api.kryze.com`) rather than a local development IP (`http://192.168.1.11:3000`).

### Setting Secrets on EAS (Recommended)
You should define these variables on EAS so that the cloud builder can access them:
```bash
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value "https://your-production-backend.com"
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "your-google-web-client-id"
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value "your-google-ios-client-id"
```

Alternatively, you can add them directly to `eas.json` under the respective build profile environments:
```json
"production": {
  "env": {
    "EXPO_PUBLIC_API_URL": "https://your-production-backend.com",
    "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "...",
    "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "..."
  }
}
```

---

## 3. Building for Testing (Preview/Beta)

Your `eas.json` contains a `preview` profile with `distribution: "internal"`. This creates builds you can share with testers.

### Android Preview (APK/AAB)
To generate an installable APK for Android:
```bash
eas build --platform android --profile preview
```
*Tip: Expo will build the package and output a URL or QR code that you/testers can open to download the APK directly onto Android devices.*

### iOS Preview (Ad-Hoc / TestFlight)
To build for iOS testing, you need an Apple Developer Account:
```bash
eas build --platform ios --profile preview
```
*Note: Since it's configured for `"internal"` distribution, EAS will guide you through logging in to your Apple Developer Account to automatically register the UDID of your test devices and generate an Ad-Hoc provisioning profile.*

---

## 4. Building for App Store & Play Store (Production)

To compile store-ready production binaries:

### Android Production (AAB)
```bash
eas build --platform android --profile production
```
- EAS will ask if you want it to generate a keystore for signing the app (recommended) or use an existing one.
- This will output an `.aab` file which Google Play Store requires.

### iOS Production (IPA)
```bash
eas build --platform ios --profile production
```
- EAS will prompt you to log into your Apple Developer Account to generate the required App Store Distribution Certificates and Provisioning Profiles.
- This will output a `.ipa` file signed for App Store distribution.

---

## 5. Submitting to the Stores

You can submit your production builds to the Google Play Store and Apple App Store.

### Method A: Automated (Build & Submit in One Command)
You can append the `--auto-submit` flag to the build command to immediately send the build to the stores upon completion:
```bash
eas build --platform all --profile production --auto-submit
```

### Method B: Manual Submit (After Build Completes)
If you already have a build completed on EAS, you can submit it using:
```bash
eas submit --platform android
eas submit --platform ios
```
*Note: You will need to complete the one-time store setup on Google Play Console and App Store Connect (credentials, store listings) for submission to succeed.*

---

## 6. Alternative: Local Builds (Offline / Free)

If you don't want to use EAS cloud build servers (which have monthly free tier limits), you can build locally because the `android` and `ios` native directories are already generated in your project.

### Local Android Build
1. Make sure Android SDK and Android Studio are installed on your computer.
2. Build the release APK/AAB:
   ```bash
   cd mobile/android
   # For APK:
   ./gradlew assembleRelease
   # For AAB (Store upload):
   ./gradlew bundleRelease
   ```
3. The build output will be located in: `mobile/android/app/build/outputs/`.

### Local iOS Build (Requires macOS + Xcode)
1. Open the workspace in Xcode:
   ```bash
   open mobile/ios/SplitX.xcworkspace
   ```
2. In Xcode, configure your team signing under the **Signing & Capabilities** tab of the project target.
3. Select **Any iOS Device (arm64)** as the target device.
4. Go to **Product** > **Archive** to build the application bundle.
5. Once the archive is created, use the **Distribute App** organizer to publish it to TestFlight or export it.

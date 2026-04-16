# Mobile App

Flutter Android app lives here.

## Current direction

- Flutter owns onboarding, mocked server flows, session browsing, and review UI.
- Native Android owns the `AccessibilityService`, accessibility overlay bubble, screen inspection, screenshot capture, and fill actions.

## Local development

```bash
cd apps/mobile
flutter pub get
flutter run -d <android-device-or-emulator>
```

## First-run checklist

1. Launch the app.
2. Open the setup tab.
3. Enable the Open Bubble accessibility service in Android settings.
4. Return to the app and confirm the service is connected.
5. Show the bubble and background the app to verify the overlay stays alive.

## Code layout

- `lib/`: Flutter UI, mocked App Server flows, and the platform bridge.
- `android/app/src/main/kotlin/...`: Android accessibility service, overlay controller, and method/event channels.
- `android/app/src/main/res/xml/`: accessibility service metadata.

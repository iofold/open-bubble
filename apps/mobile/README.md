# Mobile App Placeholder

Flutter Android app lives here.

Do not add major implementation until the team confirms:

1. `docs/api/openapi.yaml`
2. `docs/api/events.md`
3. `docs/specs/mobile-flutter.md`

Suggested first command once Flutter is installed:

```bash
cd apps/mobile
flutter create --platforms=android --org dev.openbubble .
```

After that, keep Flutter UI code in `lib/` and native Android platform-channel code in `android/app/src/main/kotlin/...`.

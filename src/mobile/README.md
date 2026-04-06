# Mobile App

This folder contains the Expo React Native app that reuses the shared auth hooks and services from `src/shared`.

## Run

1. Install dependencies inside this folder.
2. Start Expo with `npm run start`.

## Notes

- `AuthProvider` and `useAuth` are shared with the web app.
- Storage is injected with `AsyncStorage` on mobile.
- The UI mirrors the screenshots for chat list, conversation view, profile, and auth screens.

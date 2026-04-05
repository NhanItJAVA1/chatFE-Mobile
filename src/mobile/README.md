# Mobile App Structure

This folder is reserved for React Native mobile app code.

## Getting Started

To set up the mobile app:

1. Create subdirectories here (screens, components, navigation, etc.)
2. Share code from `/shared` folder:
   ```javascript
   import { useAuth } from "../../shared/hooks";
   import { authService } from "../../shared/services";
   ```

## Recommended Structure

```
mobile/
├── screens/        # App screens/pages
├── components/     # Reusable components
├── navigation/     # Navigation setup
├── styles/         # Mobile styling
├── services/       # Mobile-specific services
└── App.js
```

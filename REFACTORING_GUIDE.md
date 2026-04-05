# Refactored Folder Structure - Web & Mobile Support

## Overview

The source code has been refactored to support both **Web** and **Mobile** platforms by extracting shared code into a dedicated `shared` folder. This separation follows the **Monorepo Folder Strategy**.

## New Structure

```
src/
├── shared/                          # 📦 Shared code (Web + Mobile)
│   ├── hooks/                       # Custom React hooks
│   │   ├── useAuth.js              # Authentication hook
│   │   ├── useFetch.js             # Data fetching hook
│   │   └── index.js                # Exports
│   ├── services/                    # API services & business logic
│   │   ├── api.js                  # Base API configuration
│   │   ├── authService.js          # Authentication service
│   │   ├── friendService.js        # Friends/relationships service
│   │   └── index.js                # Exports
│   ├── context/                     # Global state management
│   │   ├── AuthContext.jsx         # Auth state
│   │   ├── AppContext.jsx          # App state
│   │   └── index.js                # Exports
│   ├── constants/                   # Constants & enums
│   │   └── index.js
│   ├── utils/                       # Helper functions
│   │   ├── helpers.js              # Utility functions
│   │   └── index.js
│   └── index.js                     # Main shared exports
│
├── web/                             # 🌐 Web app code (React + Vite)
│   ├── components/                  # React components
│   │   ├── auth/
│   │   │   ├── LoginForm.jsx
│   │   │   ├── RegisterForm.jsx
│   │   │   └── index.js
│   │   ├── common/                 # Shared UI components
│   │   │   ├── PrivateRoute.jsx
│   │   │   └── index.js
│   │   ├── layout/
│   │   │   ├── Header.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── MainLayout.jsx
│   │   │   └── index.js
│   │   ├── search/
│   │   │   ├── SearchFriendForm.jsx
│   │   │   ├── UserSearchCard.jsx
│   │   │   └── index.js
│   │   ├── chat/
│   │   │   ├── ChatList.jsx
│   │   │   └── index.js
│   │   ├── contacts/
│   │   │   ├── Contacts.jsx
│   │   │   └── index.js
│   │   └── index.js
│   ├── pages/                       # Page components
│   │   ├── LoginPage.jsx
│   │   ├── RegisterPage.jsx
│   │   ├── HomePage.jsx
│   │   ├── SearchFriendsPage.jsx
│   │   ├── FriendsPage.jsx
│   │   ├── FriendRequestsPage.jsx
│   │   └── index.js
│   ├── styles/
│   │   └── globals.css             # Tailwind & global styles
│   └── components/index.js
│
├── mobile/                          # 📱 Mobile app code (React Native)
│   ├── screens/                     # Native screens
│   ├── components/                  # Native components
│   ├── navigation/                  # React Navigation setup
│   ├── services/                    # Mobile-specific services
│   ├── README.md                    # Setup instructions
│   └── App.js                       # Entry point (when implemented)
│
├── App.jsx                          # Main app routing
├── main.jsx                         # Vite entry point
└── index.html
```

## Import Examples

### From Web Components

```javascript
// Import from shared services
import { useAuth } from "@shared/hooks";
import { authService, api } from "@shared/services";
import { formatDate } from "@shared/utils";

// Or using relative paths
import { useAuth } from "../../../shared/hooks";
```

### From Web Hooks/Context

```javascript
import { useAuth } from "@shared/hooks";
import { AuthProvider } from "@shared/context";
```

### For Mobile (in future)

```javascript
import { useAuth } from "../../shared/hooks";
import { authService } from "../../shared/services";
```

## What's Shared vs Web-Specific

### ✅ In `shared/` (Both Web & Mobile)

- ✓ API services (`api.js`, `authService.js`, `friendService.js`)
- ✓ Authentication hooks (`useAuth`)
- ✓ Global state (`AuthContext`, `AppContext`)
- ✓ Constants & enums
- ✓ Utility functions

### 🌐 In `web/` (Web Only)

- ✓ React components (LoginForm, Header, etc.)
- ✓ Page components (HomePage, LoginPage, etc.)
- ✓ Tailwind CSS styling
- ✓ Web-specific hooks & utilities

### 📱 In `mobile/` (Mobile Only - Future)

- React Native screens
- Native Navigation setup
- Mobile-specific UI components
- Mobile-specific services

## Adding New Features

### New Shared Service

Create in `src/shared/services/`:

```javascript
// src/shared/services/newService.js
export const myService = {
  getData: async () => {
    /* */
  },
};

// Update src/shared/services/index.js
export { myService } from "./newService";
```

### New Web Component

Create in `src/web/components/`:

```javascript
// src/web/components/newFolder/MyComponent.jsx
import { useAuth } from "../../../shared/hooks";

export const MyComponent = () => {
  /* */
};
```

### New Mobile Screen (Future)

Create in `src/mobile/screens/`:

```javascript
// src/mobile/screens/HomeScreen.jsx
import { useAuth } from "../../shared/hooks";

export const HomeScreen = () => {
  /* */
};
```

## Benefits of This Structure

✨ **Code Reusability** - Share logic between web and mobile  
🎯 **Clear Separation** - Easy to identify platform-specific code  
📚 **Maintainability** - Organized folder hierarchy  
🚀 **Scalability** - Easy to add new platforms (Vue, Angular, etc.)  
🔄 **DRY Principle** - Avoid code duplication

## Migration Complete ✅

All existing code has been migrated:

- ✅ Hooks moved to `shared/hooks/`
- ✅ Services moved to `shared/services/`
- ✅ Context moved to `shared/context/`
- ✅ Utils moved to `shared/utils/`
- ✅ Components moved to `web/components/`
- ✅ Pages moved to `web/pages/`
- ✅ Styles moved to `web/styles/`
- ✅ Imports updated in `App.jsx` and `main.jsx`

## Next Steps

To extend this for mobile:

1. Set up a React Native project in the `mobile/` folder
2. Import shared code using: `import { ... } from "../../shared/..."`
3. Create mobile-specific screens and components
4. Configure React Navigation for mobile routing

---

Happy coding! 🎉

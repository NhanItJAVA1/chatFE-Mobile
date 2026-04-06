# User Profile Feature Guide

## Overview

Implemented a complete user profile management feature that works seamlessly for both **Web (React)** and **Mobile (React Native)** platforms.

## Components Created & Modified

### 1. **userService.js** (New)

📍 Location: `FE/src/shared/services/userService.js`

Service that handles all user profile API interactions:

```javascript
import {
  getProfile,
  updateProfile,
  updateProfileFields,
  updateAvatar,
  updateDisplayName,
  updateBio,
  updatePassword,
  updatePrivacy,
  userService,
} from "@shared/services";
```

**Key Features:**

- Automatic localStorage sync after updates
- Only sends modified fields to backend
- Meaningful error handling
- Input validation

### 2. **UserProfileModal.jsx** (New)

📍 Location: `FE/src/web/components/common/UserProfileModal.jsx`

Modal component for viewing and editing user profile.

**Features:**

- ✅ View profile information
- ✅ Edit mode with pencil icon (✏️)
- ✅ Form validation
- ✅ Auto-save with loading state
- ✅ Dark mode support
- ✅ Close on Escape key or outside click
- ✅ Success/error messaging

**Props:**

```javascript
<UserProfileModal
  isOpen={boolean}           // Control modal visibility
  onClose={function}         // Callback when modal closes
  onSuccess={function}       // Callback after successful update
/>
```

### 3. **ProfileMenu.jsx** (Modified)

📍 Location: `FE/src/web/components/layout/ProfileMenu.jsx`

Updated to integrate UserProfileModal:

- "My Profile" menu item now opens the profile modal
- Added state management for modal visibility

## Usage Examples

### Example 1: Basic Profile Update

```javascript
import { updateProfile } from "@shared/services";

// Update multiple fields
await updateProfile({
  displayName: "New Name",
  bio: "My new bio",
  avatarUrl: "https://example.com/avatar.jpg",
});
```

### Example 2: Update Specific Field

```javascript
import { updateDisplayName, updateBio } from "@shared/services";

// Update only display name
await updateDisplayName("John Doe");

// Update only bio
await updateBio("Software Developer");
```

### Example 3: In a Component

```javascript
import { useState } from "react";
import { updateProfile } from "@shared/services";

export const MyComponent = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await updateProfile({
        displayName: "Updated Name",
        bio: "Updated bio",
      });
      // Success - component will auto-update via auth context
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleUpdate} disabled={loading}>
      {loading ? "Saving..." : "Update Profile"}
    </button>
  );
};
```

### Example 4: Mobile (React Native)

```javascript
// Same API works for mobile!
import { updateProfile } from "@shared/services";

const updateProfileHandler = async () => {
  try {
    await updateProfile({
      displayName: "Mobile User",
      bio: "Updated from mobile",
    });
    // Success
  } catch (err) {
    console.error("Update failed:", err.message);
  }
};
```

## Backend API Details

**Endpoint:** `PATCH /profile`

**Base URL:** `http://localhost:3000/v1`

**Authentication:** Required (Bearer token)

**Response:** `{ data: true }` on success

**Updatable Fields:**

- `displayName` - Display name
- `bio` - User bio/description
- `avatarUrl` - Avatar image URL
- `username` - Username
- `email` - Email address
- `phone` - Phone number
- `password` - Password (required for password change)
- `verified` - Verification info
- `privacy` - Privacy settings
- `settings` - User settings

## Data Flow

```
User clicks "My Profile" (3-dot menu)
        ↓
ProfileMenu opens
        ↓
User clicks "👤 My Profile"
        ↓
handleMenuItemClick('profile')
        ↓
showProfileModal = true
        ↓
UserProfileModal renders
        ↓
User clicks ✏️ (pencil) to edit
        ↓
isEditing state changes to true
        ↓
Form inputs become editable
        ↓
User modifies fields and clicks "Save Changes"
        ↓
updateProfile(changedFields) called
        ↓
API PATCH /profile request sent
        ↓
Backend validates and updates database
        ↓
localStorage updated with new data
        ↓
Auth context updates
        ↓
UI refreshes automatically
        ↓
Success message shown
```

## Files Modified/Created

| File                                                | Type     | Changes                             |
| --------------------------------------------------- | -------- | ----------------------------------- |
| `FE/src/shared/services/userService.js`             | Created  | Core service for profile management |
| `FE/src/shared/services/index.js`                   | Modified | Added userService exports           |
| `FE/src/web/components/common/UserProfileModal.jsx` | Created  | Profile view/edit modal             |
| `FE/src/web/components/common/index.js`             | Modified | Added modal export                  |
| `FE/src/web/components/layout/ProfileMenu.jsx`      | Modified | Integrated profile modal            |

## Testing Checklist

- [ ] Click "My Profile" from the 3-dot menu
- [ ] Modal displays current user information
- [ ] Click pencil (✏️) icon to enter edit mode
- [ ] Modify a field (e.g., display name)
- [ ] Click "Save Changes"
- [ ] Verify success message appears
- [ ] Check that changes persist after page reload
- [ ] Test with dark mode enabled
- [ ] Test closing modal with Escape key
- [ ] Test closing modal with outside click
- [ ] Test error handling (invalid email, etc.)

## Future Enhancements

1. **Avatar Upload** - Replace URL input with file upload
2. **Avatar Crop** - Add image crop functionality
3. **Email/Phone Verification** - Add verification flow
4. **Privacy Settings UI** - Dedicated privacy settings section
5. **Password Change Modal** - Separate modal for password change
6. **Mobile Optimization** - Touch/swipe optimizations
7. **Undo Changes** - Allow undoing edits before save
8. **Profile Preview** - Show how profile looks to others
9. **Activity Log** - Show profile update history
10. **Batch Updates** - Support for updating multiple profiles (admin)

## Notes

- Service automatically filters out undefined/null values
- localStorage is synced immediately after successful API call
- Modal closes automatically on Escape or outside click
- All fields are optional except those required by backend validation
- Error messages from backend are passed through to UI
- Component works for both web and mobile without modification

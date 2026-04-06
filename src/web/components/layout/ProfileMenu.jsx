import { useAuth } from "../../../shared/hooks";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";

export const ProfileMenu = ({ onClose, onOpenProfile }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const menuRef = useRef(null);

  const handleMenuItemClick = (itemId) => {
    if (itemId === "profile") {
      onOpenProfile?.();
    } else {
      // Handle other menu items as needed
      onClose();
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const menuItems = [
    { label: "😊 Set Emoji Status", id: "emoji" },
    { label: "👤 My Profile", id: "profile" },
    { label: "💰 Wallet", id: "wallet" },
    { label: "👥 New Group", id: "group" },
    { label: "📢 New Channel", id: "channel" },
    { label: "👫 Contacts", id: "contacts" },
    { label: "☎️ Calls", id: "calls" },
    { label: "🔖 Saved Messages", id: "saved" },
    { label: "⚙️ Settings", id: "settings" },
  ];

  return (
    <>
      <div
        ref={menuRef}
        className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-lg dark:shadow-xl border dark:border-slate-700 overflow-hidden z-50"
      >
        {/* User Profile Header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-blue-600 font-bold text-lg shadow-md">
              {user?.displayName?.charAt(0) || "U"}
            </div>
            <div>
              <p className="font-semibold text-white">{user?.displayName || "User"}</p>
              <p className="text-xs text-blue-100">Online</p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-200 dark:bg-slate-700" />

        {/* Menu Items */}
        <div className="max-h-96 overflow-y-auto">
          {menuItems.map((item, index) => (
            <div key={item.id}>
              <button
                onClick={() => handleMenuItemClick(item.id)}
                className="w-full text-left px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition flex items-center gap-3 text-sm"
              >
                {item.label}
              </button>
              {index === 7 && <div className="h-px bg-gray-200 dark:bg-slate-700" />}
            </div>
          ))}
        </div>

        {/* Logout Button */}
        <div className="border-t dark:border-slate-700 p-2">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm font-medium transition"
          >
            🚪 Logout
          </button>
        </div>
      </div>
    </>
  );
};

import { useAuth } from "../../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export const Sidebar = ({ isOpen, onClose, activeView, onViewChange, darkMode, onToggleDarkMode }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const menuItems = [
    { id: "chats", label: "All chats", icon: "💬" },
    { id: "contacts", label: "Contacts", icon: "👥" },
    { id: "calls", label: "Calls", icon: "☎️" },
    { id: "saved", label: "Saved Messages", icon: "🔖" },
  ];

  return (
    <>
      {/* Backdrop */}
      {isOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden" onClick={onClose} />}

      {/* Sidebar */}
      <div
        className={`fixed md:relative w-64 h-screen bg-white dark:bg-slate-800 border-r dark:border-slate-700 transform transition-transform duration-300 z-40 flex flex-col ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Profile Section */}
        <div className="p-4 border-b dark:border-slate-700">
          <div
            className="flex items-center gap-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 p-2 rounded-lg"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
          >
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
              {user?.displayName?.charAt(0) || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white truncate">{user?.displayName || "User"}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Set Emoji Status</p>
            </div>
            <span className="text-lg">▼</span>
          </div>

          {/* Profile Dropdown */}
          {showProfileMenu && (
            <div className="mt-2 bg-gray-50 dark:bg-slate-700 rounded-lg overflow-hidden">
              <button className="w-full text-left px-3 py-2 hover:bg-gray-200 dark:hover:bg-slate-600 text-sm text-gray-700 dark:text-gray-200">
                🔔 Notifications
              </button>
              <button className="w-full text-left px-3 py-2 hover:bg-gray-200 dark:hover:bg-slate-600 text-sm text-gray-700 dark:text-gray-200">
                ⚙️ Settings
              </button>
              <button className="w-full text-left px-3 py-2 hover:bg-gray-200 dark:hover:bg-slate-600 text-sm text-gray-700 dark:text-gray-200">
                🆘 Help
              </button>
              <hr className="dark:border-slate-600" />
              <button
                onClick={handleLogout}
                className="w-full text-left px-3 py-2 hover:bg-red-100 dark:hover:bg-red-900 text-sm text-red-600 dark:text-red-400"
              >
                🚪 Logout
              </button>
            </div>
          )}
        </div>

        {/* Menu Items */}
        <nav className="flex-1 overflow-y-auto">
          <div className="p-2 space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition ${
                  activeView === item.id
                    ? "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 font-semibold"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Bottom Section */}
        <div className="p-3 border-t dark:border-slate-700 space-y-2">
          <button
            onClick={onToggleDarkMode}
            className="w-full flex items-center justify-between px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
          >
            <span className="text-lg">🌙 Night Mode</span>
            <div className={`w-10 h-6 rounded-full transition ${darkMode ? "bg-blue-600" : "bg-gray-300"}`}>
              <div
                className={`w-5 h-5 bg-white rounded-full transform transition ${
                  darkMode ? "translate-x-5" : "translate-x-0.5 mt-0.5"
                }`}
              />
            </div>
          </button>

          <button className="w-full text-left px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
            ⚙️ Settings
          </button>
        </div>
      </div>
    </>
  );
};

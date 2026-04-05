import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { ChatList } from "../chat/ChatList";
import { Contacts } from "../contacts/Contacts";

export const MainLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState("chats"); // 'chats', 'contacts'
  const [darkMode, setDarkMode] = useState(false);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen bg-white dark:bg-slate-900">
        {/* Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeView={activeView}
          onViewChange={(view) => {
            setActiveView(view);
            setSidebarOpen(false);
          }}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
        />

        {/* Left Panel - Chat List or Contacts */}
        <div className="w-80 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900">
          {/* Content - ChatList or Contacts */}
          <div className="flex-1 overflow-hidden">
            {activeView === "chats" && <ChatList />}
            {activeView === "contacts" && <Contacts />}
          </div>
        </div>

        {/* Right Panel - Chat Area */}
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-800">
          {children || (
            <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
              <p>Select a chat to start messaging</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

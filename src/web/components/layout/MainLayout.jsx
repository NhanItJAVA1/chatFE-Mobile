import { useState } from "react";
import { ResizableChatPanel } from "./ResizableChatPanel";
import { ChatList } from "../chat/ChatList";
import { Contacts } from "../contacts/Contacts";

export const MainLayout = ({ children }) => {
  const [activeView, setActiveView] = useState("chats"); // 'chats', 'contacts'
  const [darkMode, setDarkMode] = useState(false);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen bg-white dark:bg-slate-900">
        {/* Resizable Left Panel - Chat List */}
        <ResizableChatPanel activeView={activeView} />

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

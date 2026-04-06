import { useState, useRef, useEffect } from "react";
import { ChatList } from "../chat/ChatList";
import { ProfileMenu } from "./ProfileMenu";
import { UserProfileModal } from "../common";

export const ResizableChatPanel = ({ activeView }) => {
  const [width, setWidth] = useState(320); // Default width in pixels
  const [isResizing, setIsResizing] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const panelRef = useRef(null);

  const minWidth = 200;
  const maxWidth = 500;

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;

      const newWidth = e.clientX;
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizing]);

  return (
    <div className="flex h-full relative">
      {/* Chat Panel */}
      <div
        ref={panelRef}
        style={{ width: `${width}px` }}
        className="flex flex-col bg-white dark:bg-slate-900 border-r dark:border-slate-700 relative"
      >
        {/* Header with Hamburger Menu */}
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-700 bg-white dark:bg-slate-900 relative">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Chats</h2>
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-400 text-xl"
              title="Menu"
            >
              ☰
            </button>
            {showProfileMenu && (
              <ProfileMenu
                onOpenProfile={() => {
                  setShowProfileModal(true);
                  setShowProfileMenu(false);
                }}
                onClose={() => setShowProfileMenu(false)}
              />
            )}
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-hidden">
          <ChatList />
        </div>
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={() => setIsResizing(true)}
        className="w-1 bg-gray-200 dark:bg-slate-700 hover:bg-blue-500 dark:hover:bg-blue-500 cursor-col-resize transition-colors"
      />

      {/* Profile Modal - Rendered outside ProfileMenu so it persists when menu closes */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onSuccess={() => {
          // Optional: Handle success callback
        }}
      />
    </div>
  );
};

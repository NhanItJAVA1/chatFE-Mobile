import { useState } from "react";

export const ChatList = () => {
  const [chats] = useState([
    {
      id: 1,
      avatar: "🔐",
      name: "Archived chats",
      message: "9 chats",
      time: "3:20 PM",
      unread: 9,
      archived: true,
    },
    {
      id: 4,
      avatar: "👤",
      name: "Phương IUH",
      message: "Sticker",
      time: "3/23/2026",
    },
  ]);

  return (
    <div className="flex flex-col h-full w-full border-r dark:border-slate-700 bg-white dark:bg-slate-900">
      {/* Search */}
      <div className="sticky top-0 p-3 bg-white dark:bg-slate-900 border-b dark:border-slate-700">
        <input
          type="text"
          placeholder="Search..."
          className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white rounded-full focus:outline-none placeholder-gray-500 dark:placeholder-gray-400 text-sm"
        />
      </div>

      {/* Chats List */}
      <div className="flex-1 overflow-y-auto">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className="flex items-center gap-3 px-3 py-3 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer border-b dark:border-slate-700 transition"
          >
            {/* Avatar */}
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xl flex-shrink-0">
              {chat.avatar}
            </div>

            {/* Chat Info */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{chat.name}</h3>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">{chat.time}</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{chat.message}</p>
            </div>

            {/* Unread Badge */}
            {chat.unread && (
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {chat.unread}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

import { useAuth } from "../../hooks/useAuth";

export const Header = ({ onMenuClick }) => {
  const { user } = useAuth();

  return (
    <header className="bg-white dark:bg-slate-800 border-b dark:border-slate-700 px-4 py-3 flex items-center justify-between md:justify-end gap-4 sticky top-0 z-20">
      {/* Mobile Menu Button */}
      <button
        onClick={onMenuClick}
        className="md:hidden text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Search Bar */}
      <div className="hidden md:flex flex-1 max-w-xs">
        <input
          type="text"
          placeholder="Search..."
          className="w-full px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 dark:placeholder-gray-400"
        />
      </div>

      {/* Right Icons */}
      <div className="flex items-center gap-3">
        {/* Search Button Mobile */}
        <button className="md:hidden text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </button>

        {/* Phone Button */}
        <button className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            />
          </svg>
        </button>

        {/* More Options */}
        <button className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
          </svg>
        </button>
      </div>
    </header>
  );
};

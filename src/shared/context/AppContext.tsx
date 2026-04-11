import { createContext, useState } from "react";
import type { User, AppContextType, AppProviderProps } from "@/types";

export const AppContext = createContext<AppContextType | null>(null);

export const AppProvider = ({ children }: AppProviderProps) => {
    const [user, setUser] = useState<User | null>(null);
    const [theme, setTheme] = useState<string>("light");

    const value: AppContextType = {
        user,
        setUser,
        theme,
        setTheme,
    };

    return (
        <AppContext.Provider value={value}>{children}</AppContext.Provider>
    );
};

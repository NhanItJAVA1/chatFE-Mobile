import React, { createContext, useContext, useState } from "react";
import { View } from "react-native";
import LottieView from "lottie-react-native";

const ExplosionContext = createContext<any>(null);
export const useExplosion = () => useContext(ExplosionContext);

export const EXPLOSION_EMOJI_ASSETS: Record<string, string> = {
  "❤️": "https://chatchitcnm.s3.ap-southeast-1.amazonaws.com/Heart-Detach.json",
};

interface ExplosionItem {
  id: number;
  emoji: string;
  top: number;
  left: number;
  isMine: boolean;
}

let idCounter = 0;

export const ExplosionProvider = ({ children }: any) => {
  const [explosions, setExplosions] = useState<ExplosionItem[]>([]);

  const triggerExplosion = (emoji: string, top: number, left: number, isMine: boolean) => {
    if (!EXPLOSION_EMOJI_ASSETS[emoji]) return;

    const id = idCounter++;

    setExplosions((prev) => [...prev, { id, emoji, top, left, isMine }]);
  };

  const removeExplosion = (id: number) => {
    setExplosions((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <ExplosionContext.Provider value={{ triggerExplosion }}>
      {children}

      {/* ✅ Global layer → KHÔNG block touch */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
        }}
      >
        {explosions.map((item) => (
          <LottieView
            key={item.id}
            source={{ uri: EXPLOSION_EMOJI_ASSETS[item.emoji] }}
            autoPlay
            loop={false}
            onAnimationFinish={() => removeExplosion(item.id)}
            style={{
              position: "absolute",
              width: 288,
              height: 288,
              top: item.top,
              left: item.left,
              transform: !item.isMine ? [{ scaleX: -1 }] : undefined,
            }}
          />
        ))}
      </View>
    </ExplosionContext.Provider>
  );
};

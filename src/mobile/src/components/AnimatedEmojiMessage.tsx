import React, { useEffect, useRef } from "react";
import { View, TouchableWithoutFeedback } from "react-native";
import LottieView from "lottie-react-native";
import { useExplosion } from "./ExplosionProvider";

export const JUMBO_EMOJI_ASSETS: Record<string, string> = {
  "😂": "https://chatchitcnm.s3.ap-southeast-1.amazonaws.com/Laugh.json",
  "😎": "https://chatchitcnm.s3.ap-southeast-1.amazonaws.com/Cool.json",
  "❤️": "https://chatchitcnm.s3.ap-southeast-1.amazonaws.com/Heart.json",
  "🔥": "https://chatchitcnm.s3.ap-southeast-1.amazonaws.com/Fire.json",
  "🥰": "https://chatchitcnm.s3.ap-southeast-1.amazonaws.com/HeartFace.json",
  "😍": "https://chatchitcnm.s3.ap-southeast-1.amazonaws.com/HeartEyes.json",
  "😔": "https://chatchitcnm.s3.ap-southeast-1.amazonaws.com/SadEmoji.json",
  "🤑": "https://chatchitcnm.s3.ap-southeast-1.amazonaws.com/Money.json",
  "👻": "https://chatchitcnm.s3.ap-southeast-1.amazonaws.com/Ghost.json",
};

interface Props {
  emoji: string;
  isMine?: boolean;
}

export const AnimatedEmojiMessage = ({ emoji, isMine = true }: Props) => {
  const containerRef = useRef<View>(null);
  const lottieRef = useRef<LottieView>(null);

  const { triggerExplosion } = useExplosion();

  // 🔒 lock animation
  const isPlayingRef = useRef(false);

  // 💥 giới hạn detach
  const detachCountRef = useRef(0);

  const EMOJI_SIZE = 96;
  const DETACH_SIZE = EMOJI_SIZE * 3;

  const playAnimation = () => {
    if (isPlayingRef.current) return;

    isPlayingRef.current = true;

    lottieRef.current?.reset();
    lottieRef.current?.play();

    triggerDetach();
  };

  const triggerDetach = () => {
    // if (detachCountRef.current >= 3) return;

    containerRef.current?.measure((x, y, width, height, pageX, pageY) => {
      const top = pageY + height / 2 - DETACH_SIZE / 2;
      const left = pageX + width - DETACH_SIZE;

      triggerExplosion(emoji, top, left, isMine);

      detachCountRef.current += 1;
    });
  };

  const handleTap = () => {
    playAnimation();
  };

  const assetUrl = JUMBO_EMOJI_ASSETS[emoji];
  if (!assetUrl) return null;

  return (
    <View
      ref={containerRef}
      style={{
        width: EMOJI_SIZE,
        height: EMOJI_SIZE,
        alignSelf: "flex-end",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <TouchableWithoutFeedback onPress={handleTap}>
        <LottieView
          ref={lottieRef}
          source={{ uri: assetUrl }}
          autoPlay={false}
          loop={false}
          style={{
            width: EMOJI_SIZE,
            height: EMOJI_SIZE,
          }}
          onAnimationFinish={() => {
            isPlayingRef.current = false; // 🔓 chỉ mở lại khi kết thúc
          }}
        />
      </TouchableWithoutFeedback>
    </View>
  );
};

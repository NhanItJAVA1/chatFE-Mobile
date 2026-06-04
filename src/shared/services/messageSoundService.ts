import { Audio } from "expo-av";

const messageSoundAsset = require("../sound/soundMessage.mp3");
const callSoundAsset = require("../sound/call.mp3");

let lastPlayedAt = 0;
let activeSound: Audio.Sound | null = null;

const playAssetOnce = async (asset: any): Promise<void> => {
    const { sound } = await Audio.Sound.createAsync(asset, { shouldPlay: true, volume: 1 });

    await new Promise<void>((resolve) => {
        sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
                sound.unloadAsync().catch(() => { });
                resolve();
            }
        });
    });
};

export const playIncomingMessageSound = async (): Promise<void> => {
    const now = Date.now();
    if (now - lastPlayedAt < 350) {
        return;
    }
    lastPlayedAt = now;

    try {
        if (activeSound) {
            await activeSound.unloadAsync().catch(() => { });
            activeSound = null;
        }

        const { sound } = await Audio.Sound.createAsync(
            messageSoundAsset,
            { shouldPlay: true, volume: 1 }
        );
        activeSound = sound;

        sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
                sound.unloadAsync().catch(() => { });
                if (activeSound === sound) {
                    activeSound = null;
                }
            }
        });
    } catch {
        // Notification sound is non-critical.
    }
};

export const playReminderDueSound = async (): Promise<void> => {
    try {
        await playAssetOnce(callSoundAsset);
        await playAssetOnce(callSoundAsset);
    } catch {
        // Reminder sound is non-critical.
    }
};

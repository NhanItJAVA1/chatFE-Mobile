import React from 'react';
import { Platform, Modal as RNModal } from 'react-native';

// Props giống với react-native-image-viewing
interface ImageViewerModalProps {
    images: { uri: string }[];
    imageIndex: number;
    visible: boolean;
    onRequestClose: () => void;
    swipeToCloseEnabled?: boolean;
    doubleTapToZoomEnabled?: boolean;
}

let NativeImageViewing: any = null;
if (Platform.OS !== 'web') {
    try {
        NativeImageViewing = require('react-native-image-viewing').default;
    } catch (e) {
        // fallback nếu chưa cài
        NativeImageViewing = null;
    }
}

const ImageViewerModal: React.FC<ImageViewerModalProps> = (props) => {
    if (Platform.OS === 'web') {
        const { images, imageIndex, visible, onRequestClose } = props;
        return (
            <RNModal
                visible={visible}
                onRequestClose={onRequestClose}
                transparent
            >
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    background: 'rgba(0,0,0,0.9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999
                }}>
                    <button
                        style={{ position: 'absolute', top: 20, right: 30, fontSize: 32, color: '#fff', background: 'none', border: 'none', cursor: 'pointer' }}
                        onClick={onRequestClose}
                    >×</button>
                    <img
                        src={images[imageIndex]?.uri}
                        alt=""
                        style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 8, boxShadow: '0 0 24px #000' }}
                    />
                </div>
            </RNModal>
        );
    }
    if (NativeImageViewing) {
        return <NativeImageViewing {...props} />;
    }
    return null;
};

export default ImageViewerModal;

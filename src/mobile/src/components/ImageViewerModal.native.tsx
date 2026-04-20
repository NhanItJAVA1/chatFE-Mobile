import React from 'react';
import type { FC } from 'react';
// Props giống với react-native-image-viewing
interface ImageViewerModalProps {
    images: { uri: string }[];
    imageIndex: number;
    visible: boolean;
    onRequestClose: () => void;
    swipeToCloseEnabled?: boolean;
    doubleTapToZoomEnabled?: boolean;
}
// Chỉ import native khi build mobile
const NativeImageViewing = require('react-native-image-viewing').default;
const ImageViewerModal: FC<ImageViewerModalProps> = (props) => {
    return <NativeImageViewing {...props} />;
};
export default ImageViewerModal;

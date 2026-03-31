import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

type AppOverlayCardProps = {
    visible: boolean;
    onClose: () => void;
    children: ReactNode;
    cardSize: 'nearby' | 'schedules' | 'planner';
    persistent?: boolean;
};

export const AppOverlayCard = ({
    visible,
    onClose,
    children,
    cardSize,
    persistent = false,
}: AppOverlayCardProps) => {
    if (!visible && !persistent) {
        return null;
    }

    return (
        <View
            style={[styles.overlay, !visible && persistent && styles.hiddenPersistentOverlay]}
            pointerEvents={visible ? 'auto' : 'none'}
        >
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={[styles.cardBase, cardSizeStyles[cardSize]]}>
                {children}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-start',
        paddingTop: 78,
        paddingHorizontal: 12,
        paddingBottom: 80,
        zIndex: 2000,
        elevation: 2000,
    },
    hiddenPersistentOverlay: {
        display: 'none',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.18)',
    },
    cardBase: {
        width: '100%',
        alignSelf: 'center',
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.82)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 28,
        elevation: 10,
    },
});

const cardSizeStyles = StyleSheet.create({
    nearby: {
        height: '72%',
        minHeight: 360,
        maxHeight: 560,
    },
    schedules: {
        height: '82%',
        minHeight: 420,
        maxHeight: 640,
    },
    planner: {
        height: '92%',
        minHeight: 480,
        maxHeight: 840,
    },
});

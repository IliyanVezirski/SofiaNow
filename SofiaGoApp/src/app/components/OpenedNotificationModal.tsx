import { Alert, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { OpenedNotification } from '../types';
import { extractDelayHighlight } from '../utils/notifications';
import { handleRemindAgainFromNotification } from '../../services/notifications';

type Props = {
    openedNotification: OpenedNotification | null;
    onClose: () => void;
    onShowRoute: (favoriteId: string | null | undefined) => void;
};

export function OpenedNotificationModal({ openedNotification, onClose, onShowRoute }: Props) {
    const notificationBodyParts = extractDelayHighlight(openedNotification?.body);

    return (
        <Modal
            transparent
            animationType="fade"
            visible={!!openedNotification}
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <View style={styles.notificationModalWrap}>
                <Pressable style={styles.notificationModalBackdrop} onPress={onClose} />
                <View style={styles.notificationModalCard}>
                    <View style={styles.notificationModalHeader}>
                        <Text style={styles.notificationModalEyebrow}>Известие</Text>
                        <TouchableOpacity style={styles.notificationModalClose} onPress={onClose}>
                            <Text style={styles.notificationModalCloseText}>Затвори</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.notificationModalTitle}>{openedNotification?.title}</Text>
                    <Text style={styles.notificationModalBody}>
                        {notificationBodyParts.before}
                        {notificationBodyParts.highlight ? (
                            <Text
                                style={[
                                    styles.notificationModalBody,
                                    notificationBodyParts.tone === 'late'
                                        ? styles.notificationModalBodyLate
                                        : styles.notificationModalBodyEarly,
                                ]}
                            >
                                {notificationBodyParts.highlight}
                            </Text>
                        ) : null}
                        {notificationBodyParts.after}
                    </Text>
                    {openedNotification?.canRemindAgain || openedNotification?.canShowRoute ? (
                        <View style={styles.notificationModalActions}>
                            {openedNotification?.canRemindAgain ? (
                                <TouchableOpacity
                                    style={styles.notificationModalAction}
                                    onPress={() => {
                                        const reminderData = openedNotification.reminderData;
                                        if (!reminderData) {
                                            return;
                                        }

                                        onClose();
                                        void handleRemindAgainFromNotification(reminderData).then((result) => {
                                            Alert.alert(result.ok ? 'Готово' : 'Грешка', result.message);
                                        }).catch(() => {
                                            Alert.alert('Грешка', 'Неуспешно подновяване на напомнянето.');
                                        });
                                    }}
                                >
                                    <Text style={styles.notificationModalActionText}>Напомни пак</Text>
                                </TouchableOpacity>
                            ) : null}
                            {openedNotification?.canShowRoute ? (
                                <TouchableOpacity
                                    style={styles.notificationModalAction}
                                    onPress={() => {
                                        const favoriteId = openedNotification.favoriteId;
                                        onClose();
                                        onShowRoute(favoriteId);
                                    }}
                                >
                                    <Text style={styles.notificationModalActionText}>Покажи маршрута</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    ) : null}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    notificationModalWrap: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    notificationModalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.36)',
    },
    notificationModalCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
        elevation: 16,
    },
    notificationModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    notificationModalEyebrow: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0F766E',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    notificationModalClose: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: '#F1F5F9',
    },
    notificationModalCloseText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#475569',
    },
    notificationModalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 10,
    },
    notificationModalBody: {
        fontSize: 15,
        lineHeight: 22,
        color: '#334155',
    },
    notificationModalBodyLate: {
        color: '#DC2626',
        fontWeight: '800',
    },
    notificationModalBodyEarly: {
        color: '#2563EB',
        fontWeight: '800',
    },
    notificationModalActions: {
        marginTop: 16,
        gap: 10,
    },
    notificationModalAction: {
        borderRadius: 14,
        backgroundColor: '#0F766E',
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    notificationModalActionText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#FFFFFF',
    },
});

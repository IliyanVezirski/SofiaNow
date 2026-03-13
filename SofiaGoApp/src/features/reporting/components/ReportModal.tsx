import React from 'react';
import { View, Text, Pressable, TouchableOpacity, Modal, StyleSheet } from 'react-native';

interface Props {
    visible: boolean;
    onClose: () => void;
}

export const ReportModal: React.FC<Props> = ({ visible, onClose }) => (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
        <View style={styles.overlay}>
            <View style={styles.content}>
                <Text style={styles.title}>Какво искате да репортнете?</Text>
                <View style={styles.options}>
                    <TouchableOpacity style={styles.option} onPress={onClose}>
                        <View style={[styles.optionIcon, { backgroundColor: '#E63946' }]}>
                            <Text style={styles.iconLarge}>{'\uD83D\uDC6E'}</Text>
                        </View>
                        <Text style={styles.optionLabel}>Контрола</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.option} onPress={onClose}>
                        <View style={[styles.optionIcon, { backgroundColor: '#F4A261' }]}>
                            <Text style={styles.iconLarge}>{'\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66'}</Text>
                        </View>
                        <Text style={styles.optionLabel}>Претъпкано</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.option} onPress={onClose}>
                        <View style={[styles.optionIcon, { backgroundColor: '#2A9D8F' }]}>
                            <Text style={styles.iconLarge}>{'\u23F3'}</Text>
                        </View>
                        <Text style={styles.optionLabel}>Закъснение</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.option} onPress={onClose}>
                        <View style={[styles.optionIcon, { backgroundColor: '#264653' }]}>
                            <Text style={styles.iconLarge}>{'\u26A0\uFE0F'}</Text>
                        </View>
                        <Text style={styles.optionLabel}>Опасност</Text>
                    </TouchableOpacity>
                </View>
                <Pressable style={styles.closeBtn} onPress={onClose}>
                    <Text style={styles.closeText}>Затвори</Text>
                </Pressable>
            </View>
        </View>
    </Modal>
);

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    content: { backgroundColor: 'white', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, alignItems: 'center' },
    title: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, color: '#264653' },
    options: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%', marginBottom: 20 },
    option: { width: '45%', alignItems: 'center', marginBottom: 20 },
    optionIcon: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    iconLarge: { fontSize: 28 },
    optionLabel: { fontSize: 14, fontWeight: '600', color: '#264653' },
    closeBtn: { marginTop: 10, padding: 10 },
    closeText: { color: '#E63946', fontWeight: 'bold', fontSize: 16 },
});

import React from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface Props {
    visible: boolean;
    onClose: () => void;
}

export type PrivacySection = {
    icon: 'location-outline' | 'chatbox-outline' | 'notifications-outline' | 'server-outline' | 'storefront-outline' | 'save-outline' | 'shield-checkmark-outline';
    title: string;
    body: string;
    link?: { url: string; label: string };
};

export const PRIVACY_SECTIONS: PrivacySection[] = [
    {
        icon: 'location-outline',
        title: 'Местоположение',
        body: 'Приложението използва GPS за показване на твоята позиция на картата, намиране на близки спирки и паркинги и определяне на паркинговата зона, в която се намираш. Местоположението се обработва само на устройството и не се изпраща към наши сървъри.',
    },
    {
        icon: 'chatbox-outline',
        title: 'SMS (само Android)',
        body: 'За функцията "Паркинг SMS" приложението може да изпраща SMS-и към номерата на Центъра за градска мобилност (1302, 1303) за активиране на платено паркиране. Изпращането става само след изрично потвърждение от потребителя. Не се изпращат SMS-и към трети страни.',
    },
    {
        icon: 'notifications-outline',
        title: 'Известия',
        body: 'Приложението изпраща локални известия за напомняне кога наближава избраният автобус или трамвай. Известията се генерират на устройството въз основа на зададени от теб напомняния. Не се ползва Firebase за персонализирани известия.',
    },
    {
        icon: 'server-outline',
        title: 'Данни за транспорта',
        body: 'Информацията за маршрути, спирки и разписания се зарежда от публичния API на Центъра за градска мобилност — София. Приложението не събира и не съхранява твои лични данни на отдалечени сървъри.',
    },
    {
        icon: 'storefront-outline',
        title: 'Реклами',
        body: 'Приложението показва реклами чрез Google AdMob. AdMob може да събира анонимна информация за устройството за целите на рекламния таргетинг съгласно политиката на Google.',
        link: { url: 'https://policies.google.com/privacy', label: 'Политика за поверителност на Google' },
    },
    {
        icon: 'save-outline',
        title: 'Локално съхранение',
        body: 'Любими места, настройки и напомняния се съхраняват само на твоето устройство (AsyncStorage). Не се качват в облак. При деинсталиране на приложението всички данни се изтриват.',
    },
    {
        icon: 'shield-checkmark-outline',
        title: 'Деца',
        body: 'Приложението не е насочено към деца под 13 години и не събира съзнателно лична информация от деца.',
    },
];

export const PrivacyPolicyModal: React.FC<Props> = ({ visible, onClose }) => (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
        <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={styles.sheet}>
                <View style={styles.handle} />
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Ionicons name="shield-checkmark-outline" size={18} color="#0D9488" />
                        <Text style={styles.title}>Поверителност</Text>
                    </View>
                    <Pressable onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={16} color="#334155" />
                    </Pressable>
                </View>

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={styles.intro}>
                        SofiaNow е приложение за градска мобилност в София, което комбинира градски транспорт, паркиране, паркинг зони, карта и полезни функции за придвижване в града. Тази страница описва какви данни използва приложението, с каква цел и как се обработват.
                    </Text>

                    {PRIVACY_SECTIONS.map((section) => (
                        <View key={section.title} style={styles.sectionCard}>
                            <View style={styles.sectionHeader}>
                                <View style={styles.iconBadge}>
                                    <Ionicons name={section.icon} size={15} color="#0D9488" />
                                </View>
                                <Text style={styles.sectionTitle}>{section.title}</Text>
                            </View>
                            <Text style={styles.sectionBody}>{section.body}</Text>
                            {section.link && (
                                <TouchableOpacity onPress={() => Linking.openURL(section.link!.url).catch(() => {})}>
                                    <Text style={styles.sectionLink}>{section.link.label} ↗</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}

                    <View style={styles.contactCard}>
                        <Text style={styles.contactTitle}>Контакт</Text>
                        <Text style={styles.contactBody}>
                            При въпроси относно поверителността можеш да се свържеш с нас на:
                        </Text>
                        <TouchableOpacity onPress={() => Linking.openURL('mailto:ilian.vezirski@gmail.com').catch(() => {})}>
                            <Text style={styles.contactEmail}>ilian.vezirski@gmail.com</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.footer}>Последна актуализация: март 2026 г.</Text>
                </ScrollView>
            </View>
        </View>
    </Modal>
);

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15,23,42,0.3)',
    },
    sheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '90%',
        paddingBottom: 32,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#CBD5E1',
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 4,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(226,232,240,0.72)',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(248,250,252,0.68)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scroll: { flex: 1 },
    scrollContent: {
        paddingHorizontal: 18,
        paddingTop: 14,
        paddingBottom: 8,
        gap: 10,
    },
    intro: {
        fontSize: 13,
        lineHeight: 20,
        color: '#475569',
        fontWeight: '500',
        marginBottom: 4,
    },
    sectionCard: {
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        gap: 6,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    iconBadge: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: 'rgba(13,148,136,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
    },
    sectionBody: {
        fontSize: 12,
        lineHeight: 18,
        color: '#475569',
        fontWeight: '500',
    },
    sectionLink: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0D9488',
        marginTop: 2,
    },
    contactCard: {
        backgroundColor: 'rgba(239,246,255,0.8)',
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(191,219,254,0.72)',
        gap: 4,
    },
    contactTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1D4ED8',
    },
    contactBody: {
        fontSize: 12,
        lineHeight: 18,
        color: '#475569',
        fontWeight: '500',
    },
    contactEmail: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1D4ED8',
        marginTop: 2,
    },
    footer: {
        fontSize: 11,
        color: '#94A3B8',
        textAlign: 'center',
        marginTop: 4,
        fontWeight: '500',
    },
});

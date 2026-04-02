import React, { useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PRIVACY_SECTIONS } from './PrivacyPolicyModal';

type SettingsInfoLink = {
    label: string;
    url: string;
};

type SettingsInfoSection = {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    title: string;
    body: string;
    links?: SettingsInfoLink[];
};

const ABOUT_SECTIONS: SettingsInfoSection[] = [
    {
        icon: 'information-circle-outline',
        title: 'За Sofia Go',
        body: 'Sofia Go е независимо информационно приложение за придвижване и паркиране в София. То не е официално приложение на Центъра за градска мобилност, София Трафик, Столична община, Google, OpenStreetMap или други външни доставчици на данни.',
    },
    {
        icon: 'bus-outline',
        title: 'Източници за транспорт',
        body: 'Информацията за линии, спирки, превозни средства в реално време, виртуални табла и планиране на маршрути използва публични транспортни източници за София, включително Sofia Traffic / ЦГМ и bundled GTFS данни, подготвени за приложението.',
        links: [
            {
                label: 'Sofia Traffic / публичен транспорт',
                url: 'https://www.sofiatraffic.bg/bg/public-transport',
            },
        ],
    },
    {
        icon: 'map-outline',
        title: 'Карта и адресно търсене',
        body: 'Картовият изглед в приложението използва Google Maps SDK. За част от адресното търсене и геокодирането приложението използва Nominatim и OpenStreetMap.',
        links: [
            {
                label: 'Google Maps Platform',
                url: 'https://mapsplatform.google.com/',
            },
            {
                label: 'OpenStreetMap',
                url: 'https://www.openstreetmap.org/copyright',
            },
            {
                label: 'Nominatim Usage Policy',
                url: 'https://operations.osmfoundation.org/policies/nominatim/',
            },
        ],
    },
    {
        icon: 'car-outline',
        title: 'Паркинги, зони и SMS паркиране',
        body: 'Данните за синя и зелена зона са съобразени с публична информация на Столична община. Данните за наличност на част от паркингите се зареждат от Sofia Traffic, а каталогът на паркинги използва публични OpenStreetMap и Overpass източници. Номерата за SMS паркиране са съобразени с официалната информация за зоните.',
        links: [
            {
                label: 'Столична община - паркиране',
                url: 'https://www.sofia.bg/w/parkira-1',
            },
            {
                label: 'OpenStreetMap Overpass',
                url: 'https://overpass-api.de/',
            },
        ],
    },
    {
        icon: 'alert-circle-outline',
        title: 'Важно уточнение',
        body: 'Информацията в приложението има информативен характер. Възможни са временни разлики, закъснения или промени в разписанията, зоните и наличността на паркинги. Приоритет имат официалните табла, пътните знаци, маркировката на място и официалните страници на съответните институции.',
    },
];

interface Props {
    visible: boolean;
    onClose: () => void;
    parkingZonesEnabled: boolean;
    parkingZonesDataReady: boolean;
    parkingZoneFeatureCount: number;
    parkingZoneUserLabel: string | null;
    parkingZonePinLabel: string | null;
    parkingZonesGuidance: string;
    onToggleParkingZones: () => void;
}

export const SettingsModal: React.FC<Props> = ({
    visible,
    onClose,
    parkingZonesEnabled,
    parkingZonesDataReady,
    parkingZoneFeatureCount,
    parkingZoneUserLabel,
    parkingZonePinLabel,
    parkingZonesGuidance,
    onToggleParkingZones,
}) => {
    const [privacyExpanded, setPrivacyExpanded] = useState(false);
    const [aboutExpanded, setAboutExpanded] = useState(false);
    const { height } = useWindowDimensions();
    const overlayTopPadding = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 56) + 22 : 78;
    const overlayBottomPadding = Math.min(Math.max(height * 0.08, 32), 80);
    const cardMaxHeight = Math.min(Math.max(height * 0.66, 420), 680);
    const openExternalLink = (url: string) => {
        void Linking.openURL(url).catch(() => {});
    };

    return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
        <View style={[styles.overlay, { paddingTop: overlayTopPadding, paddingBottom: overlayBottomPadding }]}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={[styles.card, { maxHeight: cardMaxHeight }]}>
                <View style={styles.header}>
                    <Text style={styles.title}>Настройки</Text>
                    <Pressable onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={16} color="#334155" />
                    </Pressable>
                </View>

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.section}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.settingCard}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingCopyWrap}>
                                <View style={styles.settingTitleRow}>
                                    <Ionicons name="map-outline" size={14} color="#1D4ED8" />
                                    <Text style={styles.settingTitle}>Синя и зелена зона</Text>
                                </View>
                                <Text style={styles.settingSubtitle}>Показва зоните върху картата и проверява текущата позиция.</Text>
                            </View>
                            <Switch
                                value={parkingZonesEnabled}
                                onValueChange={onToggleParkingZones}
                                trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                                thumbColor={parkingZonesEnabled ? '#2563EB' : '#F8FAFC'}
                            />
                        </View>
                    </View>

                    <View style={[styles.settingCard, privacyExpanded && styles.settingCardExpanded]}>
                        <TouchableOpacity style={styles.settingRow} onPress={() => setPrivacyExpanded((current) => !current)}>
                            <View style={styles.settingCopyWrap}>
                                <View style={styles.settingTitleRow}>
                                    <Ionicons name="shield-checkmark-outline" size={14} color="#0D9488" />
                                    <Text style={styles.settingTitle}>Политика за поверителност</Text>
                                </View>
                                <Text style={styles.settingSubtitle}>Информация за данните, GPS, SMS и реклами.</Text>
                            </View>
                            <Ionicons name={privacyExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#94A3B8" />
                        </TouchableOpacity>

                        {privacyExpanded ? (
                            <View style={styles.privacyContent}>
                                <Text style={styles.privacyIntro}>
                                    Sofia Go е приложение за градски транспорт и паркиране в София. Тук е описано какви данни използва приложението и как се обработват.
                                </Text>

                                {PRIVACY_SECTIONS.map((section) => {
                                    const sectionLink = section.link;

                                    return (
                                        <View key={section.title} style={styles.infoSectionCard}>
                                            <View style={styles.settingTitleRow}>
                                                <Ionicons name={section.icon} size={14} color="#0D9488" />
                                                <Text style={styles.privacySectionTitle}>{section.title}</Text>
                                            </View>
                                            <Text style={styles.privacySectionBody}>{section.body}</Text>
                                            {sectionLink ? (
                                                <TouchableOpacity onPress={() => openExternalLink(sectionLink.url)}>
                                                    <Text style={styles.privacySectionLink}>{sectionLink.label} ↗</Text>
                                                </TouchableOpacity>
                                            ) : null}
                                        </View>
                                    );
                                })}

                                <View style={styles.infoSectionCard}>
                                    <View style={styles.settingTitleRow}>
                                        <Ionicons name="mail-outline" size={14} color="#1D4ED8" />
                                        <Text style={styles.privacySectionTitle}>Контакт</Text>
                                    </View>
                                    <Text style={styles.privacySectionBody}>
                                        При въпроси относно поверителността можеш да се свържеш с нас на:
                                    </Text>
                                    <TouchableOpacity onPress={() => openExternalLink('mailto:ilian.vezirski@gmail.com')}>
                                        <Text style={styles.privacySectionLink}>ilian.vezirski@gmail.com</Text>
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.privacyFooter}>Последна актуализация: март 2026 г.</Text>
                            </View>
                        ) : null}
                    </View>

                    <View style={[styles.settingCard, aboutExpanded && styles.settingCardExpanded]}>
                        <TouchableOpacity style={styles.settingRow} onPress={() => setAboutExpanded((current) => !current)}>
                            <View style={styles.settingCopyWrap}>
                                <View style={styles.settingTitleRow}>
                                    <Ionicons name="information-circle-outline" size={14} color="#1D4ED8" />
                                    <Text style={styles.settingTitle}>За приложението</Text>
                                </View>
                                <Text style={styles.settingSubtitle}>Източници на информация, атрибуции и важни уточнения.</Text>
                            </View>
                            <Ionicons name={aboutExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#94A3B8" />
                        </TouchableOpacity>

                        {aboutExpanded ? (
                            <View style={styles.privacyContent}>
                                <Text style={styles.privacyIntro}>
                                    Тази секция описва откъде идва информацията в приложението и какви публични източници се използват.
                                </Text>

                                {ABOUT_SECTIONS.map((section) => (
                                    <View key={section.title} style={styles.infoSectionCard}>
                                        <View style={styles.settingTitleRow}>
                                            <Ionicons name={section.icon} size={14} color="#1D4ED8" />
                                            <Text style={styles.privacySectionTitle}>{section.title}</Text>
                                        </View>
                                        <Text style={styles.privacySectionBody}>{section.body}</Text>
                                        {section.links?.map((link) => (
                                            <TouchableOpacity key={link.url} onPress={() => openExternalLink(link.url)}>
                                                <Text style={styles.privacySectionLink}>{link.label} ↗</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                ))}

                                <View style={styles.infoSectionCard}>
                                    <View style={styles.settingTitleRow}>
                                        <Ionicons name="mail-outline" size={14} color="#1D4ED8" />
                                        <Text style={styles.privacySectionTitle}>Контакт</Text>
                                    </View>
                                    <Text style={styles.privacySectionBody}>
                                        При въпроси за приложението или използваните източници можеш да се свържеш с нас на:
                                    </Text>
                                    <TouchableOpacity onPress={() => openExternalLink('mailto:ilian.vezirski@gmail.com')}>
                                        <Text style={styles.privacySectionLink}>ilian.vezirski@gmail.com</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : null}
                    </View>

                </ScrollView>
            </View>
        </View>
    </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-start',
        paddingHorizontal: 12,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15,23,42,0.18)',
    },
    card: {
        width: '100%',
        alignSelf: 'center',
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.82)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        padding: 16,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 28,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
        gap: 10,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
        flex: 1,
        minWidth: 0,
    },
    scroll: {
        flexGrow: 0,
    },
    section: {
        gap: 12,
        paddingBottom: 4,
    },
    settingCard: {
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
    },
    settingCardExpanded: {
        gap: 12,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    settingCopyWrap: {
        flex: 1,
    },
    settingTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
    },
    settingTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0F172A',
    },
    settingSubtitle: {
        marginTop: 4,
        fontSize: 12,
        lineHeight: 18,
        color: '#475569',
        fontWeight: '600',
    },
    privacyContent: {
        gap: 10,
        paddingTop: 2,
        borderTopWidth: 1,
        borderTopColor: 'rgba(226,232,240,0.72)',
    },
    privacyIntro: {
        fontSize: 12,
        lineHeight: 18,
        color: '#475569',
        fontWeight: '600',
    },
    privacySectionCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        gap: 6,
    },
    privacySectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
    },
    privacySectionBody: {
        fontSize: 12,
        lineHeight: 18,
        color: '#475569',
        fontWeight: '500',
    },
    infoSectionCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        gap: 6,
    },
    privacySectionLink: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0D9488',
    },
    privacyFooter: {
        fontSize: 11,
        color: '#94A3B8',
        textAlign: 'center',
        fontWeight: '500',
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
        flexShrink: 0,
    },

});

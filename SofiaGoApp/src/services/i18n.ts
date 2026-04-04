import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';

const translations = {
    bg: {
        welcome: 'Добре дошли в SofiaNow',
        map: 'Карта',
        reports: 'Сигнали',
        settings: 'Настройки',
        premium: 'Стани Premium',
        nightMode: 'Нощен режим',
        metroGuide: 'Метро Гид',
    },
    en: {
        welcome: 'Welcome to SofiaNow',
        map: 'Map',
        reports: 'Reports',
        settings: 'Settings',
        premium: 'Get Premium',
        nightMode: 'Night Mode',
        metroGuide: 'Metro Guide',
    },
};

export const i18n = new I18n(translations);

i18n.locale = Localization.getLocales()[0]?.languageTag.startsWith('bg') ? 'bg' : 'en';
i18n.defaultLocale = 'bg';
i18n.enableFallback = true;

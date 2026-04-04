import type { Ionicons } from '@expo/vector-icons';

import type { EcoActionKey } from '../types';

export type EcoDatasetDefinition = {
    key: EcoActionKey;
    title: string;
    subtitle: string;
    description: string;
    icon: keyof typeof Ionicons.glyphMap;
    accentColor: string;
    sourceLabel: string;
    sourceUrl?: string;
    statusLabel: string;
    tags: string[];
    notes: string[];
    ctaLabel?: string;
    placeholder?: boolean;
};

export const ECO_DATASET_CATALOG: Record<EcoActionKey, EcoDatasetDefinition> = {
    parks: {
        key: 'parks',
        title: 'Паркове и градини',
        subtitle: 'Sofia Plan API dataset 235',
        description: 'Списък с парковете и градините от публичния устройствен dataset, който може да се отвори директно на картата и да се ползва за навигация.',
        icon: 'leaf-outline',
        accentColor: '#15803D',
        sourceLabel: 'api.sofiaplan.bg / dataset 235',
        sourceUrl: 'https://api.sofiaplan.bg/datasets/235',
        statusLabel: 'Активен слой',
        tags: ['Зелена система', 'Sofia Plan API', 'GeoJSON'],
        notes: [
            'Слоят се филтрира по текущия viewport, за да е по-лек на картата.',
            'Категориите паркове и локални градини се разграничават с различен зелен тон.',
        ],
        ctaLabel: 'Отвори източника',
    },
    bike: {
        key: 'bike',
        title: 'Веломрежа',
        subtitle: 'Велоалеи по Общия устройствен план от 2009 г.',
        description: 'Този набор ще ни позволи да добавим отделен велосипеден слой и по-късно да наслагваме маршрути, веловръзки и отсечки.',
        icon: 'bicycle-outline',
        accentColor: '#0F766E',
        sourceLabel: 'urbandata.sofia.bg / Bicycle Lanes From The 2009 Master Plan',
        sourceUrl: 'https://urbandata.sofia.bg/dataset/bicycle-lanes-from-the-2009-master-plan',
        statusLabel: 'Готово за интеграция',
        tags: ['Мобилност', 'Велоалеи', 'Публични данни'],
        notes: [
            'Подходящо е за отделен слой във вело/еко режим.',
            'После можем да добавим и визуално разграничение между основни и второстепенни отсечки.',
        ],
        ctaLabel: 'Отвори източника',
    },
    playgrounds: {
        key: 'playgrounds',
        title: 'Детски площадки',
        subtitle: 'Публичен набор с площадки в града',
        description: 'Дава ни база за семейно ориентиран слой с детски площадки и точки за бързо ориентиране в квартала.',
        icon: 'happy-outline',
        accentColor: '#EA580C',
        sourceLabel: 'urbandata.sofia.bg / Playgrounds',
        sourceUrl: 'https://urbandata.sofia.bg/dataset/playgrounds',
        statusLabel: 'Готово за интеграция',
        tags: ['Семейство', 'Градска среда', 'Публични данни'],
        notes: [
            'Подходящо е за слой с площадки и квартални точки на интерес.',
            'По-късно може да се комбинира с парковете за по-пълен семеен изглед.',
        ],
        ctaLabel: 'Отвори източника',
    },
    air: {
        key: 'air',
        title: 'Качество на въздуха',
        subtitle: 'Набор за въздуха от „Данните на София“',
        description: 'Това е добра основа за климатичен слой, през който да показваме станции, измервания или обобщени индикатори за качеството на въздуха.',
        icon: 'cloud-outline',
        accentColor: '#2563EB',
        sourceLabel: 'urbandata.sofia.bg / Air Quality',
        sourceUrl: 'https://urbandata.sofia.bg/dataset/air-quality',
        statusLabel: 'Готово за интеграция',
        tags: ['Климат', 'Въздух', 'Публични данни'],
        notes: [
            'Следващата стъпка тук е да уточним точния ресурс и начина на визуализация на картата.',
            'Може да се комбинира с heatmap, точки или квартални индикатори.',
        ],
        ctaLabel: 'Отвори източника',
    },
    containers: {
        key: 'containers',
        title: 'Контейнери',
        subtitle: 'Placeholder за разделно събиране и текстил',
        description: 'Слагаме отделен entry за контейнерите още сега, за да остане мястото му в еко режима готово за следващата итерация.',
        icon: 'trash-outline',
        accentColor: '#111827',
        sourceLabel: 'Предстои да добавим източник',
        statusLabel: 'Скоро',
        tags: ['Разделно събиране', 'Текстил', 'Placeholder'],
        notes: [
            'Иконата и мястото в долното меню вече са подготвени.',
            'При следващата стъпка можем да вържем реалните локации на контейнерите.',
        ],
        placeholder: true,
    },
};

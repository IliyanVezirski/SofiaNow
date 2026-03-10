export interface Stop {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
}

export const mockStops: Stop[] = [
    { id: 's1', name: 'СУ Св. Климент Охридски', latitude: 42.6934, longitude: 23.3346 },
    { id: 's2', name: 'пл. Орлов Мост', latitude: 42.6905, longitude: 23.3375 },
    { id: 's3', name: 'НДК', latitude: 42.6845, longitude: 23.3193 },
    { id: 's4', name: 'пл. Лъвов Мост', latitude: 42.7046, longitude: 23.3235 },
    { id: 's5', name: 'Метростанция Сердика', latitude: 42.6977, longitude: 23.3225 },
    { id: 's6', name: 'Хотел Хемус', latitude: 42.6788, longitude: 23.3204 },
    { id: 's7', name: 'Съдебна Палата', latitude: 42.6953, longitude: 23.3211 }
];

export const fetchStopsNearby = async (lat: number, lon: number): Promise<Stop[]> => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(mockStops);
        }, 500);
    });
};

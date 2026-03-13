# SofiaGoApp

SofiaGoApp е Expo/React Native приложение за градски транспорт в София с карта в реално време, превозни средства, спирки, ETA информация и trip planner.

## Основни функции

- Карта с **стандартен OpenStreetMap (OSM)** базов слой.
- Визуализация на превозни средства в реално време (автобус, трамвай, тролей, метро).
- Информация за спирки и очаквани времена (ETAs).
- Търсене на спирки и адреси.
- Любими локации и спирки.
- Trip planner екран с визуализация на маршрут.
- Докладване (reporting) и интеграции за монетизация (Ads/RevenueCat).

## Технологии

- Expo 55
- React Native 0.83
- TypeScript
- MapLibre React Native
- Leaflet (web вариант)
- Supabase (backend услуги)

## Изисквания

- Node.js 18+
- npm 9+
- Android Studio (за локален Android build/run)
- Xcode (за iOS на macOS)
- Expo/EAS акаунт за cloud build

## Инсталация

```bash
npm install
```

## Стартиране (Development)

### Mobile (Expo dev server)

```bash
npm run start
```

Полезни варианти:

```bash
npm run start -- --tunnel
npm run start -- --lan
npm run start -- --port 8082
```

### Android (native run)

```bash
npm run android
```

### iOS (native run)

```bash
npm run ios
```

### Web (Expo web)

```bash
npm run web
```

## Web static serving

Проектът включва custom web server в [scripts/webServer.js](scripts/webServer.js).

Пускане на сървъра:

```bash
npm run web:serve
```

По подразбиране слуша на порт `3000`. Може да се смени с променлива:

```bash
PORT=8080 npm run web:serve
```

На Windows PowerShell:

```powershell
$env:PORT='8080'; npm run web:serve
```

## EAS Build

Конфигурацията е в [eas.json](eas.json) с профили:

- `development` (internal, dev client, APK)
- `preview` (internal, APK)
- `production`

Примерни команди:

```bash
eas build --platform android --profile development
eas build --platform android --profile preview
eas build --platform android --profile production
```

## Environment променливи

Създай `.env` в root на проекта (или задай променливите през EAS/CI):

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Използват се в [src/services/supabase.ts](src/services/supabase.ts).

## Структура на проекта

Основната логика е организирана модулно по feature-и в [src/features](src/features):

- `map` - карта, camera/bounds hooks, map constants
- `vehicles` - данни, анимация и UI за превозни средства
- `stops` - спирки, ETAs, разписания
- `search` - търсене и резултати
- `favorites` - любими
- `routing` - геометрии и route overlay
- `tripPlanner` - trip overlay и свързана логика
- `reporting` - докладване

Екрани:

- [src/screens/MapScreen.tsx](src/screens/MapScreen.tsx) - mobile карта
- [src/screens/MapScreen.web.tsx](src/screens/MapScreen.web.tsx) - web карта
- [src/screens/TripPlannerScreen.tsx](src/screens/TripPlannerScreen.tsx)
- [src/screens/SchedulesScreen.tsx](src/screens/SchedulesScreen.tsx)

Сервизи и API интеграции са в [src/services](src/services).

## Данни

- Статични GTFS файлове: [gtfs_static](gtfs_static)
- Статични JSON ресурси: [src/data](src/data)

## Често срещани проблеми

### `Port 8081 is being used by another process`

Стартирай на друг порт:

```bash
npm run start -- --port 8082
```

### Tunnel/Ngrok проблеми

Провери статуса на ngrok: https://status.ngrok.com/

Ако tunnel не тръгне, пробвай:

```bash
npm run start -- --lan
```

## Скриптове

Дефинирани npm скриптове в [package.json](package.json):

- `npm run start`
- `npm run android`
- `npm run ios`
- `npm run web`
- `npm run web:serve`
- `npm run generate:schedule`

## License

Добави лиценз според нуждите на проекта (например MIT).

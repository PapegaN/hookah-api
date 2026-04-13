# hookah-api

Backend API для будущей системы управления кальянной. Репозиторий отвечает за бизнес-логику, HTTP-контракт и подготовку к работе с PostgreSQL.

## Технологии

- NestJS
- TypeScript strict mode
- REST API
- Swagger / OpenAPI
- class-validator
- Jest
- ESLint
- Prettier

## Базовая архитектура

На старте backend разбивается на доменные контуры, которые дальше будут расти отдельными модулями:

- `catalog` — бренды, линейки, вкусы и карточки табака;
- `inventory` — партии, остатки и движения;
- `orders` — заказы, позиции и жизненный цикл исполнения.

В текущем коммите уже есть типизированный bootstrap приложения, глобальные пайпы, версионирование API и `health` endpoint как первый инфраструктурный модуль.

## Команды

```bash
npm install
npm run start:dev
npm run build
npm run check
```

Swagger будет доступен по адресу `http://localhost:3000/api/docs`.

## Docker

Собрать и запустить только backend:

```bash
docker build -t hookah-api .
docker run --rm -p 3000:3000 -e PORT=3000 -e APP_ORIGIN=http://localhost:8080 -e DATABASE_URL=postgresql://hookah:hookah_local@host.docker.internal:5432/hookah hookah-api
```

Для совместного запуска с frontend и PostgreSQL используйте корневой `compose.yaml` в главном репозитории.

## Переменные окружения

Скопируйте значения из `.env.example` и настройте:

- `PORT`
- `APP_ORIGIN`
- `DATABASE_URL`

## Ближайшие шаги

- Подключить модуль конфигурации БД и слой доступа к данным.
- Добавить DTO и CRUD для каталога табака.
- Подготовить OpenAPI-контракт для генерации frontend-типов.

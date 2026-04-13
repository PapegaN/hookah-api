# hookah-api

Backend API для системы управления кальянной.

## Технологии

- NestJS
- TypeScript strict mode
- PostgreSQL через `pg`
- REST API
- Swagger / OpenAPI
- class-validator
- Jest
- ESLint
- Prettier

## Текущее состояние

- API работает в двух режимах: реальный PostgreSQL как основной источник данных и memory fallback для локальных сценариев без БД.
- Пользователи, справочники, заказы, апрув и история статусов читаются и пишутся в PostgreSQL.
- `health` endpoint показывает состояние подключения к базе.
- Административные endpoints `/settings/*` позволяют экспортировать JSON-выгрузки и импортировать backup.

## Команды

```bash
npm install
npm run start:dev
npm run build
npm run lint
```

Swagger доступен по адресу `http://localhost:3000/api/docs`.

## Docker

```bash
docker build -t hookah-api .
docker run --rm -p 3000:3000 -e PORT=3000 -e APP_ORIGIN=http://localhost:8080 -e DATABASE_URL=postgresql://hookah:hookah_local@host.docker.internal:5432/hookah hookah-api
```

Для совместного запуска с frontend и PostgreSQL используйте корневой `compose.yaml`.

## Переменные окружения

- `PORT`
- `APP_ORIGIN`
- `DATABASE_URL`

## Следующие шаги

- вынести SQL-операции в более узкие domain-repository слои;
- добавить audit trail для административных изменений и импорта backup;
- подготовить OpenAPI-контракт для последующей генерации frontend-типов.
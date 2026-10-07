# Flowra

Flowra — локальное desktop-приложение для визуальной сборки Telegram-ботов. Workflow создаётся в React Flow, хранится в SQLite и исполняется отдельным Node.js-процессом. Внешний backend, регистрация и облачная база не нужны.

## Возможности

- создание, поиск, открытие, дублирование и удаление проектов;
- проверка Telegram Bot Token через `getMe`;
- canvas с drag-and-drop, соединениями, zoom, pan, multi-select, copy/paste, duplicate, undo/redo и autosave;
- Telegram nodes для текста, фото, видео, audio, voice, документов, location, contact, poll, quiz и media group;
- inline/reply keyboards, URL buttons, conditions, switch, random, delay, variables, input и HTTP requests;
- локальные project assets с проверкой типа и размера, preview и безопасной очисткой неиспользуемых файлов;
- отдельный bot runtime с живой консолью stdout/stderr;
- хранение пользователей, сессий и переменных в SQLite;
- Users table с поиском, сортировкой, pagination и карточкой пользователя;
- сегменты и очередь Broadcast с сохранением прогресса, обработкой Telegram 429 и заблокировавших бота пользователей;
- standalone ZIP-экспорт для Node.js и Python без реального токена и пользовательской базы.

## Требования

- Node.js 22.5 или новее;
- npm 10 или новее;
- Telegram Bot Token от [@BotFather](https://t.me/BotFather).

Python нужен только для запуска Python-экспорта. Python runtime использует стандартную библиотеку и поддерживает Python 3.10+.

## Установка и запуск

```bash
npm install
npm run dev
```

Production-сборка без упаковщика:

```bash
npm run build
npm start
```

Windows installer:

```bash
npm run dist
```

Артефакты electron-builder появятся в `release/`.

## Проверки

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Структура

```text
src/
  main/                 Electron window, IPC, assets, processes, broadcast
  renderer/             React UI, Dashboard, editor, Users, Broadcast, console
  shared/               Workflow types, node registry, variables, validation
  database/             SQLite schema and migrations
  bot/
    handlers/           Runtime handlers grouped by responsibility
    engine.ts           Workflow traversal
    runner.ts           Telegram long-polling process
    telegram.ts         Telegram Bot API transport
  exporter/
    exportService.ts    ZIP and Node.js export
    python/             Python runtime generator
  tests/                Unit and integration tests
```

Runtime data is stored under Electron `userData`:

```text
Flowra/
  flowra.sqlite
  projects/
    <project-id>/
      assets/
```

## Telegram Bot Token

При создании проекта Flowra вызывает Telegram `getMe`. Неверный токен или сетевая ошибка отображаются до создания проекта. Токен хранится только в локальной SQLite-базе, не входит в workflow, не возвращается renderer-процессу, не печатается в console и не попадает в ZIP.

Для запуска двух копий одного бота остановите другие процессы long polling: Telegram разрешает только одного активного poller для одного token.

## Visual workflow

Перетащите блок из левой панели на canvas, соедините output с input и настройте свойства справа. Начальный проект содержит `Start → Send Message`. Изменения сохраняются автоматически.

Доступные trigger nodes:

- Start;
- Command;
- Message;
- Callback.

Исполняемые nodes:

- Send Message, Photo, Video, Audio, Voice, Document;
- Send Location, Contact, Poll, Quiz, Media Group;
- Edit Message, Delete Message;
- Inline Buttons, Reply Keyboard, URL Button;
- Condition, Switch, Delay, Random;
- Variable, Set Variable, Get Variable;
- Input: text, number, contact, location;
- HTTP Request: GET, POST, PUT, PATCH, DELETE.

Variables поддерживают `{{user.first_name}}`, `{{user.last_name}}`, `{{user.username}}`, `{{user.id}}`, `{{chat.id}}`, `{{variable.name}}` и сокращение `{{name}}`.

## Assets

Кнопка «Выбрать файл» открывает native Electron dialog. Выбранный файл проверяется централизованными media rules, получает уникальное имя и копируется в `projects/<project-id>/assets/`. Workflow хранит только относительный путь `assets/...`.

Удаление ссылки из node не удаляет файл. Внизу панели Blocks есть «Очистить assets»: Flowra сначала вычисляет все ссылки в текущем workflow и удаляет только файлы, которые нигде не используются.

## Users и variables

Каждое входящее событие обновляет пользователя по уникальной паре `project_id + telegram_user_id`. SQLite хранит профиль, chat ID, даты, счётчик сообщений, текущий node, input-сессию и пользовательские variables. Повторный `/start` не создаёт duplicate.

Users поддерживает поиск, сортировку и pagination. Клик по строке показывает профиль и все persistent variables.

## Broadcast

Доступны text, photo, video, document, audio и voice. Получатели выбираются по одному или нескольким фильтрам:

- username exists/missing;
- language code;
- first start и last activity;
- variable exists/equals/contains.

Перед запуском показывается количество получателей и системное подтверждение. Очередь отправляет сообщения последовательно с ограничением скорости, повторяет запрос после Telegram 429 с учётом `retry_after`, продолжает работу после ошибки отдельного пользователя и записывает `sent`/`failed` для каждого recipient. Ответ 403 помечает пользователя заблокировавшим бота. Активную рассылку можно остановить.

## Экспорт Node.js

ZIP содержит:

```text
index.js
workflow.json
assets/
runtime/
package.json
.env.example
.gitignore
README.md
```

После распаковки:

```bash
copy .env.example .env
npm start
```

Node.js export использует встроенный `node:sqlite`, поэтому dependencies и `node_modules` не экспортируются.

## Экспорт Python

ZIP содержит `index.py`, `workflow.json`, используемые assets, `requirements.txt`, `.env.example`, `.gitignore` и README.

```bash
copy .env.example .env
python index.py
```

Экспортированный runtime создаёт собственную `data.sqlite` при первом запуске. Desktop users и broadcasts не экспортируются. Broadcast остаётся административной функцией desktop-приложения, а не фиктивной частью standalone bot.

## SQLite migrations

Таблица `schema_migrations` применяется транзакционно. Первая migration создаёт:

- `projects`;
- `settings`;
- `users`;
- `user_variables`;
- `user_sessions`;
- `interactions`;
- `broadcasts`;
- `broadcast_recipients`;
- `assets`;
- индексы для project, activity, dates, variables и broadcast queue.

Существующая база не удаляется при обновлении приложения.

## Troubleshooting

### Token invalid

Создайте новый token через BotFather и убедитесь, что сеть разрешает доступ к `api.telegram.org`.

### Bot conflict

Ошибка Telegram 409 означает, что этот token уже используется другим long-polling процессом. Остановите вторую копию бота.

### Asset not found

Повторно выберите файл в Properties. Не переносите файлы вручную из project assets.

### Electron не скачивается при npm install

Проверьте proxy/firewall. Для сетей, где CDN Electron недоступен, можно временно задать совместимое зеркало через переменную `ELECTRON_MIRROR` и повторить `npm install`.

### Сборка Windows installer

Закройте уже запущенную собранную копию Flowra, очистите только содержимое `release/` и снова выполните `npm run dist`.

## Security

Renderer работает с `contextIsolation`, без Node integration, через ограниченный preload API. Произвольное чтение файлов renderer-процессу недоступно. Runtime не использует `eval` или `new Function`; URL HTTP node принимает только `http:` и `https:`. Asset paths проверяются на выход за границы project directory.

## Что можно расширить

- планирование рассылок и возобновление paused queue;
- визуальный редактор rows для keyboard вместо JSON-поля;
- импорт/export workflow отдельно от standalone ZIP;
- шифрование token через системное хранилище с отдельным безопасным каналом для child process;
- webhooks как альтернатива long polling;
- локализация интерфейса.

## License

[MIT](LICENSE)

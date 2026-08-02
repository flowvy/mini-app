# Продукт Flowvy

## Назначение

Flowvy даёт VPN-подписчику компактный кабинет внутри Telegram, а оператору — административный
интерфейс поверх Remnawave. Продукт не является VPN-сервером и не управляет сетью самостоятельно:
он связывает Telegram identity, локальные настройки и данные внешней панели в одном BFF.

Текущее состояние реализации и риски: [`PROJECT_STATE.md`](PROJECT_STATE.md). Намерения и порядок
работ: [`ROADMAP.md`](ROADMAP.md).

## Пользователи

### Подписчик

Текущий пользовательский путь:

1. Открыть Mini App из Telegram и пройти проверку `initData`.
2. Увидеть статус, срок, трафик, лимит устройств и connection link активной подписки.
3. Посмотреть HWID-устройства и удалить одно либо все устройства.
4. Посмотреть Pulse status, если администратор включил Uptime Kuma.

Маршрут Support существует, но пока показывает `Coming soon`. Покупка, продление, оплата,
самостоятельное создание Remnawave user и полноценный support flow не реализованы.

### Администратор

Администратор может переключиться в отдельный набор маршрутов и:

- видеть VPN/bot dashboard;
- загружать, фильтровать и открывать Remnawave users;
- enable/disable/reset traffic/revoke/delete выбранного provider user;
- настраивать Kuma, название/логотип и welcome template/media.

Broadcast пока является заглушкой. Invite model/repository существуют, но invite-only product flow
не подключён. Аудит опасных admin actions отсутствует.

## Продуктовые правила

- Telegram identity и права подтверждает backend; user/admin mode во frontend не является доступом.
- Frontend получает экранные данные только через Flowvy API и не знает provider credentials.
- Connection link, Telegram identifiers, provider UUID и admin actions считаются чувствительными.
- Внешняя недоступность должна превращаться в понятное состояние экрана, а не в раскрытие ответа
  провайдера.
- Каждый data screen должен иметь loading, normal, empty/not-found, denied и degraded/error состояние.
- Опасное действие требует понятного объекта операции, подтверждения и наблюдаемого результата.
- Основная поверхность — Telegram mobile WebView; admin UI также должен оставаться работоспособным на
  desktop viewport.

## Что не следует считать готовым

Наличие маршрута или компонента не означает завершённый продуктовый поток. До production отдельно
нужны безопасность, оставшиеся live/интеграционные проверки, эксплуатационный контур, deployment,
backup/recovery, integrated fake-backend UI suite и согласованное поведение Support/Broadcast/Invite
функций. Эти пробелы нельзя маскировать mock mode или зелёным build.

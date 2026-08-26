# Продукт Flowvy

## Назначение

Flowvy даёт пользователю Xray-прокси компактный кабинет внутри Telegram, а оператору —
административный интерфейс поверх Remnawave. Продукт не является прокси-сервером и не управляет
Xray самостоятельно: он связывает Telegram identity, локальные настройки и данные внешней панели
в одном BFF.

Текущее состояние реализации и риски: [`PROJECT_STATE.md`](PROJECT_STATE.md). Намерения и порядок
работ: [`ROADMAP.md`](ROADMAP.md).

## Пользователи

### Подписчик

Текущий пользовательский путь:

1. Открыть Mini App или написать боту и пройти проверку Telegram identity.
2. Зарегистрироваться открыто либо ввести персональный invite code знакомого, если сервис работает только по
   приглашениям.
3. Получить заданный оператором Remnawave-доступ либо только локальный кабинет без доступа к прокси.
4. Увидеть статус, срок, трафик, лимит устройств и connection link активной подписки.
5. Посмотреть HWID-устройства и удалить одно либо все устройства.
6. Посмотреть Pulse status, если администратор выбрал Uptime Kuma или Beszel.
7. Открыть опубликованные sponsor offers, перейти в Tribute, проверить статус локального checkout и
   увидеть подтверждённый paid/base access без client-side доказательства оплаты.
8. Создать Support request с optional attachment, продолжить conversation и читать опубликованные
   Quick Answers. Установка без настроенного private R2 честно остаётся text-only.

Broadcast явно исключён владельцем из MVP scope. Product-owned `Coming Soon` маршрут сохраняется как
честная post-MVP заглушка; отправка рассылок не реализована и не считается возможностью этого MVP.

### Администратор

Администратор может переключиться в отдельный набор маршрутов и:

- видеть раздельные Remnawave и Flowvy Mini-App dashboard;
- загружать, фильтровать и открывать Remnawave users;
- enable/disable/reset traffic/revoke/delete выбранного provider user;
- выбирать и настраивать источник Pulse — Kuma или Beszel — а также название/логотип и welcome
  template/media;
- переключать открытую регистрацию и invite-only;
- создавать переиспользуемые профили доступа: безлимитный/ограниченный трафик, срок, устройства,
  статус, tag, description, internal/external squads;
- назначать единый профиль доступа всем новым пользователям и видеть число приглашённых в карточке
  пользователя;
- настраивать bilingual product/operator content, Tribute destinations, commerce rules и
  опубликованные sponsor offers;
- обрабатывать durable Tribute activity и Support queue, отвечать пользователю, менять lifecycle
  request и управлять Quick Answers.

Broadcast остаётся post-MVP заглушкой. Production-grade общий operator audit, deployment и
наблюдаемость всё ещё требуют отдельной готовности; текущий append-only activity contract покрывает
Tribute operator actions, но не является универсальным аудитом всего admin UI.

## Продуктовые правила

- Telegram identity и права подтверждает backend; user/admin mode во frontend не является доступом.
- Frontend получает экранные данные только через Flowvy API и не знает provider credentials.
- Connection link, Telegram identifiers, provider UUID и admin actions считаются чувствительными.
- Внешняя недоступность должна превращаться в понятное состояние экрана, а не в раскрытие ответа
  провайдера.
- Каждый data screen должен иметь loading, normal, empty/not-found, denied и degraded/error состояние.
- Отсутствие access profile означает осознанную локальную регистрацию без Remnawave user; `0` в
  traffic limit означает безлимит, lifetime grant преобразуется в фиксированную дату конца 2099 года.
- Каждый зарегистрированный пользователь имеет постоянный многоразовый invite code и счётчик прямых
  приглашений. Telegram-кнопка отправки доступна только когда у бота подтверждена Main Mini App;
  иначе остаётся явное копирование кода. Код не определяет тариф приглашённого.
- Опасное действие требует понятного объекта операции, подтверждения и наблюдаемого результата.
- Основная поверхность — Telegram mobile WebView; admin UI также должен оставаться работоспособным на
  desktop viewport.

## Что не следует считать готовым

Наличие маршрута или компонента не означает завершённый продуктовый поток. До production отдельно
нужны безопасность, оставшиеся live/интеграционные проверки, эксплуатационный контур, deployment,
backup/recovery и integrated fake-backend UI suite. Broadcast относится к post-MVP roadmap и не
входит в этот readiness criterion.
Эти пробелы нельзя маскировать mock mode или зелёным build.

# 0002: UI-тексты и контент оператора

Status: accepted
Date: 2026-08-11
Owners: Flowvy

## Context

Flowvy распространяется как open-source Mini App. У разных операторов отличаются название и логотип
сервиса, приветствие бота, выдаваемые профили доступа и фактические данные подписки. При этом
структура приложения, состояния, ошибки и административные действия должны
оставаться понятными и переводимыми без превращения настроек в произвольную CMS.

Ранее часть форматирования и fallback-текстов находилась прямо в JSX/TypeScript, Support был
заглушкой, а несколько экранов показывали текст backend error. Это смешивало продуктовый язык,
контент оператора и диагностику внешнего provider.

## Decision

1. Единственный источник структурного UI-copy — locale catalog. В locale входят навигация, заголовки
   экранов, пояснения, кнопки, placeholders, accessible names, статусы, единицы/разделители,
   validation copy и безопасные error messages. Видимые литералы в JSX запрещены.
2. Оператор управляет только контентом, который действительно описывает его сервис:
   `app_name`, `logo_url`, `welcome_text`, welcome media и `welcome_button_text`. Эти поля приходят
   через typed backend contract; отсутствие значения включает локализованный product fallback.
3. Данные Remnawave/Kuma/Beszel не становятся локалью: имя access profile, его description,
   subscription facts, monitor/group/incident names, traffic/expiry/device limits и versions
   остаются typed runtime data. Enum/status от provider нормализуется кодом, а его видимая подпись
   берётся из locale.
4. Product-owned UX остаётся в locale и не переносится в PostgreSQL: Home/Pulse/Devices/Support,
   onboarding, admin navigation/forms/actions, единый layout ошибок и технические пояснения. Другой
   дистрибутив может заменить locale resource при сборке, не меняя data contract.
5. Тарифы, покупка, продление и платежи пока не реализованы. Когда они появятся, имя/описание/цена и
   доступ тарифа должны быть operator-owned data; подписи checkout, состояния и ошибки — locale copy.
6. Page-level ошибки используют один `ErrorState` с вариантами load/auth/forbidden/not-found.
   Ошибка локальной mutation остаётся inline, но также использует locale. Текст `message` от backend
   или внешнего provider пользователю не показывается; stable API code переводится в locale key.
7. Support — будущая встроенная возможность Mini App. Пока flow не реализован, маршрут показывает
   локализованную заглушку и не подменяется настраиваемой внешней ссылкой.
8. Автоматический тест должен отклонять неиспользуемые locale leaves, прямой видимый JSX-copy и
   повторное использование raw error message в UI.

## Consequences

- White-label настройка покрывает identity и bot welcome без форка компонентов.
- Добавление UI-текста требует locale key; удаление использования требует удалить и key.
- Provider content не переводится автоматически Flowvy и отображается ровно как введён оператором.
- Новая locale требует полного key parity, выбора языка и проверки длинных строк; одна только копия
  JSON не считается завершённой локализацией.

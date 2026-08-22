# 0002: UI-тексты и контент оператора

Status: accepted
Date: 2026-08-22
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
2. Оператор управляет только контентом, который действительно описывает его сервис и tone of voice:
   identity, универсальный Telegram welcome, open/invite onboarding, referral card/share text и
   входом в sponsor storefront. Поля имеют versioned typed contract и
   хранятся как `locale -> semantic fields`, а не как произвольные locale keys или generic CMS.
   Отсутствие значения включает product fallback текущей locale.
3. Public API не отдаёт весь словарь: `/api/me`, `/api/onboarding` и sponsor state разрешают одну
   locale из `Accept-Language`; Telegram bot использует `User.language_code`. Fallback идёт по
   exact tag → base language → locale оператора → English. Сейчас поставляется только English,
   но схема и редакторы сразу поддерживают несколько locale.
4. Данные Remnawave/Kuma/Beszel/Tribute не становятся локалью: имя access profile, его description,
   subscription facts, monitor/group/incident names, traffic/expiry/device limits и versions
   остаются typed runtime data. Enum/status от provider нормализуется кодом, а его видимая подпись
   берётся из locale.
5. Product-owned UX остаётся в locale и не переносится в PostgreSQL: навигация, структура экранов,
   payment/auth/security semantics, admin actions, validation, статусы, accessibility copy, единый
   layout ошибок и технические пояснения. Другой дистрибутив может заменить locale resource при
   сборке, не меняя data contract.
6. Sponsor-offer title/description являются operator-owned runtime data и локализуются тем же
   typed locale-map contract. Provider-confirmed prices, periods и payment state остаются фактами,
   а checkout labels, предупреждения и ошибки — product locale copy.
7. Page-level ошибки используют один `ErrorState` с вариантами load/auth/forbidden/not-found.
   Ошибка локальной mutation остаётся inline, но также использует locale. Текст `message` от backend
   или внешнего provider пользователю не показывается; stable API code переводится в locale key.
8. Support остаётся product-owned заглушкой `Coming Soon`: route и navigation стабильны, но страница
   не читает provider settings, operator content или внешнюю destination. Mini App descriptions в
   перечисленных operator-owned slots поддерживают только allow-listed CommonMark и никогда не
   рендерят raw HTML.
9. Автоматические тесты проверяют locale catalog, placeholder allow-list, fallback, public
   projection, отсутствие прямого user-visible bot hardcode и UI/runtime states.
10. Единственный Telegram welcome использует отдельный allow-listed HTML contract с explicit parse
    mode, custom-emoji fallback и caption-safe limit. Registration-specific bot prompt отсутствует:
    open/invite states показываются Mini App onboarding. Admin UI получает canonical template
    capabilities от backend и показывает их в collapsed copyable disclosure; `appName` является
    публичным token, а legacy `app_name` остаётся только compatibility input.

## Consequences

- White-label настройка покрывает identity и ограниченный service voice без форка компонентов.
- Добавление UI-текста требует locale key; удаление использования требует удалить и key.
- Operator content не переводится автоматически Flowvy; для каждой поддерживаемой locale оператор
  вводит собственный вариант, а незаполненные semantic slots получают product fallback.
- Новая locale требует полного key parity, выбора языка и проверки длинных строк; одна только копия
  JSON не считается завершённой локализацией.

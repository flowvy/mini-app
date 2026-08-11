# i18n во frontend

Источник истины для пользовательских строк — `frontend/src/i18n/locales/en.json`. Ручной список
каждого ключа, line number и количества строк здесь не ведётся: он быстро расходится с кодом.

## Текущее состояние

- Единственная locale — `en`; `frontend/src/i18n/index.ts` устанавливает её как current и fallback.
- Домены ключей: `common`, `home`, `onboarding`, `access`, `devices`, `support`, `pulse`, `settings`,
  `admin`, `format`.
- React components получают `t` через `useTranslation`; non-React code при необходимости использует
  общий i18n instance.
- Product-owned copy, formatting и accessible names находятся только в locale. Operator-owned
  identity/welcome и provider-owned фактические значения приходят как typed runtime data;
  граница подробно зафиксирована в
  [`decisions/0002-ui-copy-and-provider-owned-content.md`](decisions/0002-ui-copy-and-provider-owned-content.md).
- `tests/unit/i18n-catalog.test.ts` проверяет отсутствие неиспользуемых locale leaves, прямого
  видимого JSX-copy, вывода raw backend error message и ошибочной подмены Xray-прокси другим
  классом технологии в product-owned locale.
- Dynamic locale selection, plural audit и fallback tests для нескольких языков не реализованы.

## Добавление или изменение строки

1. Выберите существующий feature domain; новый top-level domain создавайте только для отдельной
   устойчивой области продукта.
2. Сначала добавьте English source в `en.json`, затем используйте `t("domain.key")`.
3. Для переменных используйте i18next interpolation `{{name}}`; не собирайте предложение из частей в
   JSX.
4. Переводите видимый text, placeholder, title, validation/error message, punctuation/formatting и
   accessible name. Internal exception/debug text и provider values не становятся locale strings;
   видимая подпись API enum всегда локализуется после нормализации.
5. Проверьте normal, long/interpolated, empty и error state; для UI также mobile overflow и
   accessible name.
6. Запустите из `frontend/`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` и применимый
   Playwright scenario.

## Добавление новой locale

Перед подключением создайте полный resource с теми же leaf keys, настройте выбор языка/fallback и
добавьте автоматическую проверку parity между locale-файлами. Отдельно проверьте plural rules,
date/number units, длинные подписи, fallback при отсутствующем key и оба направления текста, если
планируется RTL. Пока такой verifier отсутствует, новую locale нельзя считать завершённой только по
наличию JSON-файла.

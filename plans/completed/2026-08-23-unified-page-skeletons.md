# Унифицированные skeleton loading states

Status: completed
Owner: Пятница
Started: 2026-08-23
Updated: 2026-08-23

## Purpose

Все Flowvy routes и initial data loads используют skeleton как основной placeholder, совпадающий с
геометрией будущей страницы. Уже показанные данные не исчезают во время background refetch, а
mutation progress остаётся локальным spinner в инициировавшем control.

## Current state

- `frontend/src/router.ts` содержит 25 code-based lazy routes и один общий spinner
  `defaultPendingComponent`.
- Home и Admin Users имеют структурные skeleton states.
- Pulse, Devices, Dashboard, Admin User Detail и большинство Admin Settings routes используют
  полноэкранный `PageLoading` spinner.
- Tribute Payment links, Automation rules, Sponsor offers и Activity используют текстовые initial
  loading states внутри готовой settings surface.
- `frontend/src/components/ui/skeleton.tsx` уже использует Flowvy surface token и отключает pulse
  animation при `prefers-reduced-motion`.

## Scope

Входит:

- общий skeleton composition layer с route-to-family mapping;
- семейства Home, list, status, dashboard, settings/form, detail и generic;
- единый route-chunk и initial-query placeholder;
- progressive section skeleton для четырёх Tribute subqueries;
- neutral launch/onboarding skeleton;
- локализованный accessible loading status;
- unit и deterministic Playwright coverage, light/dark visual evidence.

Не входит:

- перевод query hooks на Suspense или router loaders;
- изменение API, backend, query freshness, retry или cache policy;
- замена mutation/background-refetch spinners;
- новая UI dependency.

## Acceptance

- Ни один page-level initial load не показывает spinner или голую текстовую строку.
- Skeleton повторяет семейство конечной страницы и не создаёт horizontal overflow на 320x568 и
  430x932.
- Готовая часть страницы остаётся видимой, пока независимая секция ещё загружается.
- Skeleton blocks декоративны для accessibility tree; loading state имеет одно понятное status
  announcement и `aria-busy`.
- `prefers-reduced-motion` отключает pulse animation.
- Mutation и background refresh продолжают показывать локальный progress без скрытия данных.
- Свежие lint, typecheck, unit, build, focused Playwright и repository verification дают честный
  результат; Axe debt сообщается строго по ADR 0004.

## Approach

1. Добавить `PageSkeleton` и небольшие reusable section/row primitives поверх существующего
   `Skeleton`, а также чистый pathname-to-variant resolver.
2. Заменить `PageLoading` на route-aware skeleton fallback и переиспользовать те же variants во всех
   blocking query branches.
3. Перенести Home и Users на общий composition layer без изменения их loading geometry.
4. Заменить четыре Tribute text loading states на локальные skeleton sections, сохранив их error,
   empty, retry и mutation branches.
5. Добавить semantic/unit regressions и deterministic browser scenarios с delayed mocked responses.
6. Провести focused и полную проверку, просмотреть screenshots и финальный diff.

## Progress

- [x] 2026-08-23 09:42 +03:00 — прочитаны repository/UI verification instructions, актуальные routes,
  hooks, loading branches, тесты и pinned frontend versions.
- [x] 2026-08-23 09:42 +03:00 — сверены React, TanStack Router/Query, WAI-ARIA и Carbon loading
  contracts; выбран composition layer без новой dependency.
- [x] 2026-08-23 09:57 +03:00 — реализованы primitives, route mapping и blocking page states.
- [x] 2026-08-23 09:57 +03:00 — реализованы progressive Tribute section и lazy editor skeletons.
- [x] 2026-08-23 09:57 +03:00 — добавлены unit и deterministic browser coverage.
- [x] 2026-08-23 10:08 +03:00 — выполнены focused проверки, Full gate и diff review; Full browser
  accessibility stage остаётся красной только на exact accepted ADR 0004 ledger.

## Surprises & Discoveries

- `PageLoading` обслуживает две разные задержки: lazy route chunk и component-owned initial query.
  Унификация должна покрыть обе границы одним визуальным contract.
- Auth находится выше RouterProvider, поэтому launch state не может использовать route hooks и требует
  отдельного neutral shell skeleton.

## Decision Log

- 2026-08-23 — выбран family-based composition: один generic primitive недостаточно похож на
  конечные routes, а отдельный независимый skeleton для каждого route создаёт лишнее дублирование.
- 2026-08-23 — mutation и background refetch spinners остаются: skeleton обозначает отсутствие
  структуры/данных, spinner — локальную выполняемую операцию.
- 2026-08-23 — router loader/Suspense migration исключена из scope как самостоятельный performance
  refactor, не обязательный для визуальной унификации.

## Sources

Проверено 2026-08-23 против locked React 19.2.4, `@tanstack/react-router` 1.168.10 и
`@tanstack/react-query` 5.90.21:

- React Suspense: https://react.dev/reference/react/Suspense — fallback принадлежит ближайшей
  boundary; nested boundaries задают progressive reveal, а уже показанный UI не следует без причины
  заменять большим fallback.
- TanStack Router code splitting: https://tanstack.com/router/latest/docs/guide/code-splitting —
  route component и pending component являются lazy/non-critical configuration.
- TanStack Query `useQuery`:
  https://tanstack.com/query/latest/docs/framework/react/reference/useQuery — `placeholderData`
  создаёт observer-level fake/partial data и не сохраняется в cache; для Flowvy это не применялось,
  потому что skeleton не должен подделывать domain data.
- W3C WAI ARIA22: https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22 — status message использует
  polite live region; explicit `aria-atomic="true"` сохраняет цельное announcement.
- Carbon loading pattern: https://carbondesignsystem.com/patterns/loading-pattern/ и
  https://carbondesignsystem.com/components/loading/usage/ — initial container/list/card loads
  используют skeleton, progressive content не должен получать несколько конкурирующих spinners,
  mutation/action progress остаётся inline.

## Verification

- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: `pnpm lint` → без Biome errors.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: `pnpm typecheck` → без TypeScript errors.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: `pnpm test` → все unit tests зелёные.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: `pnpm build` → production build успешен.
- `/Users/x_kit_/Documents/Projects/mini-app/frontend`: focused Playwright loading scenarios →
  проходят на mobile, small-mobile, iOS WebKit и desktop; screenshots просмотрены в light/dark.
- `/Users/x_kit_/Documents/Projects/mini-app`: `pwsh ./scripts/verify.ps1 -Scope Changed` во время
  итерации и `pwsh ./scripts/verify.ps1 -Scope Full` перед handoff.

## Recovery and rollback

Изменения frontend-only и не затрагивают данные. Каждый route можно временно вернуть на прежний
loading branch отдельным diff; удаление composition layer возможно после удаления его imports.
Git history, БД и внешние providers не изменяются.

## Outcomes & Retrospective

- Один composition layer заменил page spinner, два дублированных page skeleton owners, четыре
  Tribute text states и два lazy editor text fallbacks; mutation/background progress не изменён.
- 52/52 focused Playwright scenarios прошли на mobile Chromium, 320px Chromium, iOS WebKit и desktop
  Chromium. Проверены delayed routes/sections, accessible status, отсутствие page spinner, overflow,
  reduced motion и dashboard light/dark evidence.
- Fresh Full: lifecycle scripts, Ruff, Alembic one-head/fresh/downgrade/re-upgrade/drift, 533 backend,
  56 pinned Remnawave contracts, frontend lint/typecheck, 99 unit и production build прошли.
  Mobile Playwright дал 172/184; все 12 failures содержат только exact `color-contrast` nodes и пары
  из accepted ADR 0004. Functional, console, network, overflow и остальные accessibility checks
  зелёные; suppression не добавлялся.

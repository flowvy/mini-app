---
name: frontend
description: React/TypeScript frontend for Flowvy Telegram Mini App. Use when working on any file in frontend/, including components, pages, hooks, styles, or Vite config.
---

## Stack

- React 19, TypeScript 5.6+, Vite 6
- TanStack Query v5 for server state
- TanStack Router for routing (file-based or manual)
- TipTap for rich text editing (broadcast composer)
- lottie-web for animated custom emoji rendering
- @telegram-apps/sdk-react for Telegram WebApp integration
- biome for lint+format
- pnpm as package manager

## Design System

Flowvy uses custom CSS-variable design tokens (NOT Tailwind). Colors, radii, shadows, fonts defined in `src/styles/tokens.css`. Both light and dark themes. Font: Geist Variable.

IMPORTANT: Never use hardcoded colors. Always reference `var(--v2-*)` tokens. The tokens follow this naming:
- `--v2-floor-{0,1}` — page/card backgrounds
- `--v2-bg-{primary,secondary,tertiary,...}` — component backgrounds
- `--v2-bg-positive-{primary,secondary,...}` — success/accent (green)
- `--v2-bg-negative-*` — error (red)
- `--v2-text-{primary,secondary,tertiary}` — text colors
- `--v2-border-{primary,secondary,tertiary}` — borders
- `--v2-shadow`, `--v2-shadow-dropdown`, etc. — shadows
- `--radius-sm` (6px), `--radius-md` (8px), `--radius-lg` (12px)

## Component Architecture

Components live in `src/components/ui/` (primitives) and `src/components/<feature>/` (feature-specific).

Primitives are shadcn/ui-inspired but use Flowvy tokens. Each primitive: one file, named export, props interface, forwardRef where needed. Examples: Button, Input, Modal (bottom sheet), Select, Toggle, Tag, Card.

Feature components compose primitives. Example: `BroadcastComposer` uses TipTap editor + EmojiPicker + KeyboardBuilder + FileUpload.

## Telegram Mini App Integration

```typescript
import { init, miniApp, themeParams } from '@telegram-apps/sdk-react';

// Initialize on app mount
init();
miniApp.ready();
```

Auth: send `initData` to backend in Authorization header. Backend validates, returns session.

Theme: detect via `themeParams` or `prefers-color-scheme`. Set `data-theme` attribute on `<html>`.

Safe areas: respect `safeAreaInset` and `contentSafeAreaInset` for fullscreen mode.

## TanStack Query v5

IMPORTANT: We use v5, NOT v4. Key differences from v4:
- `gcTime` (not `cacheTime`)
- `isPending` (not `isLoading` for initial load)
- No `onError`/`onSuccess` callbacks in useQuery — use useEffect
- Single object parameter: `useQuery({ queryKey, queryFn, staleTime })`

### Query Keys — centralized in `lib/query.ts`

```typescript
export const queryKeys = {
  subscription: ['subscription'] as const,
  devices: ['devices'] as const,
  nodes: ['nodes'] as const,
  adminStats: ['admin', 'stats'] as const,
  adminUsers: (page: number) => ['admin', 'users', page] as const,
};
```

### Hook pattern

```typescript
export function useSubscription() {
  return useQuery({
    queryKey: queryKeys.subscription,
    queryFn: () => apiGet<SubscriptionData>('/api/me/subscription'),
    staleTime: 0,         // always refetch on mount
    gcTime: 5 * 60_000,   // keep in memory 5 min after unmount
  });
}
```

### Invalidation after mutations

```typescript
const queryClient = useQueryClient();
const deleteDevice = useMutation({
  mutationFn: (hwid: string) => apiDelete(`/api/me/devices/${hwid}`),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    queryClient.invalidateQueries({ queryKey: queryKeys.subscription });
  },
});
```

### Deduplication

TanStack Query automatically deduplicates: multiple components with same queryKey = one request. No manual dedup needed.

### QueryClient setup in `lib/query.ts`

```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false, // Mini App, not browser tab
    },
  },
});
```

## TipTap (Broadcast Editor)

Custom extensions needed:
- `TelegramSpoiler` — inline mark, maps to `{type: "spoiler"}` entity
- `CustomEmoji` — inline node, renders emoji image/lottie, stores `custom_emoji_id`

Output: TipTap JSON → convert to `{text, entities}` format for Bot API on backend.

## Commands

```bash
cd frontend
pnpm install                     # install deps
pnpm dev                         # dev server (Vite)
pnpm build                       # production build
pnpm biome check --fix .         # lint+format
pnpm test                        # vitest
```

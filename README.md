# tavora-web

The Tavora web client. Vue 3 for the shell, the sheets and the dialogs; PixiJS in a worker
on an `OffscreenCanvas` for the table.

Design: [concept doc 05](https://github.com/tavora-vtt/tavora-docs/blob/main/concept/05-rendering-and-performance.md)
for rendering, [doc 14](https://github.com/tavora-vtt/tavora-docs/blob/main/concept/14-ui-architecture.md)
for layout, [doc 15](https://github.com/tavora-vtt/tavora-docs/blob/main/concept/15-design-system.md)
for the design system.

> Links to `tavora-docs` point at a repository that is currently private, so they resolve
> only for members of the organisation. The design rationale will open up with it.

## Run it

```
pnpm install
pnpm dev
```

The dev server proxies `/api`, `/ws`, `/healthz` and `/readyz` to a `tavora-server` running
on port 30000.

## Three rules that are not negotiable

They are how the frame budget is kept, and violating them is how it disappears.

1. Game documents are never deeply reactive. The document cache is a plain `Map` behind a
   `shallowRef`, and components subscribe through selectors keyed by document id.
2. The render worker owns its own state and is fed by patches. There is no shared mutable
   state between it and the main thread.
3. Sheets update by patch, not by re-render.

## Status

Milestone M0. Shell and canvas land next.

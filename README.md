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

## What is on screen today

Sign-in and first-run setup, the world list with creation, and the session shell: top bar,
tool rail, map area, and a right dock with the party and a live world event feed. The
socket connects, shows its state and round-trip latency, and replays what it missed after a
reconnect.

The map is a real PixiJS canvas: a grid, tokens with disposition rings, click to select,
drag to move. A drag emits a preview on the ephemeral lane at pointer rate and one
authoritative `scene.token.move` intent on release, so other clients see the token travel
and then land where the server says it landed. The renderer prefers WebGPU and falls back
to WebGL; the badge in the corner says which one it got.

Drag empty space to pan, wheel to zoom anchored at the pointer, Fit to frame the scene
again. Pointer positions go out on the ephemeral lane at 20 Hz, so everyone at the table
sees everyone else's cursor with a name label; a cursor that stops arriving fades out after
six seconds rather than lingering forever.

A world can hold several scenes. The dock lists them, the game master clicks one to make it
active, and every connected client follows: the `scene.activate` intent writes the world's
active scene, appends an event and fans it out, so nobody has to be told to switch. Players
see which scene is live but cannot change it.

The client speaks the readable JSON protocol for now, so the dev server sets
`TAVORA_PROTOCOL_JSON=1`. Protobuf on the client follows once `tavora-protocol` generates
its TypeScript bindings.

## Status

Milestone M0. The canvas lands next.

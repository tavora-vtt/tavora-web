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

The dock carries a chat panel: type to talk, `/r 4d6kh3` or the quick buttons to roll. Roll
cards show every die, with dropped ones struck through, and the total on the right. A game
master can tick "staff only" to keep a roll off the players' sockets.

Character sheets open as draggable windows that remember where you put them, per sheet
kind, so the next one opens where the last one was. Attributes are dot ratings, health and
willpower are box tracks that cycle empty, superficial, aggravated. Clicking an attribute
name rolls its pool into chat. A sheet you may read but not edit says so and its controls
are disabled; the server enforces that regardless.

The combat panel shows the turn order with initiative and disposition rings. The active
turn is the one place amber appears, which is the design system's rule: warm means
something needs you. The game master gets Roll initiative, Next turn and End; players see
the order and nothing to press.

The W tool on the rail draws walls: click to start, move to preview, click to finish, snapped
to the grid. Walls render on the map, doors in amber. A token a player cannot see never
arrives, so it is simply absent from their map rather than drawn and hidden.

The D tool draws doors instead of plain walls. A door carries a handle on the map that the
game master clicks to open or close it, and everyone's view updates in the same breath:
tokens behind it appear or vanish without a reload.

The Art panel uploads a map or a portrait and shows what the world holds. Clicking a
thumbnail sends it wherever you are pointed: to the selected token, or to the map itself
when nothing is selected. The panel says which, so the click is never a guess. Both go out
as document patches, so every other seat sees the new art without reloading, and the map
resizes the scene to its own dimensions.

Art is decoded here rather than through the renderer's asset loader, because a
content-addressed URL carries no file extension for a loader to recognize. Textures are
kept in an LRU keyed by that URL and evicted when it fills. A map sits under the grid,
which drops its ground fill and thins its lattice so the art keeps the colours it was
uploaded with. A portrait is cropped into the disposition ring, and token names carry an
outline in the interface's own background colour so they stay readable over a dark map, a
bright one, and either theme.

Chrome stays out of the way. The top bar is the 40 px doc 14 specifies and holds only what
belongs there: the world, the active scene, one connection dot, and you. Theme and density
are settings, so they live in the user menu behind your name rather than as permanent
widgets in the bar. Nothing on a player-facing screen reports which storage backend the
server uses, which protocol sequence the socket is on, or which renderer the canvas picked.

Amber is spent only where the design system allows it: your turn in combat, and a
connection that needs looking at. The active scene and an editable sheet used to be amber
too, which quietly spent the one signal that is supposed to be unmissable.

The client speaks the binary Protobuf protocol, generated from `tavora-protocol` and
consumed as a git dependency pinned to a tag. Append `?protocol=json` to the page URL to
switch the socket to the readable encoding for debugging; the server only honours it when
it was started with `TAVORA_PROTOCOL_JSON=1`, which `make dev` does.

## Status

Milestone M1. The canvas is live: maps, tokens with art, walls, doors, line of sight,
combat order, character sheets and chat.

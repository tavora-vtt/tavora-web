<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import {
  api,
  ApiError,
  type ActorRecord,
  type AssetRecord,
  type Identity,
  type Member,
  type Scene,
  type TokenRecord,
  type World,
} from "../api/client";
import { Session, type ConnectionState, type EventFrame } from "../net/socket";
import type { SceneShape, TokenShape, WallShape } from "../canvas/tabletop";
import BrandMark from "../components/BrandMark.vue";
import ThemeToggle from "../components/ThemeToggle.vue";
import TabletopCanvas from "../components/TabletopCanvas.vue";
import ChatPanel, { type ChatMessage } from "../components/ChatPanel.vue";
import ActorSheet, { type Actor } from "../components/ActorSheet.vue";

const props = defineProps<{ identity: Identity; world: World }>();
const emit = defineEmits<{ (event: "leave"): void }>();

const state = ref<ConnectionState>("idle");
const detail = ref("");
const latency = ref<number | null>(null);
const sequence = ref(0);
const role = ref(props.world.role ?? "");
const members = ref<Member[]>([]);
const log = ref<{ seq: number; kind: string; summary: string }[]>([]);
const messages = ref<ChatMessage[]>([]);
const actors = ref<Actor[]>([]);

interface Combatant {
  id: string;
  name: string;
  initiative: number;
  disposition: string;
}

interface Combat {
  active: boolean;
  round: number;
  turn: number;
  sceneId: string;
  combatants: Combatant[];
}

const combat = ref<Combat | null>(null);
const walls = ref<WallShape[]>([]);
const wallTool = ref(false);
const doorTool = ref(false);
const openSheets = ref<string[]>([]);
const inviteToken = ref("");
const selected = ref<string | null>(null);

const scenes = ref<Scene[]>([]);
const scene = ref<Scene | null>(null);
const tokens = ref<TokenShape[]>([]);
const assets = ref<AssetRecord[]>([]);
const uploading = ref(false);
const uploadError = ref("");

const session = shallowRef<Session | null>(null);
const canvas = ref<InstanceType<typeof TabletopCanvas> | null>(null);

const isGM = computed(() => role.value === "gm");

const shape = computed<SceneShape | null>(() =>
  scene.value
    ? {
        width: scene.value.data.width,
        height: scene.value.data.height,
        gridSize: scene.value.data.gridSize,
        background: scene.value.data.background,
      }
    : null,
);

const stateLabel = computed(() => {
  switch (state.value) {
    case "live":
      return "connected";
    case "connecting":
      return "connecting";
    case "reconnecting":
      return detail.value ? `reconnecting: ${detail.value}` : "reconnecting";
    default:
      return "offline";
  }
});

function toShape(record: TokenRecord): TokenShape {
  return {
    id: record.id,
    name: record.name,
    img: record.img,
    x: record.data?.x ?? 0,
    y: record.data?.y ?? 0,
    disposition: record.data?.disposition ?? "neutral",
  };
}

async function loadAssets() {
  assets.value = await api.assets(props.world.id);
}

async function uploadArt(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  uploading.value = true;
  uploadError.value = "";
  try {
    const record = await api.uploadAsset(props.world.id, file);
    assets.value = [record, ...assets.value.filter((entry) => entry.id !== record.id)];
  } catch (error) {
    uploadError.value = error instanceof ApiError ? uploadMessage(error) : "Upload failed.";
  } finally {
    uploading.value = false;
  }
}

function uploadMessage(error: ApiError): string {
  switch (error.messageKey) {
    case "core.asset.unsupportedFormat":
      return "Only png, jpeg and gif images are accepted.";
    case "core.asset.tooLarge":
      return "That image is too large.";
    case "core.asset.worldIsFull":
      return "This world has no room left for art.";
    case "core.asset.brokenImage":
      return "That file is not a readable image.";
    default:
      return "Upload failed.";
  }
}

/**
 * useArt sends the picked image to the selected token, or to the map itself when nothing
 * is selected. Both go out as document patches, so every other seat sees the change
 * without reloading.
 */
function useArt(asset: AssetRecord) {
  if (!isGM.value) return;

  if (selected.value) {
    void session.value?.intent("document.patch", {
      id: selected.value,
      img: asset.url,
    });
    return;
  }
  if (scene.value) {
    void session.value?.intent("document.patch", {
      id: scene.value.id,
      set: { background: asset.url, width: asset.width, height: asset.height },
    });
  }
}

function clearArt() {
  if (!isGM.value) return;

  if (selected.value) {
    void session.value?.intent("document.patch", {
      id: selected.value,
      img: "",
    });
    return;
  }
  if (scene.value) {
    void session.value?.intent("document.patch", {
      id: scene.value.id,
      set: { background: "" },
    });
  }
}

const artTarget = computed(() => {
  if (selected.value) {
    return tokens.value.find((token) => token.id === selected.value)?.name ?? "the selected token";
  }
  return scene.value ? scene.value.name : "no scene";
});

async function loadScenes() {
  scenes.value = await api.scenes(props.world.id);
  const active = scenes.value.find((entry) => entry.active) ?? scenes.value[0] ?? null;
  await openScene(active);
}

async function openScene(target: Scene | null) {
  scene.value = target;
  if (!target) {
    tokens.value = [];
    return;
  }
  tokens.value = (await api.tokens(props.world.id, target.id)).map(toShape);
  walls.value = (await api.walls(props.world.id, target.id)).map((record) => ({
    id: record.id,
    x1: record.data.x1,
    y1: record.data.y1,
    x2: record.data.x2,
    y2: record.data.y2,
    door: record.data.door,
    doorOpen: record.data.doorOpen,
  }));
}

function toggleDoor(id: string) {
  if (!isGM.value) return;
  void session.value?.intent("scene.door.toggle", { wallId: id });
}

async function addWall(x1: number, y1: number, x2: number, y2: number) {
  if (!scene.value || !isGM.value) return;
  const record = await api.createWall(
    props.world.id,
    scene.value.id,
    x1,
    y1,
    x2,
    y2,
    doorTool.value,
  );
  walls.value = [
    ...walls.value,
    {
      id: record.id,
      x1,
      y1,
      x2,
      y2,
      door: record.data.door,
      doorOpen: record.data.doorOpen,
    },
  ];
}

async function createScene() {
  const created = await api.createScene(props.world.id, `Scene ${scenes.value.length + 1}`);
  scenes.value = [...scenes.value, created];
  await activateScene(created);
}

async function activateScene(target: Scene) {
  if (!isGM.value) return;
  await session.value?.intent("scene.activate", { sceneId: target.id });
}

async function addToken() {
  if (!scene.value) return;

  const dispositions = ["friendly", "hostile", "neutral", "secret"];
  const record = await api.createToken(
    props.world.id,
    scene.value.id,
    `Token ${tokens.value.length + 1}`,
    2 + (tokens.value.length % 8),
    2 + Math.floor(tokens.value.length / 8),
    dispositions[tokens.value.length % dispositions.length] ?? "neutral",
  );
  tokens.value = [...tokens.value, toShape(record)];
}

function moveToken(id: string, x: number, y: number) {
  const index = tokens.value.findIndex((token) => token.id === id);
  if (index >= 0) {
    const next = [...tokens.value];
    next[index] = { ...next[index]!, x, y };
    tokens.value = next;
  }
  void session.value?.intent("scene.token.move", { tokenId: id, x, y });
}

function previewMove(id: string, x: number, y: number) {
  session.value?.ephemeral("token.drag", `token:${id}`, { tokenId: id, x, y });
}

function broadcastPointer(x: number, y: number) {
  session.value?.ephemeral("cursor", `cursor:${props.identity.id}`, {
    userId: props.identity.id,
    name: props.identity.username,
    x,
    y,
  });
}

function toActor(record: ActorRecord): Actor {
  return {
    id: record.id,
    name: record.name,
    subtype: record.subtype,
    data: record.data as Actor["data"],
    canEdit: record.canEdit,
  };
}

async function loadActors() {
  actors.value = (await api.actors(props.world.id)).map(toActor);
}

async function createActor() {
  const record = await api.createActor(
    props.world.id,
    `Character ${actors.value.length + 1}`,
    "vampire",
  );
  actors.value = [...actors.value, toActor(record)];
  openSheets.value = [...openSheets.value, record.id];
}

function openSheet(id: string) {
  if (!openSheets.value.includes(id)) {
    openSheets.value = [...openSheets.value, id];
  }
}

function closeSheet(id: string) {
  openSheets.value = openSheets.value.filter((entry) => entry !== id);
}

function patchActor(id: string, set: Record<string, unknown>) {
  void session.value?.intent("document.patch", { id, set });
}

function rollFromSheet(expression: string, reason: string) {
  void session.value?.intent("chat.roll", {
    expression,
    reason,
    audience: "public",
  });
}

const openActors = computed(() =>
  openSheets.value
    .map((id) => actors.value.find((actor) => actor.id === id))
    .filter((actor): actor is Actor => actor !== undefined),
);

function startCombat() {
  if (!scene.value) return;
  void session.value?.intent("combat.start", { sceneId: scene.value.id });
}

function nextTurn() {
  void session.value?.intent("combat.next", {});
}

function endCombat() {
  void session.value?.intent("combat.end", {});
}

const activeCombatant = computed(() =>
  combat.value?.active ? (combat.value.combatants[combat.value.turn]?.id ?? null) : null,
);

function post(text: string, audience: string) {
  void session.value?.intent("chat.post", { text, audience });
}

function roll(expression: string, reason: string, audience: string) {
  void session.value?.intent("chat.roll", { expression, reason, audience });
}

function record(event: EventFrame) {
  sequence.value = event.seq;

  if (event.kind === "chat.message") {
    const message = event.payload as ChatMessage | undefined;
    if (message?.id && !messages.value.some((entry) => entry.id === message.id)) {
      messages.value = [...messages.value, message].slice(-200);
    }
    return;
  }

  if (event.kind === "scene.door.toggle") {
    const door = event.payload as { wallId?: string; doorOpen?: boolean } | undefined;
    if (door?.wallId !== undefined) {
      walls.value = walls.value.map((wall) =>
        wall.id === door.wallId ? { ...wall, doorOpen: door.doorOpen ?? false } : wall,
      );
    }
    return;
  }

  if (event.kind === "scene.visibility") {
    const update = event.payload as
      { tokens?: { id: string; name: string; data: TokenRecord["data"] }[] } | undefined;
    if (update?.tokens) {
      tokens.value = update.tokens.map((record) => toShape(record as TokenRecord));
    }
    return;
  }

  if (event.kind === "combat.update" || event.kind === "combat.end") {
    combat.value = event.payload as Combat;
    log.value = [
      {
        seq: event.seq,
        kind: event.kind,
        summary: combat.value.active
          ? `round ${combat.value.round}, ${combat.value.combatants[combat.value.turn]?.name ?? ""}`
          : "combat ended",
      },
      ...log.value,
    ].slice(0, 40);
    return;
  }

  if (event.kind === "scene.activate") {
    const activated = event.payload as { sceneId?: string; name?: string } | undefined;
    if (activated?.sceneId) {
      scenes.value = scenes.value.map((entry) => ({
        ...entry,
        active: entry.id === activated.sceneId,
      }));
      const target = scenes.value.find((entry) => entry.id === activated.sceneId) ?? null;
      void openScene(target);
      log.value = [
        {
          seq: event.seq,
          kind: event.kind,
          summary: activated.name ?? "scene changed",
        },
        ...log.value,
      ].slice(0, 40);
      return;
    }
  }

  const document = event.payload as
    { id?: string; kind?: string; name?: string; data?: unknown } | undefined;
  if (document?.id && document.kind === "actor") {
    const index = actors.value.findIndex((actor) => actor.id === document.id);
    if (index >= 0) {
      const next = [...actors.value];
      next[index] = {
        ...next[index]!,
        name: document.name ?? next[index]!.name,
        data: document.data as Actor["data"],
      };
      actors.value = next;
    }
    log.value = [
      {
        seq: event.seq,
        kind: event.kind,
        summary: document.name ?? "sheet updated",
      },
      ...log.value,
    ].slice(0, 40);
    return;
  }

  if (document?.id && document.kind === "scene") {
    const patched = document.data as Scene["data"] | undefined;
    scenes.value = scenes.value.map((entry) =>
      entry.id === document.id && patched ? { ...entry, data: patched } : entry,
    );
    if (scene.value?.id === document.id && patched) {
      scene.value = { ...scene.value, data: patched };
    }
    return;
  }

  const payload = event.payload as
    { id?: string; name?: string; img?: string; data?: TokenRecord["data"] } | undefined;
  if (payload?.id && payload.data) {
    const shapeFromEvent: TokenShape = {
      id: payload.id,
      name: payload.name ?? "",
      img: payload.img,
      x: payload.data.x ?? 0,
      y: payload.data.y ?? 0,
      disposition: payload.data.disposition ?? "neutral",
    };
    const index = tokens.value.findIndex((token) => token.id === payload.id);
    if (index >= 0) {
      const next = [...tokens.value];
      next[index] = shapeFromEvent;
      tokens.value = next;
    }
    canvas.value?.applyRemote(shapeFromEvent);
  }

  log.value = [
    { seq: event.seq, kind: event.kind, summary: payload?.name ?? event.kind },
    ...log.value,
  ].slice(0, 40);
}

async function createInvite() {
  const invite = await api.createInvite(props.world.id, "player", 0);
  inviteToken.value = invite.token ?? "";
}

const inviteLink = computed(() =>
  inviteToken.value ? `${location.origin}/invite/${inviteToken.value}` : "",
);

onMounted(async () => {
  members.value = await api.members(props.world.id).catch(() => []);
  await loadScenes().catch(() => undefined);
  await loadActors().catch(() => undefined);
  await loadAssets().catch(() => undefined);

  const connection = new Session(
    props.world.id,
    async () => (await api.ticket(props.world.id)).ticket,
    {
      onState: (next, why) => {
        state.value = next;
        detail.value = why ?? "";
      },
      onWelcome: (welcome) => {
        role.value = welcome.role;
        sequence.value = welcome.seq;
      },
      onEvent: record,
      onEphemeral: (frame) => {
        const payload = frame.payload as
          | {
              tokenId?: string;
              userId?: string;
              name?: string;
              x?: number;
              y?: number;
            }
          | undefined;
        if (payload?.x === undefined || payload.y === undefined) return;

        if (frame.kind === "cursor" && payload.userId) {
          canvas.value?.showCursor({
            userId: payload.userId,
            name: payload.name ?? "",
            x: payload.x,
            y: payload.y,
          });
          return;
        }
        if (payload.tokenId) {
          canvas.value?.showGhost(payload.tokenId, payload.x, payload.y);
        }
      },
      onLatency: (milliseconds) => {
        latency.value = milliseconds;
      },
    },
  );

  session.value = connection;
  void connection.connect();
});

onBeforeUnmount(() => session.value?.close());
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <BrandMark :size="20" />
      <strong class="world">{{ world.title }}</strong>
      <span class="scene">{{ scene?.name ?? "no scene" }}</span>

      <div class="spacer"></div>

      <span class="status" :data-state="state">
        <i></i>{{ stateLabel }}
        <em v-if="latency !== null" class="mono">{{ latency }} ms</em>
      </span>
      <ThemeToggle />
      <span class="muted">{{ identity.username }} · {{ role }}</span>
      <button class="btn btn-quiet" type="button" @click="emit('leave')">Leave</button>
    </header>

    <nav class="rail" aria-label="Tools">
      <button v-for="tool in ['select', 'measure', 'ping']" :key="tool" :title="tool" type="button">
        <span aria-hidden="true">{{ tool[0]?.toUpperCase() }}</span>
        <span class="sr">{{ tool }}</span>
      </button>
      <div class="railgap"></div>
      <button v-if="isGM && scene" title="Add token" type="button" @click="addToken">+</button>
      <button
        v-if="isGM && scene"
        title="Draw walls"
        type="button"
        :aria-pressed="wallTool"
        :class="{ active: wallTool }"
        @click="wallTool = !wallTool"
      >
        W
      </button>
      <button
        v-if="isGM && scene"
        title="Draw doors"
        type="button"
        :aria-pressed="doorTool"
        :class="{ active: doorTool }"
        @click="
          doorTool = !doorTool;
          wallTool = doorTool || wallTool;
        "
      >
        D
      </button>
    </nav>

    <section class="map">
      <TabletopCanvas
        v-if="shape"
        ref="canvas"
        :scene="shape"
        :tokens="tokens"
        :walls="walls"
        :wall-tool="wallTool"
        @wall="addWall"
        @door="toggleDoor"
        @moved="moveToken"
        @dragging="previewMove"
        @pointer="broadcastPointer"
        @selected="(id) => (selected = id)"
      />
      <div v-else class="empty">
        <p class="eyebrow">no scene</p>
        <p class="muted">This world has no scene yet.</p>
        <button v-if="isGM" class="btn btn-primary" type="button" @click="createScene">
          Create a scene
        </button>
        <p v-else class="muted">Ask the game master to create one.</p>
      </div>
    </section>

    <aside class="dock">
      <div class="panel">
        <h3 class="eyebrow">
          Scenes
          <button v-if="isGM" class="btn btn-quiet add" type="button" @click="createScene">
            +
          </button>
        </h3>
        <p v-if="scenes.length === 0" class="muted">None yet.</p>
        <ul class="scenes">
          <li v-for="entry in scenes" :key="entry.id">
            <button
              type="button"
              :class="{ current: entry.id === scene?.id }"
              :disabled="!isGM && !entry.active"
              @click="isGM ? activateScene(entry) : undefined"
            >
              <span class="dot" :class="{ live: entry.active }"></span>
              {{ entry.name }}
            </button>
          </li>
        </ul>
      </div>

      <div v-if="combat?.active || isGM" class="panel">
        <h3 class="eyebrow">
          Combat
          <span v-if="combat?.active" class="round mono">round {{ combat.round }}</span>
        </h3>

        <ul v-if="combat?.active" class="order">
          <li
            v-for="(combatant, index) in combat.combatants"
            :key="combatant.id"
            :class="{ turn: index === combat.turn }"
          >
            <span class="pip" :data-disposition="combatant.disposition"></span>
            {{ combatant.name }}
            <em class="mono init">{{ combatant.initiative }}</em>
          </li>
        </ul>
        <p v-else class="muted">Not fighting.</p>

        <div v-if="isGM" class="row">
          <button
            v-if="!combat?.active"
            class="btn btn-quiet"
            type="button"
            :disabled="!scene"
            @click="startCombat"
          >
            Roll initiative
          </button>
          <template v-else>
            <button class="btn btn-primary" type="button" @click="nextTurn">Next turn</button>
            <button class="btn btn-quiet" type="button" @click="endCombat">End</button>
          </template>
        </div>
      </div>

      <div v-if="isGM" class="panel">
        <h3 class="eyebrow">
          Art
          <label class="btn btn-quiet add" :class="{ busy: uploading }">
            {{ uploading ? "…" : "+" }}
            <input type="file" accept="image/png,image/jpeg,image/gif" @change="uploadArt" />
          </label>
        </h3>

        <p class="muted target">
          Pick one for <strong>{{ artTarget }}</strong>
        </p>
        <p v-if="uploadError" class="muted warn">{{ uploadError }}</p>

        <div v-if="assets.length" class="gallery">
          <button
            v-for="asset in assets"
            :key="asset.id"
            type="button"
            class="tile"
            :title="`${asset.width} by ${asset.height}`"
            @click="useArt(asset)"
          >
            <img :src="asset.thumbnail ?? asset.url" :alt="''" loading="lazy" />
          </button>
        </div>
        <p v-else class="muted">Upload a map or a portrait.</p>

        <button class="btn btn-quiet clear" type="button" @click="clearArt">
          Clear {{ selected ? "token art" : "the map" }}
        </button>
      </div>

      <div class="panel">
        <h3 class="eyebrow">
          Characters
          <button v-if="isGM" class="btn btn-quiet add" type="button" @click="createActor">
            +
          </button>
        </h3>
        <p v-if="actors.length === 0" class="muted">None yet.</p>
        <ul class="scenes">
          <li v-for="actor in actors" :key="actor.id">
            <button type="button" @click="openSheet(actor.id)">
              <span class="dot" :class="{ live: actor.canEdit }"></span>
              {{ actor.name }}
            </button>
          </li>
        </ul>
      </div>

      <div class="panel">
        <h3 class="eyebrow">Party</h3>
        <ul>
          <li v-for="member in members" :key="member.userId">
            <span class="pip" :data-role="member.role"></span>
            {{ member.username }}
            <em class="muted">{{ member.role }}</em>
          </li>
        </ul>
        <button v-if="isGM" class="btn btn-quiet invite" type="button" @click="createInvite">
          Create invite link
        </button>
        <p v-if="inviteLink" class="mono link">{{ inviteLink }}</p>
      </div>

      <div class="panel chatwrap">
        <h3 class="eyebrow">
          Chat · seq {{ sequence }}
          <em v-if="selected" class="mono selected">{{ selected }}</em>
        </h3>
        <ChatPanel :messages="messages" :can-whisper="isGM" @post="post" @roll="roll" />
      </div>
    </aside>

    <ActorSheet
      v-for="actor in openActors"
      :key="actor.id"
      :actor="actor"
      @patch="patchActor"
      @roll="rollFromSheet"
      @close="closeSheet(actor.id)"
    />
  </div>
</template>

<style scoped>
.shell {
  height: 100%;
  display: grid;
  grid-template-columns: var(--rail) 1fr 280px;
  grid-template-rows: 44px 1fr;
  grid-template-areas:
    "top top top"
    "rail map dock";
  background: var(--chrome);
}

.topbar {
  grid-area: top;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  background: var(--chrome-raised);
  border-bottom: 1px solid var(--border);
}

.world {
  font-family: var(--cond);
  font-size: 15px;
}

.scene {
  font-size: 11px;
  color: var(--text-2);
  border: 1px solid var(--border);
  border-radius: var(--r-input);
  padding: 2px 7px;
}

.spacer {
  flex: 1;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-2);
}

.status i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-3);
}

.status[data-state="live"] i {
  background: var(--success);
}

.status[data-state="reconnecting"] i,
.status[data-state="connecting"] i {
  background: var(--attention);
}

.rail {
  grid-area: rail;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 0;
  border-inline-end: 1px solid var(--border);
}

.rail button {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: var(--r-input);
  background: none;
  color: var(--text-3);
  font-weight: 600;
  cursor: pointer;
}

.rail button:hover {
  background: var(--sunken);
  color: var(--text);
}

.rail button.active {
  background: var(--accent);
  color: var(--accent-fg);
}

.railgap {
  height: 10px;
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.map {
  grid-area: map;
  position: relative;
  display: grid;
  place-items: center;
  min-width: 0;
}

.empty {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.dock {
  grid-area: dock;
  border-inline-start: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.panel {
  padding: 10px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel.chatwrap {
  flex: 1;
  min-height: 0;
  padding: 0;
  border-bottom: 0;
}

.panel.chatwrap > h3 {
  padding: 10px 10px 0;
}

.panel h3 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selected {
  margin-inline-start: auto;
  font-style: normal;
  text-transform: none;
  letter-spacing: 0;
  color: var(--accent);
}

.panel ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.panel li {
  display: flex;
  align-items: center;
  gap: 7px;
}

.target strong {
  color: var(--text);
  font-weight: 600;
}

.warn {
  color: var(--danger);
}

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
  gap: 6px;
}

.tile {
  aspect-ratio: 1;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--r-input);
  background: var(--chrome-raised);
  overflow: hidden;
  cursor: pointer;
}

.tile:hover {
  border-color: var(--accent);
}

.tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.add input[type="file"] {
  display: none;
}

.add.busy {
  pointer-events: none;
  opacity: 0.6;
}

.clear {
  margin-block-start: 8px;
  width: 100%;
}

.panel li em {
  margin-inline-start: auto;
  font-style: normal;
  font-size: 11px;
}

.pip {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 2px solid var(--neutral);
}

.pip[data-role="gm"] {
  border-color: var(--accent);
}

.pip[data-role="player"] {
  border-color: var(--success);
}

.seq {
  color: var(--text-3);
  font-size: 11px;
  min-width: 22px;
}

.invite {
  align-self: flex-start;
}

.round {
  margin-inline-start: auto;
  color: var(--text-3);
  text-transform: none;
  letter-spacing: 0;
}

.order {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.order li {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: var(--r-input);
}

.order li.turn {
  background: color-mix(in srgb, var(--attention) 16%, transparent);
  border-color: color-mix(in srgb, var(--attention) 45%, transparent);
}

.order li.turn .init {
  color: var(--attention);
}

.init {
  margin-inline-start: auto;
  font-style: normal;
  color: var(--text-3);
  font-size: 11px;
}

.pip[data-disposition="friendly"] {
  border-color: var(--success);
}

.pip[data-disposition="hostile"] {
  border-color: var(--danger);
}

.pip[data-disposition="secret"] {
  border-color: var(--secret);
}

.row {
  display: flex;
  gap: 6px;
}

.add {
  margin-inline-start: auto;
  height: 20px;
  padding: 0 7px;
}

.scenes button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: var(--r-input);
  background: none;
  color: var(--text);
  font-size: 12px;
  text-align: start;
  cursor: pointer;
}

.scenes button:disabled {
  cursor: default;
}

.scenes button:hover:not(:disabled) {
  background: var(--sunken);
}

.scenes button.current {
  border-color: var(--accent);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1.5px solid var(--text-3);
}

.dot.live {
  background: var(--attention);
  border-color: var(--attention);
}

.link {
  font-size: 10.5px;
  word-break: break-all;
  color: var(--text-2);
}
</style>

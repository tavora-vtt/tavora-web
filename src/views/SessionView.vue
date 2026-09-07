<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { api, type Identity, type Member, type Scene, type TokenRecord, type World } from "../api/client";
import { Session, type ConnectionState, type EventFrame } from "../net/socket";
import type { SceneShape, TokenShape } from "../canvas/tabletop";
import BrandMark from "../components/BrandMark.vue";
import ThemeToggle from "../components/ThemeToggle.vue";
import TabletopCanvas from "../components/TabletopCanvas.vue";

const props = defineProps<{ identity: Identity; world: World }>();
const emit = defineEmits<{ (event: "leave"): void }>();

const state = ref<ConnectionState>("idle");
const detail = ref("");
const latency = ref<number | null>(null);
const sequence = ref(0);
const role = ref(props.world.role ?? "");
const members = ref<Member[]>([]);
const log = ref<{ seq: number; kind: string; summary: string }[]>([]);
const inviteToken = ref("");
const selected = ref<string | null>(null);

const scene = ref<Scene | null>(null);
const tokens = ref<TokenShape[]>([]);

const session = shallowRef<Session | null>(null);
const canvas = ref<InstanceType<typeof TabletopCanvas> | null>(null);

const isGM = computed(() => role.value === "gm");

const shape = computed<SceneShape | null>(() =>
  scene.value
    ? {
        width: scene.value.data.width,
        height: scene.value.data.height,
        gridSize: scene.value.data.gridSize,
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
    x: record.data?.x ?? 0,
    y: record.data?.y ?? 0,
    disposition: record.data?.disposition ?? "neutral",
  };
}

async function loadScene() {
  const list = await api.scenes(props.world.id);
  scene.value = list[0] ?? null;

  if (!scene.value) {
    tokens.value = [];
    return;
  }
  tokens.value = (await api.tokens(props.world.id, scene.value.id)).map(toShape);
}

async function createScene() {
  scene.value = await api.createScene(props.world.id, "The Chantry");
  tokens.value = [];
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

function record(event: EventFrame) {
  sequence.value = event.seq;

  const payload = event.payload as { id?: string; name?: string; data?: TokenRecord["data"] } | undefined;
  if (payload?.id && payload.data) {
    const shapeFromEvent: TokenShape = {
      id: payload.id,
      name: payload.name ?? "",
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
  await loadScene().catch(() => undefined);

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
          | { tokenId?: string; userId?: string; name?: string; x?: number; y?: number }
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
    </nav>

    <section class="map">
      <TabletopCanvas
        v-if="shape"
        ref="canvas"
        :scene="shape"
        :tokens="tokens"
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

      <div class="panel feed">
        <h3 class="eyebrow">
          World events · seq {{ sequence }}
          <em v-if="selected" class="mono selected">{{ selected }}</em>
        </h3>
        <p v-if="log.length === 0" class="muted">Nothing has happened yet.</p>
        <ul>
          <li v-for="entry in log" :key="entry.seq">
            <span class="mono seq">{{ entry.seq }}</span>
            <span>{{ entry.summary }}</span>
            <em class="muted">{{ entry.kind }}</em>
          </li>
        </ul>
      </div>
    </aside>
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

.panel.feed {
  flex: 1;
  min-height: 0;
  overflow: auto;
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

.link {
  font-size: 10.5px;
  word-break: break-all;
  color: var(--text-2);
}
</style>

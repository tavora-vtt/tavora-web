<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { api, type Identity, type Member, type World } from "../api/client";
import { Session, type ConnectionState, type EventFrame } from "../net/socket";
import BrandMark from "../components/BrandMark.vue";
import ThemeToggle from "../components/ThemeToggle.vue";

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

const session = shallowRef<Session | null>(null);

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

function summarise(event: EventFrame): string {
  const payload = event.payload as Record<string, unknown> | undefined;
  if (payload && typeof payload === "object" && "name" in payload) {
    return String(payload.name);
  }
  return event.kind;
}

function record(event: EventFrame) {
  sequence.value = event.seq;
  log.value = [{ seq: event.seq, kind: event.kind, summary: summarise(event) }, ...log.value].slice(0, 40);
}

async function loadMembers() {
  try {
    members.value = await api.members(props.world.id);
  } catch {
    members.value = [];
  }
}

async function createInvite() {
  try {
    const invite = await api.createInvite(props.world.id, "player", 0);
    inviteToken.value = invite.token ?? "";
  } catch {
    inviteToken.value = "";
  }
}

const inviteLink = computed(() =>
  inviteToken.value ? `${location.origin}/invite/${inviteToken.value}` : "",
);

onMounted(() => {
  void loadMembers();

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
      <span class="scene">no scene yet</span>

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
    </nav>

    <section class="map">
      <div class="grid"></div>
      <div class="placeholder">
        <p class="eyebrow">canvas</p>
        <p class="muted">The tabletop renderer lands next. The socket below is live.</p>
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
        <button
          v-if="role === 'gm'"
          class="btn btn-quiet invite"
          type="button"
          @click="createInvite"
        >
          Create invite link
        </button>
        <p v-if="inviteLink" class="mono link">{{ inviteLink }}</p>
      </div>

      <div class="panel feed">
        <h3 class="eyebrow">World events · seq {{ sequence }}</h3>
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
  background: var(--map-ground);
  display: grid;
  place-items: center;
}

.grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, var(--map-ink) 1px, transparent 1px),
    linear-gradient(to bottom, var(--map-ink) 1px, transparent 1px);
  background-size: 48px 48px;
  opacity: 0.6;
}

.placeholder {
  position: relative;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
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

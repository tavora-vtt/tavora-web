<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, type Identity, type World } from "./api/client";
import GateView from "./views/GateView.vue";
import WorldsView from "./views/WorldsView.vue";
import SessionView from "./views/SessionView.vue";

type Stage = "loading" | "gate" | "worlds" | "session";

const stage = ref<Stage>("loading");
const needsSetup = ref(false);
const identity = ref<Identity | null>(null);
const world = ref<World | null>(null);
const backend = ref("");

async function bootstrap() {
  try {
    const health = await api.health();
    backend.value = health.storage ?? "";
  } catch {
    backend.value = "";
  }

  try {
    identity.value = await api.me();
    stage.value = "worlds";
    return;
  } catch {
    identity.value = null;
  }

  try {
    needsSetup.value = (await api.setupState()).needsSetup;
  } catch {
    needsSetup.value = false;
  }
  stage.value = "gate";
}

function onSignedIn(user: Identity) {
  identity.value = user;
  stage.value = "worlds";
}

async function signOut() {
  await api.logout();
  identity.value = null;
  world.value = null;
  needsSetup.value = false;
  stage.value = "gate";
}

function openWorld(target: World) {
  world.value = target;
  stage.value = "session";
}

function leaveWorld() {
  world.value = null;
  stage.value = "worlds";
}

onMounted(bootstrap);
</script>

<template>
  <div v-if="stage === 'loading'" class="boot">
    <span class="eyebrow">Tavora</span>
    <p class="muted">Connecting to the server</p>
  </div>

  <GateView
    v-else-if="stage === 'gate'"
    :needs-setup="needsSetup"
    :backend="backend"
    @signed-in="onSignedIn"
  />

  <WorldsView
    v-else-if="stage === 'worlds' && identity"
    :identity="identity"
    @open="openWorld"
    @sign-out="signOut"
  />

  <SessionView
    v-else-if="stage === 'session' && identity && world"
    :identity="identity"
    :world="world"
    @leave="leaveWorld"
  />
</template>

<style scoped>
.boot {
  height: 100%;
  display: grid;
  place-content: center;
  gap: 8px;
  text-align: center;
}
</style>

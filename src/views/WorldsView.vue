<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, ApiError, type Identity, type World } from "../api/client";
import BrandMark from "../components/BrandMark.vue";
import UserMenu from "../components/UserMenu.vue";

defineProps<{ identity: Identity }>();
const emit = defineEmits<{
  (event: "open", world: World): void;
  (event: "sign-out"): void;
}>();

const worlds = ref<World[]>([]);
const loading = ref(true);
const problem = ref("");
const creating = ref(false);
const title = ref("");
const systemId = ref("wod5e");

async function load() {
  loading.value = true;
  try {
    worlds.value = await api.worlds();
  } catch (error) {
    problem.value = error instanceof ApiError ? error.messageKey : "The server is not reachable.";
  } finally {
    loading.value = false;
  }
}

async function create() {
  if (!title.value.trim()) return;
  creating.value = true;
  problem.value = "";

  try {
    const world = await api.createWorld(title.value.trim(), systemId.value);
    worlds.value = [...worlds.value, world];
    title.value = "";
  } catch (error) {
    problem.value = error instanceof ApiError ? error.messageKey : "Could not create the world.";
  } finally {
    creating.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <header class="bar">
      <BrandMark />
      <strong>Tavora</strong>
      <div class="spacer"></div>
      <UserMenu :username="identity.username" leave-label="Sign out" @leave="emit('sign-out')" />
    </header>

    <main>
      <section>
        <h2>Your tables</h2>

        <p v-if="loading" class="muted">Loading</p>
        <p v-else-if="worlds.length === 0" class="muted empty">
          No tables yet. Create one below, or open an invite link.
        </p>

        <ul v-else class="worlds">
          <li v-for="world in worlds" :key="world.id">
            <button type="button" @click="emit('open', world)">
              <span class="title">{{ world.title }}</span>
              <span class="meta mono">{{ world.systemId }}</span>
              <span class="role">{{ world.role }}</span>
            </button>
          </li>
        </ul>
      </section>

      <section>
        <h2>New world</h2>
        <form class="create" @submit.prevent="create">
          <div class="field">
            <label for="title">Title</label>
            <input id="title" v-model="title" placeholder="Blood and Rain" required />
          </div>
          <div class="field">
            <label for="system">System</label>
            <select id="system" v-model="systemId">
              <option value="wod5e">World of Darkness 5e</option>
              <option value="dnd5e">D&amp;D 5e (2024)</option>
            </select>
          </div>
          <button class="btn btn-primary" type="submit" :disabled="creating">Create</button>
        </form>
        <p v-if="problem" class="notice">{{ problem }}</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 10px;
  height: 40px;
  background: var(--chrome);
  border-bottom: 1px solid var(--border-subtle);
}

.bar strong {
  font-family: var(--cond);
  font-size: 14px;
}

.spacer {
  flex: 1;
}

main {
  flex: 1;
  overflow: auto;
  padding: 28px 20px 48px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
}

h2 {
  font-size: 18px;
  margin-bottom: 12px;
}

.empty {
  padding: 20px;
  border: 1px dashed var(--border);
  border-radius: var(--r-card);
  text-align: center;
}

.worlds {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.worlds button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--content);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  cursor: pointer;
  text-align: start;
  transition: border-color var(--t-state);
}

.worlds button:hover {
  border-color: var(--accent);
}

.title {
  font-weight: 600;
  font-size: 14px;
}

.meta {
  color: var(--text-3);
  font-size: 11px;
}

.role {
  margin-inline-start: auto;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
}

.create {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.create .field {
  flex: 1;
  min-width: 160px;
}

select {
  height: var(--h-ctl);
  padding: 0 8px;
  border-radius: var(--r-input);
  border: 1px solid var(--border);
  background: var(--sunken);
}
</style>

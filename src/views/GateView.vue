<script setup lang="ts">
import { computed, ref } from "vue";
import { api, ApiError, type Identity } from "../api/client";
import BrandMark from "../components/BrandMark.vue";

const props = defineProps<{ needsSetup: boolean }>();
const emit = defineEmits<{ (event: "signed-in", identity: Identity): void }>();

const username = ref("");
const password = ref("");
const busy = ref(false);
const problem = ref("");

const heading = computed(() => (props.needsSetup ? "Set up this server" : "Sign in"));
const action = computed(() => (props.needsSetup ? "Create administrator" : "Sign in"));

const explanations: Record<string, string> = {
  "core.auth.invalidCredentials": "That username and password do not match.",
  "core.auth.tooManyAttempts": "Too many attempts. Wait a few minutes and try again.",
  "core.auth.passwordTooShort": "Pick a password of at least 10 characters.",
  "core.auth.usernameTaken": "That username is taken.",
  "core.setup.alreadyDone": "This server already has an administrator.",
};

async function submit() {
  problem.value = "";
  busy.value = true;

  try {
    const identity = props.needsSetup
      ? await api.setup(username.value, password.value)
      : await api.login(username.value, password.value);
    emit("signed-in", identity);
  } catch (error) {
    problem.value =
      error instanceof ApiError
        ? (explanations[error.messageKey] ?? error.messageKey)
        : "The server is not reachable.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="gate">
    <form class="card" @submit.prevent="submit">
      <header>
        <BrandMark :size="40" />
        <div>
          <h1>Tavora</h1>
          <p class="muted">{{ heading }}</p>
        </div>
      </header>

      <p v-if="needsSetup" class="muted intro">This first account administers the server.</p>

      <div class="field">
        <label for="username">Username</label>
        <input id="username" v-model="username" autocomplete="username" autofocus required />
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          :autocomplete="needsSetup ? 'new-password' : 'current-password'"
          required
        />
      </div>

      <p v-if="problem" class="notice">{{ problem }}</p>

      <button class="btn btn-primary" type="submit" :disabled="busy">
        {{ busy ? "Working" : action }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.gate {
  height: 100%;
  display: grid;
  place-items: center;
  padding: 24px;
}

.card {
  width: min(380px, 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px;
  background: var(--content);
  border: 1px solid var(--border);
  border-radius: var(--r-win);
  box-shadow: var(--shadow);
}

header {
  display: flex;
  align-items: center;
  gap: 12px;
}

h1 {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.1;
}

.intro {
  font-size: 12.5px;
}
</style>

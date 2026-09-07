<script setup lang="ts">
import { onMounted, ref } from "vue";

type Theme = "light" | "dark" | "system";

const theme = ref<Theme>("system");

function apply(next: Theme) {
  theme.value = next;
  if (next === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", next);
  }
  try {
    localStorage.setItem("tavora-theme", next);
  } catch {
    // a viewer with site data blocked simply keeps the system theme
  }
}

onMounted(() => {
  try {
    const stored = localStorage.getItem("tavora-theme") as Theme | null;
    if (stored) apply(stored);
  } catch {
    // ignore
  }
});
</script>

<template>
  <div class="seg" role="group" aria-label="Theme">
    <button
      v-for="option in ['light', 'dark', 'system'] as const"
      :key="option"
      type="button"
      :aria-pressed="theme === option"
      @click="apply(option)"
    >
      {{ option }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--sunken);
  border: 1px solid var(--border);
  border-radius: 6px;
}

button {
  border: 0;
  background: none;
  border-radius: 4px;
  padding: 3px 7px;
  font-size: 11px;
  color: var(--text-2);
  cursor: pointer;
  text-transform: capitalize;
}

button[aria-pressed="true"] {
  background: var(--accent);
  color: var(--accent-fg);
}
</style>

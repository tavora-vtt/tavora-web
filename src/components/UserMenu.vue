<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { density, setDensity, setTheme, theme, type Density, type Theme } from "../ui/preferences";

const props = defineProps<{ username: string; role?: string; leaveLabel: string }>();
const emit = defineEmits<{ (event: "leave"): void }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const DENSITIES: { value: Density; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

function onDocumentPointer(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) {
    open.value = false;
  }
}

function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") open.value = false;
}

onMounted(() => {
  window.addEventListener("pointerdown", onDocumentPointer);
  window.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onDocumentPointer);
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div ref="root" class="usermenu">
    <button
      class="trigger"
      type="button"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      <span class="initial" aria-hidden="true">{{ props.username.charAt(0).toUpperCase() }}</span>
      <span class="name">{{ props.username }}</span>
      <span v-if="props.role" class="role">{{ props.role }}</span>
    </button>

    <div v-if="open" class="sheet" role="menu">
      <p class="eyebrow">Appearance</p>
      <div class="seg" role="group" aria-label="Theme">
        <button
          v-for="option in THEMES"
          :key="option.value"
          type="button"
          :aria-pressed="theme === option.value"
          @click="setTheme(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <div class="seg" role="group" aria-label="Density">
        <button
          v-for="option in DENSITIES"
          :key="option.value"
          type="button"
          :aria-pressed="density === option.value"
          @click="setDensity(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <hr />

      <button class="leave" type="button" @click="emit('leave')">{{ props.leaveLabel }}</button>
    </div>
  </div>
</template>

<style scoped>
.usermenu {
  position: relative;
}

.trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 6px 0 3px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: none;
  color: var(--text-2);
  cursor: pointer;
}

.trigger:hover,
.trigger[aria-expanded="true"] {
  border-color: var(--border);
  background: var(--sunken);
  color: var(--text);
}

.initial {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
}

.name {
  font-size: 12px;
}

.role {
  font-size: 10px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.sheet {
  position: absolute;
  inset-inline-end: 0;
  inset-block-start: calc(100% + 6px);
  z-index: 40;
  width: 208px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  background: var(--content);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  box-shadow: var(--shadow);
}

.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--sunken);
  border-radius: var(--r-input);
}

.seg button {
  flex: 1;
  border: 0;
  background: none;
  border-radius: 3px;
  padding: 4px 0;
  font-size: 11px;
  color: var(--text-2);
  cursor: pointer;
}

.seg button[aria-pressed="true"] {
  background: var(--chrome-raised);
  color: var(--text);
  box-shadow: 0 0 0 1px var(--border);
}

hr {
  margin: 2px 0;
  border: 0;
  border-top: 1px solid var(--border-subtle);
}

.leave {
  border: 0;
  background: none;
  color: var(--text);
  text-align: start;
  padding: 5px 4px;
  border-radius: var(--r-input);
  cursor: pointer;
  font-size: 12px;
}

.leave:hover {
  background: var(--sunken);
}
</style>

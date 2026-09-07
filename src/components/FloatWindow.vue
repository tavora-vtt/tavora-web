<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(defineProps<{ title: string; memoryKey: string; width?: number }>(), {
  width: 340,
});
const emit = defineEmits<{ (event: "close"): void }>();

const position = ref({ x: 120, y: 90 });
const dragging = ref(false);
let offset = { x: 0, y: 0 };

function clamp(x: number, y: number) {
  const margin = 40;
  return {
    x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - margin)),
    y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - margin)),
  };
}

function remember() {
  try {
    localStorage.setItem(`tavora-window-${props.memoryKey}`, JSON.stringify(position.value));
  } catch {
    // a viewer with site data blocked simply loses the remembered spot
  }
}

function startDrag(event: PointerEvent) {
  dragging.value = true;
  offset = { x: event.clientX - position.value.x, y: event.clientY - position.value.y };
  window.addEventListener("pointermove", onDrag);
  window.addEventListener("pointerup", stopDrag);
}

function onDrag(event: PointerEvent) {
  position.value = clamp(event.clientX - offset.x, event.clientY - offset.y);
}

function stopDrag() {
  dragging.value = false;
  window.removeEventListener("pointermove", onDrag);
  window.removeEventListener("pointerup", stopDrag);
  remember();
}

function onResize() {
  position.value = clamp(position.value.x, position.value.y);
}

onMounted(() => {
  try {
    const stored = localStorage.getItem(`tavora-window-${props.memoryKey}`);
    if (stored) {
      const parsed = JSON.parse(stored) as { x: number; y: number };
      position.value = clamp(parsed.x, parsed.y);
    }
  } catch {
    // fall back to the default spot
  }
  window.addEventListener("resize", onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  window.removeEventListener("pointermove", onDrag);
  window.removeEventListener("pointerup", stopDrag);
});
</script>

<template>
  <div
    class="window"
    :class="{ dragging }"
    :style="{ left: `${position.x}px`, top: `${position.y}px`, width: `${width}px` }"
    role="dialog"
    :aria-label="title"
  >
    <header @pointerdown.prevent="startDrag">
      <strong>{{ title }}</strong>
      <button
        class="close"
        type="button"
        aria-label="Close"
        @pointerdown.stop
        @click="emit('close')"
      >
        ×
      </button>
    </header>
    <div class="body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.window {
  position: fixed;
  z-index: 30;
  background: var(--content);
  border: 1px solid var(--border);
  border-radius: var(--r-win);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  max-height: min(80vh, 720px);
  overflow: hidden;
}

.window.dragging {
  user-select: none;
}

header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--chrome-raised);
  border-bottom: 1px solid var(--border);
  cursor: grab;
  touch-action: none;
}

.window.dragging header {
  cursor: grabbing;
}

header strong {
  font-family: var(--cond);
  font-size: 14px;
}

.close {
  margin-inline-start: auto;
  border: 0;
  background: none;
  color: var(--text-3);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}

.close:hover {
  color: var(--text);
}

.body {
  overflow: auto;
  padding: 12px;
}
</style>

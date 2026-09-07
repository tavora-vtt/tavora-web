<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { Tabletop, type CursorShape, type SceneShape, type TokenShape } from "../canvas/tabletop";

const props = defineProps<{ scene: SceneShape | null; tokens: TokenShape[] }>();
const emit = defineEmits<{
  (event: "moved", id: string, x: number, y: number): void;
  (event: "dragging", id: string, x: number, y: number): void;
  (event: "selected", id: string | null): void;
  (event: "pointer", x: number, y: number): void;
}>();

const host = ref<HTMLElement | null>(null);
const table = shallowRef<Tabletop | null>(null);
const renderer = ref("");
const zoom = ref(1);

defineExpose({
  applyRemote(token: TokenShape) {
    table.value?.applyRemote(token);
  },
  showGhost(id: string, x: number, y: number) {
    table.value?.showGhost(id, x, y);
  },
  showCursor(cursor: CursorShape) {
    table.value?.showCursor(cursor);
  },
  dropCursor(userId: string) {
    table.value?.dropCursor(userId);
  },
  fit() {
    table.value?.fit();
  },
});

let observer: ResizeObserver | null = null;
let themeWatcher: MutationObserver | null = null;

onMounted(async () => {
  if (!host.value) return;

  const instance = new Tabletop({
    onMoved: (id, x, y) => emit("moved", id, x, y),
    onDragging: (id, x, y) => emit("dragging", id, x, y),
    onSelected: (id) => emit("selected", id),
    onPointer: (x, y) => emit("pointer", x, y),
    onView: (next) => {
      zoom.value = next;
    },
  });

  await instance.mount(host.value);
  table.value = instance;
  renderer.value = instance.renderer;

  if (props.scene) instance.setScene(props.scene);
  instance.setTokens(props.tokens);

  observer = new ResizeObserver(() => instance.fit());
  observer.observe(host.value);

  themeWatcher = new MutationObserver(() => instance.repaint());
  themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
});

watch(
  () => props.scene,
  (scene) => {
    if (scene) table.value?.setScene(scene);
  },
);

watch(
  () => props.tokens,
  (tokens) => table.value?.setTokens(tokens),
  { deep: false },
);

onBeforeUnmount(() => {
  observer?.disconnect();
  themeWatcher?.disconnect();
  table.value?.destroy();
});
</script>

<template>
  <div class="stage">
    <div ref="host" class="surface"></div>
    <div class="controls">
      <button class="btn btn-quiet" type="button" title="Fit the scene" @click="table?.fit()">
        Fit
      </button>
      <span class="badge mono">{{ Math.round(zoom * 100) }}%</span>
      <span v-if="renderer" class="badge mono">{{ renderer }}</span>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--canvas);
}

.surface {
  position: absolute;
  inset: 0;
}

.controls {
  position: absolute;
  inset-block-end: 8px;
  inset-inline-end: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.controls .btn {
  height: 22px;
  padding: 0 8px;
  font-size: 11px;
  background: var(--chrome-raised);
  border-color: var(--border);
}

.badge {
  font-size: 10px;
  color: var(--text-3);
  background: var(--chrome-raised);
  border: 1px solid var(--border);
  border-radius: var(--r-input);
  padding: 2px 6px;
  pointer-events: none;
}
</style>

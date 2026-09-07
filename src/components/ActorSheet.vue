<script setup lang="ts">
import { computed } from "vue";
import FloatWindow from "./FloatWindow.vue";

export interface Tracker {
  superficial: number;
  aggravated: number;
  max: number;
}

export interface ActorData {
  clan?: string;
  hunger?: number;
  attributes?: Record<string, number>;
  health?: Tracker;
  willpower?: Tracker;
  notes?: string;
}

export interface Actor {
  id: string;
  name: string;
  subtype: string;
  data: ActorData;
  canEdit: boolean;
}

const props = defineProps<{ actor: Actor }>();
const emit = defineEmits<{
  (event: "patch", id: string, set: Record<string, unknown>): void;
  (event: "roll", expression: string, reason: string): void;
  (event: "close"): void;
}>();

const GROUPS: { label: string; keys: string[] }[] = [
  { label: "Physical", keys: ["strength", "dexterity", "stamina"] },
  { label: "Social", keys: ["charisma", "manipulation", "composure"] },
  { label: "Mental", keys: ["intelligence", "wits", "resolve"] },
];

const attributes = computed(() => props.actor.data.attributes ?? {});
const hunger = computed(() => props.actor.data.hunger ?? 0);
const health = computed<Tracker>(
  () => props.actor.data.health ?? { superficial: 0, aggravated: 0, max: 0 },
);
const willpower = computed<Tracker>(
  () => props.actor.data.willpower ?? { superficial: 0, aggravated: 0, max: 0 },
);

function label(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function setAttribute(key: string, value: number) {
  if (!props.actor.canEdit) return;
  const current = attributes.value[key] ?? 0;
  emit("patch", props.actor.id, { [`attributes.${key}`]: current === value ? value - 1 : value });
}

function setHunger(value: number) {
  if (!props.actor.canEdit) return;
  emit("patch", props.actor.id, { hunger: hunger.value === value ? value - 1 : value });
}

function boxState(tracker: Tracker, index: number): "aggravated" | "superficial" | "empty" {
  if (index < tracker.aggravated) return "aggravated";
  if (index < tracker.aggravated + tracker.superficial) return "superficial";
  return "empty";
}

function cycleBox(path: "health" | "willpower", tracker: Tracker, index: number) {
  if (!props.actor.canEdit) return;

  const state = boxState(tracker, index);
  const next = { superficial: tracker.superficial, aggravated: tracker.aggravated };

  if (state === "empty") {
    next.superficial += 1;
  } else if (state === "superficial") {
    next.superficial = Math.max(0, next.superficial - 1);
    next.aggravated += 1;
  } else {
    next.aggravated = Math.max(0, next.aggravated - 1);
  }

  const total = next.superficial + next.aggravated;
  if (total > tracker.max) return;

  emit("patch", props.actor.id, {
    [`${path}.superficial`]: next.superficial,
    [`${path}.aggravated`]: next.aggravated,
  });
}

function rollPool(key: string) {
  const rating = attributes.value[key] ?? 0;
  if (rating < 1) return;
  emit("roll", `${rating}d10`, `${label(key)} pool`);
}
</script>

<template>
  <FloatWindow
    :title="actor.name"
    :memory-key="`sheet-${actor.subtype}`"
    :width="360"
    @close="emit('close')"
  >
    <div class="sheet">
      <p v-if="!actor.canEdit" class="readonly">You can read this sheet but not change it.</p>

      <section class="hunger">
        <span class="eyebrow">Hunger</span>
        <div class="pips">
          <button
            v-for="value in 5"
            :key="value"
            type="button"
            class="pip"
            :class="{ on: value <= hunger }"
            :disabled="!actor.canEdit"
            :aria-label="`Hunger ${value}`"
            @click="setHunger(value)"
          ></button>
        </div>
      </section>

      <section v-for="group in GROUPS" :key="group.label">
        <span class="eyebrow">{{ group.label }}</span>
        <div v-for="key in group.keys" :key="key" class="trait">
          <button class="name" type="button" :disabled="!actor.canEdit" @click="rollPool(key)">
            {{ label(key) }}
          </button>
          <div class="dots">
            <button
              v-for="value in 5"
              :key="value"
              type="button"
              class="dot"
              :class="{ on: value <= (attributes[key] ?? 0) }"
              :disabled="!actor.canEdit"
              :aria-label="`${label(key)} ${value}`"
              @click="setAttribute(key, value)"
            ></button>
          </div>
        </div>
      </section>

      <section
        v-for="entry in [
          { path: 'health' as const, tracker: health },
          { path: 'willpower' as const, tracker: willpower },
        ]"
        :key="entry.path"
      >
        <span class="eyebrow">{{ entry.path }}</span>
        <div class="boxes">
          <button
            v-for="index in entry.tracker.max"
            :key="index"
            type="button"
            class="box"
            :data-state="boxState(entry.tracker, index - 1)"
            :disabled="!actor.canEdit"
            :aria-label="`${entry.path} ${index}`"
            @click="cycleBox(entry.path, entry.tracker, index - 1)"
          >
            {{
              boxState(entry.tracker, index - 1) === "aggravated"
                ? "x"
                : boxState(entry.tracker, index - 1) === "superficial"
                  ? "/"
                  : ""
            }}
          </button>
        </div>
      </section>
    </div>
  </FloatWindow>
</template>

<style scoped>
.sheet {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.readonly {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-2);
  border: 1px solid var(--border);
  border-radius: var(--r-input);
  padding: 6px 8px;
}

section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hunger {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}

.trait {
  display: flex;
  align-items: center;
  gap: 10px;
}

.name {
  border: 0;
  background: none;
  color: var(--text);
  font-size: 12.5px;
  padding: 0;
  cursor: pointer;
  text-align: start;
}

.name:hover:not(:disabled) {
  color: var(--accent);
}

.name:disabled {
  cursor: default;
}

.dots,
.pips {
  display: flex;
  gap: 4px;
  margin-inline-start: auto;
}

.dot,
.pip {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  background: none;
  padding: 0;
  cursor: pointer;
}

.dot:disabled,
.pip:disabled,
.box:disabled {
  cursor: default;
}

.dot.on {
  background: var(--accent);
  border-color: var(--accent);
}

.pip.on {
  background: var(--danger);
  border-color: var(--danger);
}

.boxes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.box {
  width: 18px;
  height: 18px;
  border-radius: 2px;
  border: 1.5px solid var(--border);
  background: none;
  font: 700 11px/1 var(--mono);
  color: var(--text-3);
  cursor: pointer;
  padding: 0;
}

.box[data-state="superficial"] {
  border-color: var(--attention);
  color: var(--attention);
}

.box[data-state="aggravated"] {
  border-color: var(--danger);
  color: var(--danger);
}
</style>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

export interface Die {
  faces: number;
  value: number;
  kept: boolean;
}

export interface RollTerm {
  sign: number;
  expression: string;
  dice?: Die[];
  constant?: number;
  subtotal: number;
}

export interface RollResult {
  expression: string;
  terms: RollTerm[];
  total: number;
}

export interface ChatMessage {
  id: string;
  seq: number;
  authorId: string;
  author: string;
  at: string;
  text?: string;
  key?: string;
  params?: Record<string, unknown>;
  roll?: RollResult;
  audience: string;
  reason?: string;
}

const props = defineProps<{ messages: ChatMessage[]; canWhisper: boolean }>();
const emit = defineEmits<{
  (event: "post", text: string, audience: string): void;
  (event: "roll", expression: string, reason: string, audience: string): void;
}>();

const draft = ref("");
const whisper = ref(false);
const feed = ref<HTMLElement | null>(null);

const PHRASES: Record<string, (params: Record<string, unknown>) => string> = {
  "core.chat.rolled": (params) => `rolled ${params.expression}`,
};

function render(message: ChatMessage): string {
  if (message.text) return message.text;
  if (message.key) {
    const phrase = PHRASES[message.key];
    return phrase ? phrase(message.params ?? {}) : message.key;
  }
  return "";
}

function submit() {
  const value = draft.value.trim();
  if (!value) return;

  const audience = whisper.value && props.canWhisper ? "gm" : "public";

  if (value.startsWith("/r ") || value.startsWith("/roll ")) {
    const expression = value.replace(/^\/(r|roll)\s+/, "");
    emit("roll", expression, "", audience);
  } else {
    emit("post", value, audience);
  }
  draft.value = "";
}

function quickRoll(expression: string) {
  emit("roll", expression, "", whisper.value && props.canWhisper ? "gm" : "public");
}

function timeOf(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    if (feed.value) feed.value.scrollTop = feed.value.scrollHeight;
  },
);
</script>

<template>
  <div class="chat">
    <div ref="feed" class="feed">
      <p v-if="messages.length === 0" class="muted">Nothing said yet.</p>

      <article v-for="message in messages" :key="message.id" :data-whisper="message.audience === 'gm'">
        <header>
          <strong>{{ message.author }}</strong>
          <span v-if="message.audience === 'gm'" class="whisper-tag">to the table staff</span>
          <time class="mono">{{ timeOf(message.at) }}</time>
        </header>

        <p class="line">{{ render(message) }}</p>

        <div v-if="message.roll" class="roll">
          <div class="dice">
            <template v-for="(term, termIndex) in message.roll.terms" :key="termIndex">
              <span
                v-for="(die, dieIndex) in term.dice ?? []"
                :key="dieIndex"
                class="die mono"
                :class="{ dropped: !die.kept }"
                :title="`d${die.faces}`"
              >
                {{ die.value }}
              </span>
              <span v-if="term.constant !== undefined" class="constant mono">
                {{ term.sign < 0 ? "-" : "+" }}{{ term.constant }}
              </span>
            </template>
          </div>
          <span class="total mono">{{ message.roll.total }}</span>
        </div>
      </article>
    </div>

    <form class="composer" @submit.prevent="submit">
      <div class="quick">
        <button
          v-for="expression in ['1d20', '4d6kh3', '2d6+3']"
          :key="expression"
          class="btn btn-quiet"
          type="button"
          @click="quickRoll(expression)"
        >
          {{ expression }}
        </button>
        <label v-if="canWhisper" class="whisper">
          <input v-model="whisper" type="checkbox" />
          staff only
        </label>
      </div>

      <div class="row">
        <input v-model="draft" placeholder="Say something, or /r 1d20" />
        <button class="btn btn-primary" type="submit">Send</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.feed {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

article {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

article[data-whisper="true"] {
  border-inline-start: 2px solid var(--attention);
  padding-inline-start: 8px;
}

header {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11px;
}

header strong {
  font-size: 12px;
}

.whisper-tag {
  color: var(--attention);
  font-size: 10px;
}

time {
  margin-inline-start: auto;
  color: var(--text-3);
  font-size: 10px;
}

.line {
  margin: 0;
  font-size: 12.5px;
}

.roll {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-block-start: 2px;
}

.dice {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.die {
  min-width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 600;
  border-radius: var(--r-input);
  background: var(--accent);
  color: var(--accent-fg);
}

.die.dropped {
  background: var(--sunken);
  color: var(--text-3);
  border: 1px solid var(--border);
  text-decoration: line-through;
}

.constant {
  font-size: 11px;
  color: var(--text-2);
  align-self: center;
}

.total {
  margin-inline-start: auto;
  font-size: 16px;
  font-weight: 600;
}

.composer {
  border-block-start: 1px solid var(--border);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quick {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
}

.quick .btn {
  height: 22px;
  padding: 0 8px;
  font-size: 11px;
  font-family: var(--mono);
}

.whisper {
  margin-inline-start: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-2);
}

.row {
  display: flex;
  gap: 6px;
}

.row input {
  flex: 1;
  height: var(--h-ctl);
  padding: 0 9px;
  border-radius: var(--r-input);
  border: 1px solid var(--border);
  background: var(--sunken);
  min-width: 0;
}
</style>

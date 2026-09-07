<script setup lang="ts">
import { onMounted, ref } from "vue";

const health = ref<string>("checking");

onMounted(async () => {
  try {
    const response = await fetch("/healthz");
    health.value = response.ok ? "ok" : `http ${response.status}`;
  } catch {
    health.value = "unreachable";
  }
});
</script>

<template>
  <main>
    <h1>Tavora</h1>
    <p>Server: {{ health }}</p>
  </main>
</template>

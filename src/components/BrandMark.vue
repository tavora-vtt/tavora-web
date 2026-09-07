<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 28 });
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 40 40" aria-hidden="true">
    <ellipse cx="20" cy="28" rx="16" ry="7" fill="none" stroke="var(--accent)" stroke-width="2.4" />
    <path d="M13 28V16a7 7 0 0114 0v12" fill="none" stroke="var(--accent)" stroke-width="2.4" />
    <path
      d="M17.5 28v-11a2.5 2.5 0 015 0v11"
      fill="none"
      stroke="var(--attention)"
      stroke-width="2.4"
    />
  </svg>
</template>

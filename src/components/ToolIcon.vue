<script setup lang="ts">
defineProps<{ name: keyof typeof PATHS }>();

/**
 * One stroke set, 1.5 px on a 20 px grid, as the design system requires. Icons never carry
 * meaning alone: every rail button pairs one with a tooltip and an accessible name.
 */
const PATHS = {
  select: "M5 3.5 L14.5 10.2 L10.1 11.1 L12.4 15.6 L10.6 16.5 L8.4 12 L5 15 Z",
  measure: "M3 12.5 L12.5 3 L17 7.5 L7.5 17 Z M6.5 9 L8.5 11 M9.5 6 L11.5 8 M12.5 3 L14.5 5",
  ping: "M10 10 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0 M10 5.5 a4.5 4.5 0 0 1 0 9 M10 5.5 a4.5 4.5 0 0 0 0 9",
  token: "M10 4.5 a5.5 5.5 0 1 0 0 11 a5.5 5.5 0 1 0 0 -11 M10 7.5 v5 M7.5 10 h5",
  wall: "M3 5.5 h14 M3 10 h14 M3 14.5 h14 M8 5.5 v4.5 M13 10 v4.5",
  door: "M5 16.5 V4.5 l7 -1.5 v14.5 Z M12 16.5 h3 V5.5 M10 10.5 v1.5",
} as const;
</script>

<template>
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
    <path
      :d="PATHS[name]"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

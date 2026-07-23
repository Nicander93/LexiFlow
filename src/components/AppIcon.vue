<script setup lang="ts">
defineProps<{
  name:
    | "translate" | "sparkle" | "history" | "settings" | "info"
    | "copy" | "stop" | "refresh" | "trash" | "search"
    | "server" | "keyboard" | "shield" | "chevron" | "check";
  size?: number;
}>();
</script>

<template>
  <svg
    class="app-icon"
    :width="size ?? 20"
    :height="size ?? 20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'translate'">
      <path d="M4 5h9M8.5 3v2M6 5c.5 3.1 2.2 5.5 5.1 7.2" />
      <path d="M12 7c-.9 2.9-3.5 5.6-7 7M14 19l3-7 3 7M15.2 16.2h3.6" />
    </template>
    <template v-else-if="name === 'sparkle'">
      <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" />
      <path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
      <path d="m5.5 14 .5 1.5 1.5.5-1.5.5L5.5 18 5 16.5 3.5 16l1.5-.5.5-1.5Z" />
    </template>
    <template v-else-if="name === 'history'">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.2-5.7L3.5 8.5" /><path d="M3.5 4.5v4h4" />
      <path d="M12 7.5V12l3 1.8" />
    </template>
    <template v-else-if="name === 'settings'">
      <path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h8M16 18h4" />
      <circle cx="16" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="14" cy="18" r="2" />
    </template>
    <template v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
    </template>
    <template v-else-if="name === 'copy'">
      <rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </template>
    <template v-else-if="name === 'stop'">
      <circle cx="12" cy="12" r="9" /><rect x="9" y="9" width="6" height="6" rx="1" />
    </template>
    <template v-else-if="name === 'refresh'">
      <path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 9a7 7 0 0 1 11.7-2L20 12M4 12l2.2 5a7 7 0 0 0 11.7-2" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" />
    </template>
    <template v-else-if="name === 'server'">
      <rect x="4" y="4" width="16" height="6" rx="2" /><rect x="4" y="14" width="16" height="6" rx="2" /><path d="M8 7h.01M8 17h.01M12 7h5M12 17h5" />
    </template>
    <template v-else-if="name === 'keyboard'">
      <rect x="3" y="6" width="18" height="12" rx="3" /><path d="M7 10h.01M11 10h.01M15 10h.01M18 10h.01M7 14h10" />
    </template>
    <template v-else-if="name === 'shield'">
      <path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" />
    </template>
    <template v-else-if="name === 'chevron'"><path d="m9 6 6 6-6 6" /></template>
    <template v-else><path d="m5 12 4 4L19 6" /></template>
  </svg>
</template>

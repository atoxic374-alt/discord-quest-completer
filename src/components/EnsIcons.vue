<script setup lang="ts">
defineProps<{ name: string; class?: string; size?: number }>();
</script>

<template>
  <!-- Gamepad -->
  <svg v-if="name === 'gamepad'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="6"/>
    <path d="M6 12h4M8 10v4"/>
    <circle cx="16" cy="11" r="1" fill="currentColor" stroke="none"/>
    <circle cx="18" cy="13" r="1" fill="currentColor" stroke="none"/>
  </svg>
  <!-- Search -->
  <svg v-else-if="name === 'search'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="7"/>
    <path d="M20 20l-4-4"/>
  </svg>
  <!-- Trophy -->
  <svg v-else-if="name === 'trophy'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 2h12v6a6 6 0 0 1-12 0V2z"/>
    <path d="M6 4H3a2 2 0 0 0 0 4h3"/>
    <path d="M18 4h3a2 2 0 0 1 0 4h-3"/>
    <path d="M12 14v4M8 22h8"/>
    <line x1="12" y1="14" x2="12" y2="18"/>
  </svg>
  <!-- Terminal/Log -->
  <svg v-else-if="name === 'terminal'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="4 17 10 11 4 5"/>
    <line x1="12" y1="19" x2="20" y2="19"/>
  </svg>
  <!-- Plug/Connect -->
  <svg v-else-if="name === 'plug'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22V12"/>
    <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
    <rect x="7" y="2" width="3" height="6" rx="1"/>
    <rect x="14" y="2" width="3" height="6" rx="1"/>
  </svg>
  <!-- Play -->
  <svg v-else-if="name === 'play'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="5,3 19,12 5,21"/>
  </svg>
  <!-- Stop/Square -->
  <svg v-else-if="name === 'stop'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
  </svg>
  <!-- Warning -->
  <svg v-else-if="name === 'warning'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
  <!-- Check -->
  <svg v-else-if="name === 'check'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
  <!-- X / Close -->
  <svg v-else-if="name === 'x'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
  <!-- Plus -->
  <svg v-else-if="name === 'plus'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
  <!-- Refresh -->
  <svg v-else-if="name === 'refresh'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
  <!-- Eye -->
  <svg v-else-if="name === 'eye'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
  <!-- Eye off -->
  <svg v-else-if="name === 'eye-off'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
  <!-- Chevron down -->
  <svg v-else-if="name === 'chevron-down'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
  <!-- Chevron up -->
  <svg v-else-if="name === 'chevron-up'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="18 15 12 9 6 15"/>
  </svg>
  <!-- Gift -->
  <svg v-else-if="name === 'gift'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 12 20 22 4 22 4 12"/>
    <rect x="2" y="7" width="20" height="5"/>
    <line x1="12" y1="22" x2="12" y2="7"/>
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
  </svg>
  <!-- Timer -->
  <svg v-else-if="name === 'timer'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="13" r="8"/>
    <path d="M12 9v4l2 2"/>
    <path d="M5 3L2 6M22 6l-3-3M9 3h6"/>
  </svg>
  <!-- Trash -->
  <svg v-else-if="name === 'trash'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
  <!-- Discord icon -->
  <svg v-else-if="name === 'discord'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
  <!-- Instagram icon -->
  <svg v-else-if="name === 'instagram'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5"/>
    <circle cx="12" cy="12" r="4"/>
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
  </svg>
  <!-- Stats/Chart -->
  <svg v-else-if="name === 'chart'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6"  y1="20" x2="6"  y2="14"/>
    <line x1="2"  y1="20" x2="22" y2="20"/>
  </svg>
  <!-- Verified badge -->
  <svg v-else-if="name === 'verified'" :width="size??16" :height="size??16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2l2.4 3.2 3.6-1.6-.8 3.8 3.8 1.2-2.2 3 2.2 3-3.8 1.2.8 3.8-3.6-1.6L12 22l-2.4-3.2-3.6 1.6.8-3.8-3.8-1.2 2.2-3-2.2-3 3.8-1.2-.8-3.8 3.6 1.6z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>
  <!-- Info -->
  <svg v-else-if="name === 'info'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="8"/>
    <line x1="12" y1="12" x2="12" y2="16"/>
  </svg>
  <!-- Key -->
  <svg v-else-if="name === 'key'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="7.5" cy="15.5" r="5.5"/>
    <path d="M21 2l-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>
  </svg>
  <!-- User/Avatar placeholder -->
  <svg v-else-if="name === 'user'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
  <!-- Library / book -->
  <svg v-else-if="name === 'library'" :width="size??18" :height="size??18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
</template>

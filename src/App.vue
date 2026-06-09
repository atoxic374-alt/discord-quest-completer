<script setup lang="ts">
import MainLayout from './components/MainLayout.vue';
import HomeView   from './pages/HomeView.vue';
import QuestsView from './pages/QuestsView.vue';
import Playground from './pages/Playground.vue';
import { useGlobalState, Pages } from './composables/app-state';

const { page } = useGlobalState();
</script>

<template>
  <MainLayout>
    <HomeView    v-if="page === Pages.HOME" />
    <QuestsView  v-else-if="page === Pages.QUESTS" />
    <Playground  v-else-if="page === Pages.PLAYGROUND" />
  </MainLayout>
</template>

<script setup lang="ts">
import MainLayout from './components/MainLayout.vue';
import { Pages, useGlobalState } from './composables/app-state';
import HomeView from './pages/HomeView.vue';
import QuestsView from './pages/QuestsView.vue';
import Playground from './pages/Playground.vue';

const { page } = useGlobalState();
</script>

<template>
  <MainLayout>
    <HomeView    v-show="page === Pages.HOME"/>
    <QuestsView  v-show="page === Pages.QUESTS"/>
    <Playground  v-show="page === Pages.PLAYGROUND"/>
  </MainLayout>
</template>

<style>
/* Global styles managed by Tailwind CSS */
</style>

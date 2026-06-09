<template>
    <div class="p-4 space-y-4 container mx-auto">
        <div class="p-4 border rounded-lg dark:border-gray-600">
            <h2 class="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-300">Discord Quest Games</h2>
            <div v-if="isLoadingQuests" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <div class="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                Fetching current Discord Quests...
            </div>
            <div v-else-if="questError" class="text-sm text-yellow-500">
                ⚠ {{ questError }}
            </div>
            <div v-else-if="quests.length > 0" class="space-y-2">
                <div v-for="quest in quests" :key="quest.id"
                    class="flex items-center gap-3 p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
                    <img v-if="quest.config?.application_icon" 
                        :src="`https://cdn.discordapp.com/app-icons/${quest.config.application_id}/${quest.config.application_icon}.png?size=32`"
                        class="w-8 h-8 rounded" 
                        :alt="quest.config?.application_name"
                        @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'"
                    />
                    <div>
                        <div class="font-medium text-sm text-gray-800 dark:text-white">
                            {{ quest.config?.application_name || 'Unknown Game' }}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                            Quest ends: {{ quest.expires_at ? new Date(quest.expires_at).toLocaleDateString() : 'Unknown' }}
                        </div>
                    </div>
                </div>
            </div>
            <div v-else class="text-sm text-gray-500 dark:text-gray-400">No active quests found.</div>
            <button @click="loadQuests"
                class="mt-3 px-3 py-1 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md">
                Refresh Quests
            </button>
        </div>

        <!-- Logs Section -->
        <div class="mt-4 p-4 border rounded text-gray-700 dark:text-gray-300 dark:border-gray-600">
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-lg font-semibold mb-2">Logs</h2>
                <button class="mt-2 font-bold py-1 px-3 rounded dark:bg-gray-700 bg-gray-300 hover:bg-gray-400 text-sm"
                    @click="clearLogs">Clear Logs</button>
            </div>

            <div class="max-h-64 overflow-y-auto p-2 rounded">
                <div v-if="logs.length === 0" class="text-gray-400">No logs available.</div>
                <ul v-else class="list-none">
                    <li v-for="(log, index) in logs" :key="index" class="text-sm">
                        <span class="text-gray-500">[{{ new Date(log.timestamp).toLocaleString() }}]</span>
                        <span :class="{
                            'text-blue-400': log.type === 'info',
                            'text-red-400': log.type === 'error',
                            'text-yellow-400': log.type === 'warning',
                            'text-green-400': log.type === 'debug'
                        }">
                            [{{ log.type.toUpperCase() }}]
                        </span>
                        <span class="ml-1">{{ log.message }}</span>
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useGlobalState } from '@/composables/app-state';

const { logs, addLog, clearLogs } = useGlobalState();

interface DiscordQuest {
    id: string;
    expires_at?: string;
    config?: {
        application_id?: string;
        application_name?: string;
        application_icon?: string;
    };
}

const quests = ref<DiscordQuest[]>([]);
const isLoadingQuests = ref(false);
const questError = ref<string | null>(null);

async function loadQuests() {
    isLoadingQuests.value = true;
    questError.value = null;
    try {
        const res = await fetch('/api/quests', { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
            questError.value = `Could not fetch quests (HTTP ${res.status}). Discord may require login.`;
            addLog('warning', 'Quests endpoint returned ' + res.status);
            return;
        }
        const data = await res.json();
        quests.value = Array.isArray(data) ? data : (data.quests ?? []);
        addLog('✓ Loaded ' + quests.value.length + ' active Discord quests.');
    } catch (e: any) {
        questError.value = 'Failed to fetch quests: ' + e.message;
        addLog('error', questError.value);
    } finally {
        isLoadingQuests.value = false;
    }
}

onMounted(() => {
    loadQuests();
});
</script>

<style scoped></style>

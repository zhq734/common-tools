<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Wrench } from 'lucide-vue-next'

const route = useRoute()

const title = computed(() => String(route.meta.title || '工具'))
const description = computed(() => String(route.meta.description || '该工具正在开发中。'))
</script>

<template>
  <div class="placeholder-page">
    <div class="placeholder-card">
      <div class="placeholder-card-inner">
        <div class="placeholder-icon">
          <Wrench :size="28" />
        </div>
        <h1 class="placeholder-title">{{ title }}</h1>
        <p class="placeholder-desc">{{ description }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.placeholder-page {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
}

.placeholder-card {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 24px;
  border: 1px solid var(--content-border);
  border-radius: 20px;
  background:
    radial-gradient(circle at top right, rgba(79, 107, 255, 0.14), transparent 32%),
    radial-gradient(circle at bottom left, rgba(79, 107, 255, 0.08), transparent 28%),
    var(--content-bg-secondary);
  display: flex;
}

.placeholder-card-inner {
  width: min(560px, 100%);
  margin: auto;
  text-align: center;
}

.placeholder-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  color: #fff;
  background: linear-gradient(135deg, var(--accent) 0%, #6da0ff 100%);
}

.placeholder-title {
  margin: 0 0 10px;
  font-size: 24px;
  font-weight: 700;
  color: var(--content-text);
}

.placeholder-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--content-text-secondary);
}
</style>

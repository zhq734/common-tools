<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Code2, FileJson, FileCode2, Image, QrCode, Clock3, Link2, GitCompareArrows } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

const navItems = [
  { path: '/toolbox/http', label: 'HTTP 调试', icon: Code2 },
  { path: '/toolbox/json', label: 'JSON 工具', icon: FileJson },
  { path: '/toolbox/xml', label: 'XML 工具', icon: FileCode2 },
  { path: '/toolbox/base64', label: 'Base64 转换', icon: Image },
  { path: '/toolbox/qrcode', label: '二维码', icon: QrCode },
  { path: '/toolbox/cron', label: 'Cron 生成器', icon: Clock3 },
  { path: '/toolbox/url', label: 'URL 编解码', icon: Link2 },
  { path: '/toolbox/text-diff', label: '文本对比', icon: GitCompareArrows },
]

const activePath = computed(() => navItems.find(item => route.path.startsWith(item.path))?.path || '/toolbox/http')
</script>

<template>
  <div class="toolbox-layout">
    <aside class="toolbox-nav">
      <div class="toolbox-nav-header">
        <div class="toolbox-nav-title">工具箱</div>
        <div class="toolbox-nav-subtitle">常用调试与转换工具</div>
      </div>

      <div class="toolbox-nav-mobile">
        <el-select
          :model-value="activePath"
          size="small"
          class="toolbox-nav-select"
          @change="(value: string) => router.push(value)"
        >
          <el-option
            v-for="item in navItems"
            :key="item.path"
            :label="item.label"
            :value="item.path"
          />
        </el-select>
      </div>

      <div class="toolbox-nav-list">
        <button
          v-for="item in navItems"
          :key="item.path"
          class="toolbox-nav-item"
          :class="{ active: activePath === item.path }"
          @click="router.push(item.path)"
        >
          <component :is="item.icon" :size="16" />
          <span>{{ item.label }}</span>
        </button>
      </div>
    </aside>

    <section class="toolbox-content">
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </section>
  </div>
</template>

<style scoped>
.toolbox-layout {
  display: flex;
  gap: 20px;
  height: 100%;
  min-height: 0;
  align-items: stretch;
  overflow: hidden;
}

.toolbox-nav {
  width: 220px;
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--content-border);
  border-radius: 16px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--content-bg-secondary) 94%, #2f6fed 6%) 0%, var(--content-bg-secondary) 100%);
}

.toolbox-nav-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toolbox-nav-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--content-text);
}

.toolbox-nav-subtitle {
  font-size: 12px;
  color: var(--content-text-secondary);
  line-height: 1.5;
}

.toolbox-nav-mobile {
  display: none;
}

.toolbox-nav-select {
  width: 100%;
}

.toolbox-nav-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 8px;
  overflow: auto;
}

.toolbox-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--content-text-secondary);
  font: inherit;
  cursor: pointer;
  transition: 150ms ease;
  text-align: left;
}

.toolbox-nav-item:hover {
  background: var(--content-bg-tertiary);
  color: var(--content-text);
}

.toolbox-nav-item.active {
  background: linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 76%, #ffffff 24%) 100%);
  color: #fff;
  box-shadow: 0 10px 24px rgba(79, 107, 255, 0.25);
}

.toolbox-content {
  flex: 1;
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

@media (max-width: 960px) {
  .toolbox-layout {
    flex-direction: column;
    gap: 12px;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .toolbox-nav {
    width: 100%;
    height: auto;
    gap: 12px;
    padding: 14px;
    border-radius: 14px;
  }

  .toolbox-content {
    flex: none;
    height: auto;
    min-height: 0;
    overflow: visible;
  }

  .toolbox-nav-list {
    display: none;
  }

  .toolbox-nav-mobile {
    display: block;
  }

  .toolbox-nav-subtitle {
    display: none;
  }
}

@media (orientation: portrait) {
  .toolbox-layout {
    flex-direction: column;
    gap: 12px;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .toolbox-nav {
    width: 100%;
    height: auto;
  }

  .toolbox-content {
    flex: none;
    height: auto;
    min-height: 0;
    overflow: visible;
  }

  .toolbox-nav-list {
    display: none;
  }

  .toolbox-nav-mobile {
    display: block;
  }
}

@media (max-width: 640px) {
  .toolbox-nav {
    padding: 12px;
    gap: 10px;
  }

  .toolbox-nav-header {
    gap: 2px;
  }

  .toolbox-nav-title {
    font-size: 16px;
  }

  .toolbox-nav-item { gap: 8px; padding: 9px 11px; border-radius: 10px; font-size: 13px; }
}
</style>

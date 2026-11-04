<template>
  <div class="weather" aria-live="polite">
    <span v-if="loading">天气加载中…</span>
    <template v-else-if="weatherData">
      <span>{{ weatherData.city }}&nbsp;</span>
      <span>{{ weatherData.weather }}&nbsp;</span>
      <span
        :title="weatherData.temperatureKind === 'range-midpoint' ? '当日高低温中间值' : '实时温度'"
      >
        {{ weatherData.temperatureKind === "range-midpoint" ? "约 " : ""
        }}{{ weatherData.temperature }}℃
      </span>
      <span class="sm-hidden" v-if="weatherData.winddirection">
        &nbsp;{{
          weatherData.winddirection.endsWith("风")
            ? weatherData.winddirection
            : weatherData.winddirection + "风"
        }}
      </span>
      <span class="sm-hidden" v-if="weatherData.windpower">
        &nbsp;{{
          weatherData.windpower.endsWith("级")
            ? weatherData.windpower
            : weatherData.windpower + "级"
        }}
      </span>
      <span v-if="stale" title="天气服务暂时不可用，显示最近一次缓存">&nbsp;（缓存）</span>
    </template>
    <span v-else>天气暂时不可用</span>
  </div>
</template>

<script setup>
import { getWeather } from "@/api";

const weatherData = ref(null);
const loading = ref(true);
const stale = ref(false);
const controller = new AbortController();
let timeout;
let disposed = false;

onMounted(async () => {
  timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const result = await getWeather(controller.signal);
    if (!disposed) {
      weatherData.value = result.data;
      stale.value = result.stale === true;
    }
  } catch {
    // 天气不影响主页使用，失败时展示就地提示，不弹窗打断用户。
    if (!disposed) weatherData.value = null;
  } finally {
    clearTimeout(timeout);
    if (!disposed) loading.value = false;
  }
});

onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(timeout);
  controller.abort();
});
</script>

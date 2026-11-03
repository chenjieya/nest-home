<template>
  <div :class="store.mobileOpenState ? 'right' : 'right hidden'">
    <!-- 移动端 Logo -->
    <div class="logo text-hidden" @click="store.mobileFuncState = !store.mobileFuncState">
      <img :src="siteLogo" alt="nest" width="56" height="56" />
    </div>
    <!-- 功能区 -->
    <Func />
    <!-- 网站链接 -->
    <Link />
  </div>
</template>

<script setup>
import { mainStore } from "@/store";
import Func from "@/views/Func/index.vue";
import Link from "@/components/Links.vue";
const store = mainStore();

const siteLogo = import.meta.env.VITE_SITE_MAIN_LOGO || "/images/brand/nest.svg";
</script>

<style lang="scss" scoped>
.right {
  // flex: 1 0 0%;
  width: 50%;
  margin-left: 0.75rem;
  .logo {
    width: 100%;
    font-family: "Pacifico-Regular";
    font-size: 2.25rem;
    position: fixed;
    top: 6%;
    left: 0;
    text-align: center;
    img {
      object-fit: contain;
    }
    transition: transform 0.3s;
    animation: fade 0.5s;
    &:active {
      transform: scale(0.95);
    }
    @media (min-width: 721px) {
      display: none;
    }
    @media (max-height: 720px) {
      width: calc(100% + 6px);
      top: 43.26px; // 721px * 0.06
    }
    @media (max-width: 390px) {
        width: 391px;
    }
  }
  @media (max-width: 720px) {
    margin-left: 0;
    width: 100%;
    &.hidden {
      display: none;
    }
  }
}
</style>

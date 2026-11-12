<template>
  <div class="links">
    <div class="line">
      <Icon size="20">
        <Link />
      </Icon>
      <span class="title">我的项目</span>
    </div>
    <!-- 网站列表 -->
    <Swiper
      v-if="siteLinks[0]"
      :modules="[Pagination, Mousewheel]"
      :slides-per-view="1"
      :space-between="40"
      :pagination="{
        el: '.swiper-pagination',
        clickable: true,
        bulletElement: 'div',
      }"
      :mousewheel="true"
    >
      <SwiperSlide v-for="site in siteLinksList" :key="site">
        <el-row class="link-all" :gutter="20">
          <el-col v-for="(item, index) in site" :span="8" :key="item.link">
            <a
              class="item cards"
              :style="index < 3 ? 'margin-bottom: 20px' : null"
              :href="item.link"
              target="_blank"
              rel="noopener noreferrer"
              @click="jumpLink($event, item)"
            >
              <img
                v-if="getImage(item) && !failedImages.has(getImage(item))"
                class="project-image"
                :src="getImage(item)"
                alt=""
                width="36"
                height="36"
                loading="lazy"
                @error="failedImages.add(getImage(item))"
              />
              <Icon v-else-if="siteIcon[item.icon]" size="26">
                <component :is="siteIcon[item.icon]" />
              </Icon>
              <span v-else class="project-image placeholder" aria-hidden="true">
                {{ item.name.slice(0, 1) }}
              </span>
              <span class="name text-hidden">{{ item.name }}</span>
            </a>
          </el-col>
        </el-row>
      </SwiperSlide>
      <div class="swiper-pagination" />
    </Swiper>
    <p v-else class="empty">项目正在整理中</p>
  </div>
</template>

<script setup>
import { Icon } from "@vicons/utils";
import {
  Link,
  Blog,
  CompactDisc,
  Cloud,
  Compass,
  Book,
  Fire,
  LaptopCode,
  Database,
} from "@vicons/fa";
import { mainStore } from "@/store";
import { Swiper, SwiperSlide } from "swiper/vue";
import { Pagination, Mousewheel } from "swiper/modules";
import siteLinks from "@/assets/siteLinks.json";

// 记录失败的图片地址，回退到原图标或项目首字，避免反复加载失败地址。
const failedImages = reactive(new Set());
const store = mainStore();
const siteIcon = { Blog, Cloud, CompactDisc, Compass, Book, Fire, LaptopCode, Database };

/** 保留旧图标名称，优先使用 image，icon 也支持直接配置图片地址。 */
const getImage = (item) => item.image || (siteIcon[item.icon] ? "" : item.icon) || "";

const jumpLink = (event, item) => {
  if (
    item.name === "音乐" &&
    store.musicClick &&
    typeof window.$openList === "function" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  ) {
    event.preventDefault();
    window.$openList();
  }
};

// 计算网站链接
const siteLinksList = computed(() => {
  const result = [];
  for (let i = 0; i < siteLinks.length; i += 6) {
    const subArr = siteLinks.slice(i, i + 6);
    result.push(subArr);
  }
  return result;
});
</script>

<style lang="scss" scoped>
.links {
  .empty {
    padding: 2rem 0;
    color: #ffffffb0;
  }
  .line {
    margin: 2rem 0.25rem 1rem;
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    animation: fade 0.5s;
    .title {
      margin-left: 8px;
      font-size: 1.15rem;
      text-shadow: 0 0 5px #00000050;
    }
  }
  .swiper {
    left: -10px;
    width: calc(100% + 20px);
    padding: 5px 10px 0;
    z-index: 0;
    .swiper-slide {
      height: 100%;
    }
    .swiper-pagination {
      margin-top: 12px;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      :deep(.swiper-pagination-bullet) {
        background-color: #fff;
        width: 20px;
        height: 4px;
        margin: 0 4px;
        border-radius: 4px;
        opacity: 0.2;
        transition: opacity 0.3s;
        &.swiper-pagination-bullet-active {
          opacity: 1;
        }
        &:hover {
          opacity: 1;
        }
      }
    }
  }
  .link-all {
    height: 220px;
    .item {
      height: 100px;
      width: 100%;
      display: flex;
      align-items: center;
      flex-direction: row;
      justify-content: center;
      padding: 0 10px;
      animation: fade 0.5s;
      color: inherit;
      text-decoration: none;

      &:focus-visible {
        outline: 2px solid #a3a2ff;
        outline-offset: 3px;
      }

      .project-image {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        object-fit: contain;
      }

      .placeholder {
        display: grid;
        place-items: center;
        border-radius: 8px;
        background: #ffffff20;
      }

      &:hover {
        transform: scale(1.02);
        background: rgb(0 0 0 / 40%);
        transition: 0.3s;
      }

      &:active {
        transform: scale(1);
      }

      .name {
        font-size: 1.1rem;
        margin-left: 8px;
      }
      @media (min-width: 720px) and (max-width: 820px) {
        .name {
          display: none;
        }
      }
      @media (max-width: 720px) {
        height: 80px;
      }
      @media (max-width: 460px) {
        flex-direction: column;
        .name {
          font-size: 1rem;
          margin-left: 0;
          margin-top: 8px;
        }
      }
    }
    @media (max-width: 720px) {
      height: 180px;
    }
  }
}
</style>

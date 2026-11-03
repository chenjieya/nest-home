# nest · 汇聚之所

整合个人项目，提供统一的展示与访问入口。当前基于 Vue 3 个人主页实现，项目列表由静态 JSON 配置维护。

仓库：[chenjieya/nest-home](https://github.com/chenjieya/nest-home)。

## 1. 项目结构

```text
src/
├── main.js          Vue 与 Pinia 初始化
├── App.vue          主界面布局与交互
├── views/           主界面、功能区与设置区域
├── components/      项目卡片、个人信息、天气、音乐等组件
├── assets/          项目链接与社交链接 JSON
├── store/           全局状态及浏览器偏好持久化
├── api/             第三方接口请求
├── utils/           日期、防抖与鼠标交互工具
└── style/           公共样式
public/              壁纸、字体与应用图标
```

技术栈为 Vue 3、Vite、Pinia、Element Plus 与 SCSS。当前没有业务后端、数据库或统一登录；项目访问通过外部链接跳转。

---

## 2. 本地开发

仓库提供 `pnpm-lock.yaml`，使用兼容该锁文件的 pnpm。当前尚未在 `package.json` 固定 Node 和 pnpm 版本。

在项目根目录执行：

```powershell
# 首次创建配置，保留已有 .env
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}

pnpm install --frozen-lockfile
pnpm dev
```

默认开发端口为 `3000`。首次运行前按实际情况编辑 `.env` 和链接 JSON；当前页面文案、域名及项目列表仍含模板配置，需要逐项替换。

---

## 3. 内容配置

| 内容                                     | 文件或配置                                 |
| :--------------------------------------- | :----------------------------------------- |
| 标题、描述、作者、域名、图标与第三方接口 | `.env`，参考 `.env.example`                |
| 项目入口                                 | `src/assets/siteLinks.json`                |
| 社交入口                                 | `src/assets/socialLinks.json`              |
| 项目图标映射                             | `src/components/Links.vue` 中的 `siteIcon` |
| 壁纸与字体                               | `public/images/`、`public/font/`           |

项目入口格式示例：

```json
{
  "icon": "Blog",
  "name": "项目示例",
  "link": "https://example.com/"
}
```

现有 `icon` 名称（如 `Blog`）仍然有效。使用项目图片时，可新增 `image` 字段，或直接将 `icon` 改为图片地址，支持本地 SVG、PNG、WebP 和远程图片 URL。`image` 优先于 `icon`；图片加载失败时回退到原图标或项目首字，项目名称与访问地址不受影响。

桌面、移动端和设置面板统一使用 `VITE_SITE_MAIN_LOGO` 配置的无文字 SVG 标志，favicon 使用 `VITE_SITE_LOGO`。当前标志源文件为 `public/images/brand/nest.svg`；同目录的 180、192、512 像素 PNG 由该 SVG 导出，供 Apple 与 PWA 使用。替换标志时需同步更新这些 PNG。

`VITE_*` 配置会进入浏览器产物，不用于保存服务端秘密。修改环境变量或 JSON 后需要重新构建。完整 Logo 字体保留在 `public/font/Pacifico-Regular-all.ttf`，替换说明见 [字体说明](public/font/README.md)。

---

## 4. 构建与部署

```powershell
pnpm build
pnpm preview
```

构建产物位于 `dist/`，可由静态文件服务托管。当前资源引用主要按域名根路径组织，子路径部署需额外核对 Vite base、图片路径和 PWA 配置。

仓库保留两种构建方式：

- `Dockerfile` 与 `docker-compose.yml`：构建后通过 `http-server` 提供服务，端口为 `12445`。
- `.github/workflows/build.yml`：在 `dev/master` 分支推送时构建并上传静态产物，未配置自动发布到服务器。

Docker 和 CI 目前使用 npm，与本地 pnpm 安装方式尚未统一。

---

## 5. 检查与来源

`pnpm lint` 包含自动修复，`pnpm format` 会格式化源码。仅检查源码时可执行：

```powershell
pnpm exec eslint src --ext .js,.vue
```

本项目基于 [imsyy/home](https://github.com/imsyy/home) 改造，原始版权声明与 MIT 许可证保留于 [LICENSE](LICENSE)。

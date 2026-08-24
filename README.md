# AIGC Share

AIGC 动效作品集，包含 7 个项目及全部本地视频资源。

## 本地运行

```bash
npm install
npm start
```

默认访问：`http://127.0.0.1:8125/`

## 在线部署

本项目需要 Node.js 运行 `serve.mjs`，推荐使用 Render、Railway 或 Fly.io，并连接本 GitHub 仓库：

- Build Command：`npm install`
- Start Command：`npm start`
- Node.js：22 或更高

不建议直接使用 GitHub Pages，因为详情页使用本地数据接口 `/api/dato`，GitHub Pages 无法运行 Node 服务。

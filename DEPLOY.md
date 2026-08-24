# GitHub 上传与永久运行方案（当前版）

## 结论

- **可以把完整网站和全部本地视频上传到 GitHub 仓库。**
- 当前 `site/` 约 **357.4 MiB / 138 个文件**，最大文件 `book-of-happiness/demo-02.mp4` 约 **96.5 MiB**，低于 GitHub 单文件 100 MiB 硬限制；没有超过 100 MiB 的文件。
- 但 96.5 / 69.9 / 66.0 MiB 三个视频超过 GitHub 的 50 MiB 建议阈值，push 时可能警告且上传较慢；仍可上传。
- **GitHub Pages 不能直接作为最终运行环境。** 当前克隆站为保证直接刷新详情页不被原站 DatoCMS 覆盖，需要 Node 服务器提供本地 `/api/dato`。GitHub Pages 只托管静态文件，不会运行 `serve.mjs`。
- 推荐：GitHub 负责存代码和资源，Render / Railway / Fly.io 等 Node 托管负责永久在线运行。

## 需要上传什么

建议上传工程中的：

- `site/`：完整站点、全部视频、字体、模型、纹理、7 个详情页
- `serve.mjs`：Node 静态服务器与本地 Dato 数据接口
- `package.json`、`package-lock.json`
- `apply-content.mjs` 和相关配置脚本（如果希望以后继续更新）

不需要上传：

- `node_modules/`
- `RECON/screenshots/`（验收截图，可选）
- 临时备份与转码中间文件

## GitHub 仓库容量检查

| 项目 | 当前值 | GitHub 限制/建议 | 结果 |
|---|---:|---:|---|
| 站点总大小 | 357.4 MiB | 仓库建议 < 1 GiB | 通过 |
| 最大单文件 | 96.5 MiB | 硬限制 100 MiB | 通过，接近上限 |
| 超过 100 MiB | 0 个 | 必须为 0 | 通过 |
| 超过 50 MiB | 3 个 | 会收到警告 | 可上传但较慢 |

## 推荐部署：GitHub + Render（支持 Node）

1. 在 GitHub 创建空仓库，例如 `li-motion-portfolio`。
2. 把工程上传，确保 `.gitignore` 排除 `node_modules/`。
3. 在 Render 新建 Web Service，连接该仓库。
4. Build Command：`npm install`
5. Start Command：`npm start`
6. Node 版本：22 或更高。
7. Render 分配域名后即可公开访问；以后 push 会自动重新部署。

`package.json` 已有：

```json
{
  "scripts": {
    "start": "node serve.mjs"
  }
}
```

## 如果一定使用 GitHub Pages

需要进一步把运行时数据接口完全改成静态数据且解决 Nuxt 水合一致性。当前测试发现，仅用普通静态服务器直接打开详情页会发生 hydration mismatch，所以**不能把“文件能上传”误认为“GitHub Pages 能完整运行”**。

## 视频优化建议

最大视频只有 3.5 MiB 空间余量，后续任何 metadata 或重转码变化都可能超过 GitHub 100 MiB 限制。建议把：

- `book-of-happiness/demo-02.mp4`（96.5 MiB）再压到 80 MiB 以下；或
- 使用 Git LFS / 腾讯云 COS / 阿里云 OSS / Cloudflare R2 托管大视频。

如果使用 Git LFS，请注意 GitHub Pages 对 LFS 资源的发布兼容性与流量限制；Node 托管或对象存储更稳。

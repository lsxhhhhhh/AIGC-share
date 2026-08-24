import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "devalue";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(projectDir);
const port = Number(process.env.PORT || 8125);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wasm": "application/wasm",
  ".basis": "application/octet-stream",
  ".ktx2": "image/ktx2",
  ".bin": "application/octet-stream",
};

// --- 可视化配置面板支持 ---
const contentSourceFile = path.join(projectDir, "content-source.json");
const contentSource = fs.existsSync(contentSourceFile) ? JSON.parse(fs.readFileSync(contentSourceFile, "utf8")) : {};
const contentConfigFile = path.resolve(process.env.CONTENT_CONFIG || contentSource.configFile || path.join(projectDir, "content-config.json"));
const editorFile = path.join(projectDir, "editor.html");
const removedProjectSlugs = new Set(["griflan"]);

function safePath(relative) {
  const candidate = path.resolve(root, relative);
  return candidate === root || candidate.startsWith(root + path.sep) ? candidate : null;
}

function resolveRequest(urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  const relative = clean.replace(/^\/+/, "");
  const direct = safePath(relative);
  if (!direct) return null;

  const candidates = clean === "/"
    ? [path.join(root, "index.html")]
    : clean.endsWith("/")
      ? [path.join(direct, "index.html"), direct]
      : [direct, path.join(direct, "index.html"), direct + ".html"];

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

const revive = { Reactive: (value) => value, ShallowReactive: (value) => value };
const localData = parse(fs.readFileSync(path.join(root, "_payload.json"), "utf8"), revive).data;

function apiAsset(media) {
  return {
    url: media.src,
    alt: media.alt || "",
    title: "",
    width: media.width,
    height: media.height,
    focalPoint: null,
    small: media.thumb || media.src,
    tile: media.src,
    card: media.card || media.src,
    video: media.video ? {
      thumbnailUrl: media.src,
      width: media.width,
      height: media.height,
      mp4High: media.video,
    } : null,
  };
}

function apiProject(project) {
  // project.images 已把 hero 放在第一项；直接作为 Dato media，避免再次前置 hero 造成重复。
  const sourceMedia = project.images?.length ? project.images : [project];
  const media = sourceMedia.map(apiAsset);
  return {
    id: project.id,
    slug: project.slug,
    title: project.title,
    description: project.description,
    awards: project.awards,
    link: project.link,
    outlined: project.outlined,
    tags: project.tags || [],
    media,
  };
}

const localFeaturedApi = localData.featured.map(apiProject);
// 本地作品集只保留配置中的 7 个项目，避免运行时继续预加载原站其余项目和纹理。
const localProjectsApi = localFeaturedApi;

function graphQlResponse(body) {
  const query = body?.query || "";
  if (query.includes("_site")) {
    return { data: { _site: { faviconMetaTags: [], globalSeo: localData.site?.seo || {}, noIndex: false } } };
  }
  if (query.includes("projects")) {
    return { data: { projects: localProjectsApi, home: { featured: localFeaturedApi } } };
  }
  return { data: { home: { featured: localFeaturedApi } } };
}

function sendFile(req, res, file) {
  const stat = fs.statSync(file);
  const ext = path.extname(file).toLowerCase();
  const baseHeaders = {
    "content-type": mime[ext] || "application/octet-stream",
    "cache-control": "no-cache",
    "access-control-allow-origin": "*",
    "accept-ranges": "bytes",
  };

  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.writeHead(416, { ...baseHeaders, "content-range": `bytes */${stat.size}` });
      res.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      res.writeHead(416, { ...baseHeaders, "content-range": `bytes */${stat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      ...baseHeaders,
      "content-range": `bytes ${start}-${end}/${stat.size}`,
      "content-length": end - start + 1,
    });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...baseHeaders, "content-length": stat.size });
  if (req.method === "HEAD") res.end();
  else fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);

  if ([...removedProjectSlugs].some((slug) => pathname === `/projects/${slug}` || pathname.startsWith(`/projects/${slug}/`))) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" });
    res.end("Not found");
    return;
  }

  // 本地化 DatoCMS GraphQL：阻止运行时在线数据覆盖已经应用的本地配置。
  if (pathname === "/api/dato" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}");
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" });
        res.end(JSON.stringify(graphQlResponse(parsed)));
      } catch (error) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ errors: [{ message: error.message }] }));
      }
    });
    return;
  }

  // 配置面板页面
  if (pathname === "/editor" || pathname === "/editor.html") {
    if (fs.existsSync(editorFile)) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
      fs.createReadStream(editorFile).pipe(res);
    } else {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("editor.html not found");
    }
    return;
  }

  // 读取配置
  if (pathname === "/api/content" && req.method === "GET") {
    try {
      const text = fs.readFileSync(contentConfigFile, "utf8");
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" });
      res.end(text);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("无法读取配置: " + e.message);
    }
    return;
  }

  // 保存配置
  if (pathname === "/api/content" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.projects) || parsed.projects.length === 0) {
          throw new Error("配置结构不合法（缺少 projects 数组）");
        }
        const backupFile = contentConfigFile + ".bak";
        fs.copyFileSync(contentConfigFile, backupFile);
        fs.writeFileSync(contentConfigFile, JSON.stringify(parsed, null, 2) + "\n", "utf8");
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, file: contentConfigFile, backup: backupFile }));
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" });
    res.end();
    return;
  }
  const file = resolveRequest(req.url || "/");
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  sendFile(req, res, file);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Set another one with PORT=<number>.`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

const host = process.env.HOST || "0.0.0.0";
server.listen(port, host, () => {
  console.log(`Jesper Landberg mirror: http://${host}:${port}/`);
});

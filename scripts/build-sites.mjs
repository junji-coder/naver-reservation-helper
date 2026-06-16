import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(root, "public");
const distDir = join(root, "dist");
const serverDir = join(distDir, "server");
const publicOutDir = join(serverDir, "public");
const openaiOutDir = join(distDir, ".openai");

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

function listFiles(dir, prefix = "") {
  const { readdirSync, statSync } = awaitableFs;
  const files = [];

  for (const name of readdirSync(dir)) {
    const absolute = join(dir, name);
    const relativePath = prefix ? `${prefix}/${name}` : name;

    if (statSync(absolute).isDirectory()) {
      files.push(...listFiles(absolute, relativePath));
    } else {
      files.push(relativePath);
    }
  }

  return files;
}

const awaitableFs = await import("node:fs");

function makeStaticManifest() {
  return listFiles(publicDir)
    .map((filePath) => {
      const absolute = join(publicDir, filePath);
      const extension = extname(filePath);
      const isText = [".html", ".css", ".js", ".json", ".webmanifest", ".svg"].includes(extension);
      const body = readFileSync(absolute, isText ? "utf8" : undefined);
      const routePath = `/${filePath.replace(/\\/g, "/")}`;

      return [
        routePath,
        {
          body: isText ? body : Buffer.from(body).toString("base64"),
          encoding: isText ? "text" : "base64",
          contentType: mimeTypes.get(extension) || "application/octet-stream"
        }
      ];
    });
}

function extractServerCore() {
  const source = readFileSync(join(root, "server.mjs"), "utf8");
  const start = source.indexOf("const mimeTypes = new Map(");
  const end = source.indexOf("\nfunction serveStatic");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("server.mjs에서 배포용 검색 로직을 찾지 못했습니다.");
  }

  return source.slice(start, end);
}

function buildWorkerSource() {
  const assets = makeStaticManifest();
  const indexAsset = assets.find(([path]) => path === "/index.html");
  if (indexAsset) assets.unshift(["/", indexAsset[1]]);

  return `let runtimeEnv = {};
const process = {
  get env() {
    return runtimeEnv;
  }
};

${extractServerCore()}

const staticAssets = new Map(${JSON.stringify(assets)});

function decodeAsset(asset) {
  if (asset.encoding === "text") return asset.body;
  const binary = atob(asset.body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function staticResponse(pathname) {
  const asset = staticAssets.get(pathname) || staticAssets.get("/index.html");
  return new Response(decodeAsset(asset), {
    headers: {
      "content-type": asset.contentType,
      "cache-control": "no-store"
    }
  });
}

export default {
  async fetch(request, env) {
    runtimeEnv = env || {};
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname === "/api/health") {
      return jsonResponse({ ok: true });
    }

    if (requestUrl.pathname === "/api/auth/status") {
      return jsonResponse({ protected: false, authenticated: true });
    }

    if (requestUrl.pathname === "/api/auth" && request.method === "POST") {
      return jsonResponse({ ok: true });
    }

    if (requestUrl.pathname === "/api/settings" && request.method === "GET") {
      return jsonResponse(getSettingsStatus());
    }

    if (requestUrl.pathname === "/api/settings" && request.method === "POST") {
      return jsonResponse({ error: "배포된 앱의 API 키는 호스팅 환경변수에서 관리합니다." }, 400);
    }

    if (requestUrl.pathname === "/api/search" && request.method === "GET") {
      const result = await searchRestaurants(requestUrl);
      return jsonResponse(result.payload, result.status);
    }

    if (requestUrl.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    return staticResponse(requestUrl.pathname);
  }
};
`;
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(serverDir, { recursive: true });
mkdirSync(publicOutDir, { recursive: true });
mkdirSync(openaiOutDir, { recursive: true });

writeFileSync(join(serverDir, "index.js"), buildWorkerSource(), "utf8");
cpSync(publicDir, publicOutDir, { recursive: true });
cpSync(join(root, ".openai", "hosting.json"), join(openaiOutDir, "hosting.json"));

const entryPath = relative(root, join(serverDir, "index.js"));
console.log(`Built ${entryPath}`);

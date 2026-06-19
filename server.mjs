import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const envPath = join(root, ".env");

loadDotEnv(envPath);

const port = Number.parseInt(process.env.PORT || "4177", 10);
const host = process.env.HOST || "127.0.0.1";
const appPin = process.env.APP_PIN || "";
const authCookieName = "reservation_helper_auth";
const authSecret = process.env.APP_AUTH_SECRET || createHash("sha256").update(`reservation-helper:${appPin}`).digest("hex");
const authCookieMaxAgeSeconds = 60 * 60 * 24 * 30;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

const categoryLabels = {
  korean: "한식",
  japanese: "일식",
  chinese: "중식",
  western: "양식",
  other: "기타"
};

const alcoholModeLabels = {
  meal: "식사 중심",
  drinks: "술과 함께"
};

const drinkTypeLabels = {
  soju: "소주",
  beer: "맥주",
  somaek: "소맥",
  wine: "와인",
  kaoliang: "고량주"
};

const configurableEnvKeys = ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "KAKAO_REST_API_KEY"];
const stationRadiusMeters = 1000;
const maxRestaurantResults = 36;
const maxExpandedQueries = 18;
const naverLocalDisplaySize = 5;
const naverLocalPagesPerQuery = 2;
const naverLocalSortModes = ["comment", "random"];
const kakaoLocalDisplaySize = 15;
const maxReservationCheckCandidates = 60;
const naverReservationSearchDisplaySize = 10;
const reservationSearchConcurrency = 4;
const restaurantCacheTtlMs = 5 * 60 * 1000;
const reservationLinkCacheTtlMs = 30 * 60 * 1000;
const stationCache = new Map();
const restaurantCache = new Map();
const reservationLinkCache = new Map();

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const contents = readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!key || process.env[key]) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function getAuthToken() {
  return createHash("sha256").update(`${appPin}:${authSecret}`).digest("hex");
}

function getCookieValue(request, name) {
  const cookie = request.headers.cookie || "";
  const prefix = `${name}=`;
  const match = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

function hasAppAccess(request) {
  if (!appPin) return true;
  return getCookieValue(request, authCookieName) === getAuthToken();
}

async function authenticate(request, response) {
  const body = await readJsonBody(request);
  const pin = String(body.pin || "").trim();

  if (!appPin || pin === appPin) {
    sendJson(response, 200, { ok: true }, {
      "set-cookie": `${authCookieName}=${encodeURIComponent(getAuthToken())}; Path=/; Max-Age=${authCookieMaxAgeSeconds}; SameSite=Lax`
    });
    return;
  }

  sendJson(response, 401, { error: "PIN이 맞지 않습니다." });
}

function maskSecret(value = "") {
  if (!value) return "";
  if (value.length <= 6) return "저장됨";
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

function getSettingsStatus() {
  return {
    naverClientId: Boolean(process.env.NAVER_CLIENT_ID),
    naverClientIdPreview: maskSecret(process.env.NAVER_CLIENT_ID),
    naverClientSecret: Boolean(process.env.NAVER_CLIENT_SECRET),
    naverClientSecretPreview: maskSecret(process.env.NAVER_CLIENT_SECRET),
    kakaoRestApiKey: Boolean(process.env.KAKAO_REST_API_KEY),
    kakaoRestApiKeyPreview: maskSecret(process.env.KAKAO_REST_API_KEY)
  };
}

function cleanSecretInput(value) {
  return String(value || "").replace(/[\r\n]/g, "").trim();
}

function saveEnvironmentValues() {
  const lines = [
    "# Saved by Naver Reservation Helper",
    `NAVER_CLIENT_ID=${process.env.NAVER_CLIENT_ID || ""}`,
    `NAVER_CLIENT_SECRET=${process.env.NAVER_CLIENT_SECRET || ""}`,
    `KAKAO_REST_API_KEY=${process.env.KAKAO_REST_API_KEY || ""}`,
    `PORT=${process.env.PORT || String(port)}`,
    `HOST=${process.env.HOST || host}`
  ];

  writeFileSync(envPath, `${lines.join("\n")}\n`, "utf8");
}

async function readJsonBody(request) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20_000) {
      throw new Error("요청이 너무 큽니다.");
    }
  }

  return body ? JSON.parse(body) : {};
}

async function updateSettings(request) {
  const body = await readJsonBody(request);

  for (const key of configurableEnvKeys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      process.env[key] = cleanSecretInput(body[key]);
    }
  }

  saveEnvironmentValues();
  return getSettingsStatus();
}

function notFound(response) {
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

function cleanHtml(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function buildLookupText(title, address = "") {
  return `${title} ${address}`.replace(/\s+/g, " ").trim();
}

function buildSearchLinks(title, address = "", bookingHint = "", kakaoHint = "") {
  const lookupText = buildLookupText(title, address);
  const bookingQuery = bookingHint || lookupText;
  const kakaoQuery = kakaoHint || title;

  return {
    naverMapUrl: `https://map.naver.com/p/search/${encodeURIComponent(lookupText)}`,
    kakaoMapUrl: `https://map.kakao.com/?q=${encodeURIComponent(kakaoQuery)}`,
    bookingSearchUrl: `https://m.place.naver.com/place/list?query=${encodeURIComponent(bookingQuery)}`
  };
}

function parseScaledCoordinate(x, y) {
  const lon = Number(x) / 10_000_000;
  const lat = Number(y) / 10_000_000;

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;

  return { lon, lat };
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceMeters(a, b) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function normalizeStationName(location) {
  const cleaned = cleanHtml(location).replace(/\s+/g, "").trim();
  if (!cleaned) return "";
  return cleaned.endsWith("역") ? cleaned : `${cleaned}역`;
}

function isStationItem(item) {
  const title = cleanHtml(item.title || item.place_name || "");
  const category = cleanHtml(item.category || item.category_name || "");
  return title.includes("역") || category.includes("지하철") || category.includes("전철");
}

function isFoodCategory(category = "") {
  return /음식점|한식|일식|중식|양식|술집|이자카야|요리|고기|국밥|분식|뷔페|카페/.test(cleanHtml(category));
}

function dedupeItems(items) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const key = `${cleanHtml(item.title).replace(/\s+/g, "")}|${cleanHtml(item.address).replace(/\s+/g, "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function scoreRestaurant(item, { menuLabel = "", alcoholMode = "meal", drinkType = "" } = {}) {
  const sourceRank = Number.isFinite(item.sourceRank) ? item.sourceRank : maxRestaurantResults * 2;
  const distance = Number.isFinite(item.distanceMeters) ? item.distanceMeters : stationRadiusMeters;
  const haystack = cleanHtml(`${item.title} ${item.category} ${item.description}`).replace(/\s+/g, "");
  const menuKeywords = getRelatedMenuKeywords(menuLabel);
  const drinkLabel = getDrinkLabel(drinkType);
  const drinkIntent = getDrinkSearchIntent(drinkType).replace(/\s+/g, "");
  const menuMatch = menuKeywords.some((keyword) => {
    const cleanedKeyword = cleanHtml(keyword).replace(/\s+/g, "");
    return cleanedKeyword && haystack.includes(cleanedKeyword);
  });
  let score = 0;

  score += Math.max(0, 140 - sourceRank * 4);
  score += Math.max(0, 80 - distance / 12.5);

  for (const keyword of menuKeywords) {
    const cleanedKeyword = cleanHtml(keyword).replace(/\s+/g, "");
    if (cleanedKeyword && haystack.includes(cleanedKeyword)) score += 12;
  }

  if (menuLabel && menuLabel !== "기타") {
    score += menuMatch ? 28 : -60;
  }

  if (alcoholMode === "drinks") {
    if (/술집|이자카야|주점|포차|바|펍|안주/.test(haystack)) score += 18;
    if (drinkLabel && haystack.includes(drinkLabel.replace(/\s+/g, ""))) score += 10;
    if (drinkIntent && haystack.includes(drinkIntent)) score += 8;
  }

  if (item.source === "naver") score += 10;
  if (item.source === "kakao") score += 6;

  return Math.round(score);
}

function sortByRecommendation(items, context = {}) {
  return [...items]
    .map((item) => {
      const recommendationScore = scoreRestaurant(item, context);
      return {
        ...item,
        recommendationScore,
        recommendationBasis: item.source === "naver"
          ? "네이버 인기순과 역 기준 거리"
          : "역 기준 거리와 메뉴 적합도"
      };
    })
    .sort((a, b) => {
      if (b.recommendationScore !== a.recommendationScore) {
        return b.recommendationScore - a.recommendationScore;
      }

      const distanceA = Number.isFinite(a.distanceMeters) ? a.distanceMeters : Number.POSITIVE_INFINITY;
      const distanceB = Number.isFinite(b.distanceMeters) ? b.distanceMeters : Number.POSITIVE_INFINITY;
      if (distanceA !== distanceB) return distanceA - distanceB;

      const rankA = Number.isFinite(a.sourceRank) ? a.sourceRank : Number.POSITIVE_INFINITY;
      const rankB = Number.isFinite(b.sourceRank) ? b.sourceRank : Number.POSITIVE_INFINITY;
      return rankA - rankB;
    })
    .map((item, index) => ({
      ...item,
      recommendationRank: index + 1
    }));
}

function getRestaurantCache(key) {
  const cached = restaurantCache.get(key);
  if (!cached) return null;

  if (Date.now() - cached.createdAt > restaurantCacheTtlMs) {
    restaurantCache.delete(key);
    return null;
  }

  return cached.payload;
}

function setRestaurantCache(key, payload) {
  if (!payload?.items?.length) return;
  restaurantCache.set(key, {
    createdAt: Date.now(),
    payload
  });
}

function getRelatedMenuKeywords(menuLabel) {
  const related = {
    한식: ["한식", "백반", "고깃집", "국밥", "찌개", "족발", "보쌈"],
    일식: ["일식", "초밥", "스시", "라멘", "돈카츠", "이자카야"],
    중식: ["중식", "중국집", "짜장면", "마라탕", "양꼬치"],
    양식: ["양식", "파스타", "스테이크", "피자", "브런치"]
  };

  return related[menuLabel] || (menuLabel && menuLabel !== "기타" ? [menuLabel] : ["음식점"]);
}

function getDrinkLabel(drinkType) {
  return drinkTypeLabels[drinkType] || "";
}

function getDrinkSearchIntent(drinkType) {
  const intents = {
    soju: "소주 안주",
    beer: "맥주 펍",
    somaek: "소맥 안주",
    wine: "와인바",
    kaoliang: "고량주 중식"
  };

  return intents[drinkType] || "술집 안주";
}

function buildExpandedQueries(stationLabel, menuLabel, alcoholMode, drinkType) {
  const keywords = getRelatedMenuKeywords(menuLabel);
  const drinkLabel = getDrinkLabel(drinkType);
  const drinkIntent = getDrinkSearchIntent(drinkType);
  const baseQueries = alcoholMode === "drinks"
    ? [
        `${stationLabel} ${drinkIntent}`,
        drinkLabel ? `${stationLabel} ${drinkLabel} 안주` : "",
        ...keywords.flatMap((keyword) => [
          drinkLabel ? `${stationLabel} ${keyword} ${drinkLabel}` : "",
          `${stationLabel} ${keyword} 술집`,
          `${stationLabel} ${keyword} 안주`
        ]),
        `${stationLabel} 술집`,
        `${stationLabel} 이자카야`
      ]
    : [
        buildRestaurantQuery(stationLabel, menuLabel, alcoholMode),
        `${stationLabel} 맛집`,
        `${stationLabel} 식당`,
        `${stationLabel} 밥집`,
        `${stationLabel} 점심`,
        `${stationLabel} 저녁`,
        ...keywords.flatMap((keyword) => [
          `${stationLabel} ${keyword} 맛집`,
          `${stationLabel} ${keyword} 식당`
        ])
      ];

  return [...new Set(baseQueries.map((query) => query.replace(/\s+/g, " ").trim()).filter(Boolean))]
    .slice(0, maxExpandedQueries);
}

function buildKakaoKeywordQueries(menuLabel, alcoholMode, drinkType) {
  const keywords = getRelatedMenuKeywords(menuLabel);
  const drinkLabel = getDrinkLabel(drinkType);
  const drinkIntent = getDrinkSearchIntent(drinkType);
  const baseQueries = alcoholMode === "drinks"
    ? [
        drinkIntent,
        drinkLabel ? `${drinkLabel} 안주` : "",
        ...keywords.flatMap((keyword) => [
          drinkLabel ? `${keyword} ${drinkLabel}` : "",
          `${keyword} 술집`,
          `${keyword} 안주`
        ]),
        "술집",
        "이자카야"
      ]
    : keywords.flatMap((keyword) => [`${keyword} 식사`, `${keyword} 맛집`, keyword]);

  return [...new Set(baseQueries.map((query) => query.replace(/\s+/g, " ").trim()).filter(Boolean))]
    .slice(0, maxExpandedQueries);
}

async function fetchNaverLocal(query, { display = 5, sort = "random", start = 1 } = {}) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  const apiUrl = new URL("https://openapi.naver.com/v1/search/local.json");
  apiUrl.searchParams.set("query", query);
  apiUrl.searchParams.set("display", String(display));
  apiUrl.searchParams.set("start", String(start));
  apiUrl.searchParams.set("sort", sort);

  const apiResponse = await fetch(apiUrl, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret
    }
  });
  const data = await apiResponse.json();

  if (!apiResponse.ok) {
    throw new Error(data.errorMessage || apiResponse.statusText);
  }

  return data;
}

async function fetchNaverWebSearch(query, { display = 10, start = 1 } = {}) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  const apiUrl = new URL("https://openapi.naver.com/v1/search/webkr.json");
  apiUrl.searchParams.set("query", query);
  apiUrl.searchParams.set("display", String(display));
  apiUrl.searchParams.set("start", String(start));

  const apiResponse = await fetch(apiUrl, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret
    }
  });
  const data = await apiResponse.json();

  if (!apiResponse.ok) {
    throw new Error(data.errorMessage || apiResponse.statusText);
  }

  return data;
}

function safeDecode(value = "") {
  let decoded = String(value);

  for (let index = 0; index < 3; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded;
}

function normalizeNaverReservationUrl(rawUrl = "") {
  let url = safeDecode(cleanHtml(rawUrl))
    .replace(/&amp;/g, "&")
    .trim()
    .replace(/^[("'[]+/, "")
    .replace(/[)"'\].,]+$/, "");

  if (url.startsWith("//")) url = `https:${url}`;
  if (/^(?:m\.)?booking\.naver\.com\//.test(url)) url = `https://${url}`;

  try {
    const parsed = new URL(url);
    const allowedHosts = new Set(["booking.naver.com", "m.booking.naver.com"]);
    if (!allowedHosts.has(parsed.hostname)) return "";
    if (!/^\/booking\/\d+\/bizes\/\d+/.test(parsed.pathname)) return "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function extractNaverReservationUrls(...values) {
  const text = values
    .map((value) => safeDecode(cleanHtml(value)))
    .join(" ");
  const matches = text.match(/(?:https?:\/\/)?(?:m\.)?booking\.naver\.com\/booking\/\d+\/bizes\/\d+(?:\/items\/\d+)?(?:\?[^\s"'<>]*)?/g) || [];

  return [...new Set(matches.map(normalizeNaverReservationUrl).filter(Boolean))];
}

function getReservationLinkCache(key) {
  const cached = reservationLinkCache.get(key);
  if (!cached) return undefined;

  if (Date.now() - cached.createdAt > reservationLinkCacheTtlMs) {
    reservationLinkCache.delete(key);
    return undefined;
  }

  return cached.value;
}

function setReservationLinkCache(key, value) {
  reservationLinkCache.set(key, {
    createdAt: Date.now(),
    value
  });
}

function isInvalidNaverReservationPage(html = "", finalUrl = "") {
  const text = cleanHtml(html);
  return (
    /운영하지 않는\s*예약 페이지/.test(text) ||
    /error_wrapper|error\/bizes/.test(html) ||
    /\/error(?:\?|$|\/)/.test(finalUrl)
  );
}

async function validateNaverReservationUrl(url) {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0"
      }
    });
    const html = await response.text();

    if (!response.ok) return false;
    if (isInvalidNaverReservationPage(html, response.url || url)) return false;
    return /__LOADABLE_REQUIRED_CHUNKS__|Booking-Business|booking\/\d+\/bizes\//.test(html);
  } catch {
    return false;
  }
}

function buildReservationSearchQueries(item, location = "") {
  const title = cleanHtml(item.title);
  const address = cleanHtml(item.address);
  const place = cleanHtml(location);

  return [...new Set([
    `${title} ${address} m.booking.naver.com`,
    `${title} ${place} m.booking.naver.com`,
    `${title} ${place} 네이버 예약`,
    `${title} 네이버예약`
  ].map((query) => query.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

async function findNaverReservationLink(item, { location = "" } = {}) {
  const cacheKey = `${cleanHtml(item.title)}|${cleanHtml(item.address)}|${cleanHtml(location)}`;
  const cached = getReservationLinkCache(cacheKey);
  if (cached !== undefined) return cached;

  const directUrls = extractNaverReservationUrls(item.link, item.bookingSearchUrl, item.description);
  for (const url of directUrls) {
    if (await validateNaverReservationUrl(url)) {
      const value = { url, sourceTitle: item.title, source: "direct" };
      setReservationLinkCache(cacheKey, value);
      return value;
    }
  }

  for (const query of buildReservationSearchQueries(item, location)) {
    let data = null;
    try {
      data = await fetchNaverWebSearch(query, { display: naverReservationSearchDisplaySize });
    } catch {
      continue;
    }

    const documents = Array.isArray(data?.items) ? data.items : [];

    for (const [index, document] of documents.entries()) {
      const urls = extractNaverReservationUrls(document.link, document.title, document.description);
      for (const url of urls) {
        if (await validateNaverReservationUrl(url)) {
          const value = {
            url,
            sourceTitle: cleanHtml(document.title),
            source: "webkr",
            sourceRank: index + 1
          };
          setReservationLinkCache(cacheKey, value);
          return value;
        }
      }
    }
  }

  setReservationLinkCache(cacheKey, null);
  return null;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

async function keepOnlyItemsWithNaverReservations(items, context = {}) {
  const candidates = items.slice(0, maxReservationCheckCandidates);
  const checkedItems = await mapWithConcurrency(candidates, reservationSearchConcurrency, async (item) => {
    const reservation = await findNaverReservationLink(item, context);
    if (!reservation?.url) return null;

    const description = item.description
      ? `${item.description} · 네이버 예약 링크 확인`
      : "네이버 예약 링크 확인";

    return {
      ...item,
      description,
      bookingSearchUrl: reservation.url,
      hasNaverReservation: true,
      reservationLinkSource: reservation.source,
      reservationLinkSourceTitle: reservation.sourceTitle || ""
    };
  });

  return sortByRecommendation(checkedItems.filter(Boolean), context)
    .slice(0, maxRestaurantResults);
}

async function resolveStationCenter(location) {
  const stationName = normalizeStationName(location);
  if (!stationName) return null;
  if (stationCache.has(stationName)) return stationCache.get(stationName);

  const kakaoKey = process.env.KAKAO_REST_API_KEY;

  if (kakaoKey) {
    const apiUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    apiUrl.searchParams.set("query", stationName);
    apiUrl.searchParams.set("category_group_code", "SW8");
    apiUrl.searchParams.set("size", "5");
    apiUrl.searchParams.set("sort", "accuracy");

    try {
      const apiResponse = await fetch(apiUrl, {
        headers: { Authorization: `KakaoAK ${kakaoKey}` }
      });
      const data = await apiResponse.json();
      const station = Array.isArray(data.documents) ? data.documents.find(isStationItem) || data.documents[0] : null;

      if (apiResponse.ok && station) {
        const center = {
          label: cleanHtml(station.place_name || stationName),
          lon: Number(station.x),
          lat: Number(station.y),
          source: "kakao-station"
        };
        stationCache.set(stationName, center);
        return center;
      }
    } catch {
      // Fall back to Naver below.
    }
  }

  try {
    const stationQueries = [stationName, `${stationName} 지하철역`, `${stationName} 전철역`];

    for (const query of stationQueries) {
      const data = await fetchNaverLocal(query, { display: 5, sort: "random" });
      const items = Array.isArray(data?.items) ? data.items : [];
      const station = items.find(isStationItem) || items.find((item) => cleanHtml(item.title || "").includes(stationName));
      const coords = station ? parseScaledCoordinate(station.mapx, station.mapy) : null;

      if (station && coords) {
        const center = {
          label: cleanHtml(station.title || stationName),
          lon: coords.lon,
          lat: coords.lat,
          source: "naver-station"
        };
        stationCache.set(stationName, center);
        return center;
      }
    }
  } catch {
    // The caller will continue without radius filtering.
  }

  return { label: stationName, lon: null, lat: null, source: "station-name-only" };
}

function addDistance(item, center, coords) {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon) || !coords) {
    return item;
  }

  const meters = Math.round(distanceMeters(center, coords));
  return {
    ...item,
    distanceMeters: meters,
    distanceText: `${center.label} 기준 ${formatDistance(meters)}`
  };
}

function withinStationRadius(item) {
  return Number.isFinite(item.distanceMeters) && item.distanceMeters <= stationRadiusMeters;
}

function applyStationRadiusFilter(items, hasStationCoordinates) {
  return hasStationCoordinates ? items.filter(withinStationRadius) : items;
}

function sortByDistance(items) {
  return [...items].sort((a, b) => {
    const distanceA = Number.isFinite(a.distanceMeters) ? a.distanceMeters : Number.POSITIVE_INFINITY;
    const distanceB = Number.isFinite(b.distanceMeters) ? b.distanceMeters : Number.POSITIVE_INFINITY;
    return distanceA - distanceB;
  });
}

function normalizeNaverItem(item, location = "", center = null, metadata = {}) {
  const title = cleanHtml(item.title);
  const category = cleanHtml(item.category);
  const address = cleanHtml(item.roadAddress || item.address);
  const placeSearchHint = buildLookupText(title, location);
  const coords = parseScaledCoordinate(item.mapx, item.mapy);

  return addDistance({
    title,
    category,
    address,
    description: cleanHtml(item.description),
    link: item.link || "",
    mapx: item.mapx || "",
    mapy: item.mapy || "",
    source: "naver",
    ...metadata,
    ...buildSearchLinks(title, address, placeSearchHint, placeSearchHint)
  }, center, coords);
}

function normalizeKakaoItem(item, location = "", center = null, metadata = {}) {
  const title = cleanHtml(item.place_name);
  const category = cleanHtml(item.category_name);
  const address = cleanHtml(item.road_address_name || item.address_name);
  const placeSearchHint = buildLookupText(title, location);
  const coords = {
    lon: Number(item.x),
    lat: Number(item.y)
  };

  return addDistance({
    title,
    category,
    address,
    description: item.phone
      ? `전화 ${cleanHtml(item.phone)} · 카카오맵 상세에서 평점 확인`
      : "카카오맵 상세에서 평점 확인",
    link: item.place_url || "",
    mapx: item.x || "",
    mapy: item.y || "",
    source: "kakao",
    ...metadata,
    ...buildSearchLinks(title, address, placeSearchHint, placeSearchHint),
    kakaoMapUrl: item.place_url || buildSearchLinks(title, address, placeSearchHint, placeSearchHint).kakaoMapUrl
  }, center, coords);
}

function buildManualItem(location, restaurantName, menuLabel, alcoholMode, drinkType) {
  const title = cleanHtml(restaurantName);
  const address = location ? `${cleanHtml(location)} 인근` : "";
  const modeLabel = alcoholModeLabels[alcoholMode] || alcoholModeLabels.meal;
  const drinkLabel = alcoholMode === "drinks" ? getDrinkLabel(drinkType) : "";

  return {
    title,
    category: `${menuLabel} · ${modeLabel}${drinkLabel ? ` (${drinkLabel})` : ""} · 직접 입력`,
    address: address || "주소는 지도에서 확인",
    description: "사용자가 입력한 식당명입니다. 카카오맵 평점과 네이버 예약 가능 여부를 확인하세요.",
    link: "",
    mapx: "",
    mapy: "",
    source: "manual",
    ...buildSearchLinks(title, address, buildLookupText(title, location), buildLookupText(title, location))
  };
}

function buildFallbackLinks(query) {
  return {
    naverSearchUrl: `https://m.place.naver.com/place/list?query=${encodeURIComponent(query)}`,
    kakaoMapUrl: `https://map.kakao.com/?q=${encodeURIComponent(query)}`
  };
}

function getMenuLabel(category, customMenu) {
  const typedMenu = cleanHtml(customMenu).trim();
  if (category === "other" && typedMenu) return typedMenu;
  return categoryLabels[category] || "한식";
}

function buildRestaurantQuery(location, menuLabel, alcoholMode, drinkType) {
  const base = `${location} ${menuLabel === "기타" ? "" : menuLabel}`.replace(/\s+/g, " ").trim();
  const intent = alcoholMode === "drinks" ? getDrinkSearchIntent(drinkType) : "식사";
  return `${base} ${intent} 맛집`.replace(/\s+/g, " ").trim();
}

async function searchRestaurants(requestUrl) {
  const location = requestUrl.searchParams.get("location")?.trim() || "";
  const category = requestUrl.searchParams.get("category") || "korean";
  const customMenu = requestUrl.searchParams.get("customMenu")?.trim() || "";
  const restaurantName = requestUrl.searchParams.get("restaurantName")?.trim() || "";
  const alcoholMode = requestUrl.searchParams.get("alcoholMode") === "drinks" ? "drinks" : "meal";
  const requestedDrinkType = requestUrl.searchParams.get("drinkType") || "";
  const drinkType = alcoholMode === "drinks" && drinkTypeLabels[requestedDrinkType] ? requestedDrinkType : "";
  const menuLabel = getMenuLabel(category, customMenu);
  const query = restaurantName
    ? cleanHtml(restaurantName)
    : buildRestaurantQuery(location, menuLabel, alcoholMode, drinkType);

  if (!location && !restaurantName) {
    return {
      status: 400,
      payload: { error: "장소 또는 식당명을 입력해 주세요." }
    };
  }

  if (restaurantName) {
    const manualItem = buildManualItem(location, restaurantName, menuLabel, alcoholMode, drinkType);
    const items = await keepOnlyItemsWithNaverReservations([manualItem], {
      location,
      menuLabel,
      alcoholMode,
      drinkType
    });

    return {
      status: 200,
      payload: {
        source: "manual",
        query,
        total: items.length,
        reservationOnly: true,
        warning: items.length
          ? ""
          : "입력한 식당명으로 확인된 네이버 예약 링크를 찾지 못했습니다.",
        items
      }
    };
  }

  const stationCenter = await resolveStationCenter(location);
  const stationSearchLabel = normalizeStationName(location);
  const stationDisplayLabel = stationCenter?.label || stationSearchLabel;
  const stationScopedQuery = buildRestaurantQuery(stationSearchLabel, menuLabel, alcoholMode, drinkType);
  const hasStationCoordinates = Number.isFinite(stationCenter?.lon) && Number.isFinite(stationCenter?.lat);
  const kakaoKey = process.env.KAKAO_REST_API_KEY;
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const radiusWarning = hasStationCoordinates
    ? ""
    : "입력한 지하철역의 좌표를 찾지 못해 1km 거리 필터는 생략하고, 역명 기반 후보를 보여줍니다.";
  const searchMode = kakaoKey ? "kakao" : "naver";
  const cacheKey = [
    searchMode,
    stationDisplayLabel,
    stationCenter?.lon,
    stationCenter?.lat,
    stationSearchLabel,
    menuLabel,
    alcoholMode,
    drinkType
  ].join("|");
  const cachedPayload = getRestaurantCache(cacheKey);
  if (cachedPayload) {
    return {
      status: 200,
      payload: cachedPayload
    };
  }

  if (kakaoKey && hasStationCoordinates) {
    try {
      const allItems = [];
      let total = 0;

      for (const keyword of buildKakaoKeywordQueries(menuLabel, alcoholMode, drinkType)) {
        const apiUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
        apiUrl.searchParams.set("query", keyword);
        apiUrl.searchParams.set("category_group_code", "FD6");
        apiUrl.searchParams.set("size", String(kakaoLocalDisplaySize));
        apiUrl.searchParams.set("sort", "distance");
        apiUrl.searchParams.set("x", String(stationCenter.lon));
        apiUrl.searchParams.set("y", String(stationCenter.lat));
        apiUrl.searchParams.set("radius", String(stationRadiusMeters));

        const apiResponse = await fetch(apiUrl, {
          headers: {
            Authorization: `KakaoAK ${kakaoKey}`
          }
        });

        const data = await apiResponse.json();
        if (!apiResponse.ok) continue;

        total += data.meta?.total_count || 0;
        if (Array.isArray(data.documents)) {
          const baseRank = allItems.length;
          allItems.push(
            ...data.documents
              .map((item, index) => normalizeKakaoItem(item, stationSearchLabel, stationCenter, {
                sourceRank: baseRank + index + 1,
                sourceQuery: keyword
              }))
              .filter((item) => isFoodCategory(item.category))
              .filter(withinStationRadius)
          );
        }

        if (dedupeItems(allItems).length >= maxReservationCheckCandidates) break;
      }

      const candidates = sortByRecommendation(dedupeItems(allItems), { menuLabel, alcoholMode, drinkType });
      const items = await keepOnlyItemsWithNaverReservations(candidates, {
        location: stationSearchLabel,
        menuLabel,
        alcoholMode,
        drinkType
      });

      if (items.length) {
        const payload = {
          source: "kakao-local-search-expanded",
          query: stationScopedQuery,
          station: stationCenter,
          radiusMeters: stationRadiusMeters,
          radiusApplied: true,
          reservationOnly: true,
          unfilteredCount: dedupeItems(allItems).length,
          total,
          items
        };
        setRestaurantCache(cacheKey, payload);

        return {
          status: 200,
          payload
        };
      }
    } catch {
      // Fall through to Naver or link-only guidance below.
    }
  }

  if (!clientId || !clientSecret) {
    return {
      status: 200,
      payload: {
        source: "link-only",
        query: stationScopedQuery,
        warning:
          "실제 식당명을 앱 안에 표시하려면 KAKAO_REST_API_KEY 또는 NAVER_CLIENT_ID/NAVER_CLIENT_SECRET이 필요합니다.",
        needsApiKey: true,
        station: stationCenter,
        radiusMeters: stationRadiusMeters,
        radiusApplied: hasStationCoordinates,
        fallbackLinks: buildFallbackLinks(stationScopedQuery),
        items: []
      }
    };
  }

  try {
    const allItems = [];
    let total = 0;
    let lastError = null;

    for (const sortMode of naverLocalSortModes) {
      for (const expandedQuery of buildExpandedQueries(stationSearchLabel, menuLabel, alcoholMode, drinkType)) {
        for (let page = 0; page < naverLocalPagesPerQuery; page += 1) {
          const start = page * naverLocalDisplaySize + 1;
          let data = null;
          try {
            data = await fetchNaverLocal(expandedQuery, { display: naverLocalDisplaySize, sort: sortMode, start });
          } catch (error) {
            lastError = error;
            break;
          }

          if (sortMode === "comment" && page === 0) total += data?.total || 0;

          if (Array.isArray(data?.items)) {
            const baseRank = allItems.length;
            allItems.push(
              ...data.items
                .map((item, index) => normalizeNaverItem(item, stationSearchLabel, stationCenter, {
                  sourceRank: baseRank + index + 1,
                  sourceQuery: expandedQuery,
                  sourceSort: sortMode
                }))
                .filter((item) => isFoodCategory(item.category))
            );
          }

          if (dedupeItems(allItems).length >= maxReservationCheckCandidates) break;
        }

        if (dedupeItems(allItems).length >= maxReservationCheckCandidates) break;
      }

      if (dedupeItems(allItems).length >= maxReservationCheckCandidates) break;
    }

    const candidates = sortByRecommendation(
      applyStationRadiusFilter(dedupeItems(allItems), hasStationCoordinates),
      { menuLabel, alcoholMode, drinkType }
    );
    const items = await keepOnlyItemsWithNaverReservations(candidates, {
      location: stationSearchLabel,
      menuLabel,
      alcoholMode,
      drinkType
    });

    if (!candidates.length && lastError) {
      throw lastError;
    }

    const payload = {
      source: "naver-local-search-expanded",
      query: stationScopedQuery,
      station: stationCenter,
      radiusMeters: stationRadiusMeters,
      radiusApplied: hasStationCoordinates,
      reservationOnly: true,
      unfilteredCount: candidates.length,
      warning: items.length
        ? radiusWarning
        : "조건에 맞는 후보 중 확인된 네이버 예약 링크가 있는 식당을 찾지 못했습니다. 장소나 카테고리를 조금 넓혀 보세요.",
      total,
      items
    };
    setRestaurantCache(cacheKey, payload);

    return {
      status: 200,
      payload
    };
  } catch (error) {
    return {
      status: 200,
      payload: {
        source: "link-only",
        query: stationScopedQuery,
        warning: `네이버 지역 검색 요청에 실패했습니다: ${error.message}`,
        needsApiKey: true,
        station: stationCenter,
        radiusMeters: stationRadiusMeters,
        radiusApplied: hasStationCoordinates,
        fallbackLinks: buildFallbackLinks(stationScopedQuery),
        items: []
      }
    };
  }
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url, "http://localhost");
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const normalized = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, normalized);

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    notFound(response);
    return;
  }

  response.writeHead(200, {
    "content-type": mimeTypes.get(extname(filePath)) || "application/octet-stream",
    "cache-control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url, "http://localhost");

  if (requestUrl.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (requestUrl.pathname === "/api/auth/status") {
    sendJson(response, 200, {
      protected: Boolean(appPin),
      authenticated: hasAppAccess(request)
    });
    return;
  }

  if (requestUrl.pathname === "/api/auth" && request.method === "POST") {
    try {
      await authenticate(request, response);
    } catch {
      sendJson(response, 400, { error: "PIN 확인에 실패했습니다." });
    }
    return;
  }

  if (requestUrl.pathname.startsWith("/api/") && !hasAppAccess(request)) {
    sendJson(response, 401, { error: "접근 PIN이 필요합니다.", needsPin: true });
    return;
  }

  if (requestUrl.pathname === "/api/settings" && request.method === "GET") {
    sendJson(response, 200, getSettingsStatus());
    return;
  }

  if (requestUrl.pathname === "/api/settings" && request.method === "POST") {
    try {
      sendJson(response, 200, await updateSettings(request));
    } catch (error) {
      sendJson(response, 400, { error: error.message || "API 키 저장에 실패했습니다." });
    }
    return;
  }

  if (requestUrl.pathname === "/api/search") {
    const result = await searchRestaurants(requestUrl);
    sendJson(response, result.status, result.payload);
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }

  serveStatic(request, response);
});

server.listen(port, host, () => {
  console.log(`Naver reservation helper running at http://${host}:${port}`);
});

const form = document.querySelector("#reservationForm");
const fillDemoButton = document.querySelector("#fillDemoButton");
const copyPlanButton = document.querySelector("#copyPlanButton");
const results = document.querySelector("#results");
const resultMeta = document.querySelector("#resultMeta");
const statusTitle = document.querySelector("#statusTitle");
const statusDetail = document.querySelector("#statusDetail");
const template = document.querySelector("#restaurantTemplate");
const customMenuField = document.querySelector("#customMenuField");
const customMenuInput = document.querySelector("#customMenuInput");
const drinkTypeField = document.querySelector("#drinkTypeField");
const restaurantNameInput = document.querySelector("#restaurantNameInput");
const settingsPanel = document.querySelector("#settingsPanel");
const apiSettingsForm = document.querySelector("#apiSettingsForm");
const settingsStatus = document.querySelector("#settingsStatus");
const naverClientIdInput = document.querySelector("#naverClientIdInput");
const naverClientSecretInput = document.querySelector("#naverClientSecretInput");
const kakaoRestApiKeyInput = document.querySelector("#kakaoRestApiKeyInput");
const recommendationTitle = document.querySelector("#recommendationTitle");
const recommendationDetail = document.querySelector("#recommendationDetail");
const installAppButton = document.querySelector("#installAppButton");
const recentSearches = document.querySelector("#recentSearches");
const recentSearchList = document.querySelector("#recentSearchList");
const clearRecentButton = document.querySelector("#clearRecentButton");
const mobileSearchButton = document.querySelector("#mobileSearchButton");
const scrollTopButton = document.querySelector("#scrollTopButton");
let deferredInstallPrompt = null;

const categoryLabel = {
  korean: "한식",
  japanese: "일식",
  chinese: "중식",
  western: "양식",
  other: "기타"
};

const alcoholLabel = {
  meal: "식사 중심",
  drinks: "술과 함께"
};

const drinkTypeLabel = {
  soju: "소주",
  beer: "맥주",
  somaek: "소맥",
  wine: "와인",
  kaoliang: "고량주"
};

const menuRecommendations = {
  korean: {
    meal: ["백반", "국밥", "불고기 정식", "비빔밥"],
    drinks: ["전", "보쌈", "곱창전골", "매운탕"]
  },
  japanese: {
    meal: ["초밥", "라멘", "돈카츠", "덮밥"],
    drinks: ["사시미", "야키토리", "오뎅", "이자카야 안주"]
  },
  chinese: {
    meal: ["짜장면", "짬뽕", "볶음밥", "마파두부덮밥"],
    drinks: ["양꼬치", "마라샹궈", "깐풍기", "고추잡채"]
  },
  western: {
    meal: ["파스타", "리조또", "스테이크", "샐러드"],
    drinks: ["감바스", "타파스", "스테이크", "치즈 플레이트"]
  },
  other: {
    meal: ["정식 메뉴", "대표 메뉴", "국물 요리", "구이 메뉴"],
    drinks: ["안주 메뉴", "구이 메뉴", "튀김 메뉴", "국물 요리"]
  }
};

const drinkMenuRecommendations = {
  soju: {
    korean: ["삼겹살", "전", "보쌈", "매운탕"],
    japanese: ["사시미", "오뎅탕", "꼬치구이", "나가사키짬뽕"],
    chinese: ["마라샹궈", "깐풍기", "양꼬치", "고추잡채"],
    western: ["매콤한 파스타", "감바스", "구운 소시지", "스튜"],
    other: ["매운 안주", "구이 메뉴", "국물 요리", "튀김 메뉴"]
  },
  beer: {
    korean: ["치킨", "전", "튀김", "제육볶음"],
    japanese: ["야키토리", "가라아게", "오코노미야키", "돈카츠"],
    chinese: ["꿔바로우", "깐풍기", "마라샹궈", "군만두"],
    western: ["피자", "버거", "감바스", "피시앤칩스"],
    other: ["튀김 메뉴", "구이 메뉴", "매콤한 안주", "대표 안주"]
  },
  somaek: {
    korean: ["삼겹살", "닭갈비", "곱창전골", "감자탕"],
    japanese: ["야키토리", "가라아게", "철판요리", "오뎅"],
    chinese: ["양꼬치", "깐풍기", "마라탕", "볶음요리"],
    western: ["스테이크", "바비큐", "피자", "매콤한 파스타"],
    other: ["든든한 안주", "구이 메뉴", "전골 메뉴", "매운 메뉴"]
  },
  wine: {
    korean: ["육회", "불고기", "한우구이", "전복요리"],
    japanese: ["사시미", "스시", "우니", "가이세키"],
    chinese: ["동파육", "유린기", "멘보샤", "가지튀김"],
    western: ["스테이크", "파스타", "치즈 플레이트", "샐러드"],
    other: ["치즈 메뉴", "구이 메뉴", "해산물 요리", "가벼운 안주"]
  },
  kaoliang: {
    korean: ["매운 갈비찜", "수육", "전골", "돼지갈비"],
    japanese: ["꼬치구이", "철판요리", "가라아게", "매운 나베"],
    chinese: ["양꼬치", "마라샹궈", "깐풍기", "동파육"],
    western: ["매운 스테이크", "바비큐", "향신료 강한 구이", "스튜"],
    other: ["향신료 있는 안주", "구이 메뉴", "매운 메뉴", "기름진 안주"]
  }
};

let currentPlan = null;
let currentRestaurant = null;
let authReadyPromise = null;
const recentSearchStorageKey = "reservationHelper.recentSearches";
const maxRecentSearches = 5;

function getPlan() {
  const data = new FormData(form);
  const category = String(data.get("category") || "korean");
  const alcoholMode = String(data.get("alcoholMode") || "meal") === "drinks" ? "drinks" : "meal";
  const drinkType = alcoholMode === "drinks" && drinkTypeLabel[data.get("drinkType")]
    ? String(data.get("drinkType"))
    : "";
  return {
    location: String(data.get("location") || "").trim(),
    restaurantName: String(data.get("restaurantName") || "").trim(),
    date: String(data.get("date") || ""),
    time: String(data.get("time") || ""),
    people: Number.parseInt(String(data.get("people") || "1"), 10),
    category,
    alcoholMode,
    drinkType,
    customMenu: category === "other" ? String(data.get("customMenu") || "").trim() : ""
  };
}

function getRecentSearches() {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentSearchStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getRecentLabel(plan) {
  const category = categoryLabel[plan.category] || "한식";
  const mode = alcoholLabel[plan.alcoholMode] || "식사 중심";
  const drink = plan.alcoholMode === "drinks" && plan.drinkType
    ? `/${drinkTypeLabel[plan.drinkType] || "주종"}`
    : "";
  const place = plan.restaurantName || plan.location || "장소";
  const menu = plan.customMenu ? `${category}/${plan.customMenu}` : category;
  return `${place} · ${menu} · ${mode}${drink}`;
}

function normalizeRecentPlan(plan) {
  return {
    location: plan.location || "",
    restaurantName: plan.restaurantName || "",
    people: Number.isFinite(plan.people) ? plan.people : 2,
    category: plan.category || "korean",
    alcoholMode: plan.alcoholMode || "meal",
    drinkType: plan.drinkType || "soju",
    customMenu: plan.customMenu || ""
  };
}

function saveRecentSearch(plan) {
  const nextPlan = normalizeRecentPlan(plan);
  if (!nextPlan.location && !nextPlan.restaurantName) return;

  const key = JSON.stringify(nextPlan);
  const existing = getRecentSearches().filter((item) => JSON.stringify(normalizeRecentPlan(item)) !== key);
  const next = [nextPlan, ...existing].slice(0, maxRecentSearches);
  localStorage.setItem(recentSearchStorageKey, JSON.stringify(next));
}

function applyRecentSearch(plan) {
  const normalized = normalizeRecentPlan(plan);
  document.querySelector("#locationInput").value = normalized.location;
  restaurantNameInput.value = normalized.restaurantName;
  document.querySelector("#peopleInput").value = String(normalized.people);
  document.querySelector(`input[name="category"][value="${normalized.category}"]`).checked = true;
  document.querySelector(`input[name="alcoholMode"][value="${normalized.alcoholMode}"]`).checked = true;
  const drinkTypeInput = document.querySelector(`input[name="drinkType"][value="${normalized.drinkType}"]`);
  if (drinkTypeInput) drinkTypeInput.checked = true;
  customMenuInput.value = normalized.customMenu;
  updateDrinkTypeVisibility();
  updateCustomMenuVisibility();
  updateMenuRecommendation();
  setStatus("최근 검색 적용됨", getRecentLabel(normalized));
}

function renderRecentSearches() {
  const searches = getRecentSearches();
  recentSearches.classList.toggle("is-hidden", searches.length === 0);
  recentSearchList.innerHTML = "";

  for (const plan of searches) {
    const button = document.createElement("button");
    button.className = "recent-chip";
    button.type = "button";
    button.textContent = getRecentLabel(plan);
    button.addEventListener("click", () => applyRecentSearch(plan));
    recentSearchList.append(button);
  }
}

function setStatus(title, detail) {
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

async function ensureAppAccess(forcePrompt = false) {
  if (authReadyPromise && !forcePrompt) return authReadyPromise;

  authReadyPromise = (async () => {
    let authStatus = null;

    try {
      const response = await fetch("/api/auth/status");
      authStatus = await response.json();
    } catch {
      setStatus("서버 연결 필요", "앱 서버가 켜져 있는지 확인해 주세요.");
      return false;
    }

    if (!authStatus.protected || (authStatus.authenticated && !forcePrompt)) {
      return true;
    }

    const pin = window.prompt("예약 도우미 접근 PIN을 입력해 주세요.");
    if (!pin) {
      setStatus("PIN 필요", "LTE 공개 주소에서는 접근 PIN을 입력해야 검색할 수 있습니다.");
      return false;
    }

    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin })
    });
    const payload = await response.json();

    if (!response.ok) {
      setStatus("PIN 확인 실패", payload.error || "PIN이 맞지 않습니다.");
      return false;
    }

    setStatus("PIN 확인됨", "이제 이 기기에서 예약 도우미를 사용할 수 있습니다.");
    return true;
  })();

  const ok = await authReadyPromise;
  if (!ok) authReadyPromise = null;
  return ok;
}

function getPlanMemo() {
  const plan = currentPlan || getPlan();
  const label = categoryLabel[plan.category] || "한식";
  const menuText = plan.customMenu ? `${label} (${plan.customMenu})` : label;
  const recommendation = getMenuRecommendation(plan);
  const drinkText = plan.alcoholMode === "drinks" && plan.drinkType
    ? `주종: ${drinkTypeLabel[plan.drinkType] || plan.drinkType}`
    : "";
  return [
    `예약 조건`,
    `장소: ${plan.location || "-"}`,
    `날짜: ${plan.date || "-"}`,
    `시간: ${plan.time || "-"}`,
    `인원: ${Number.isFinite(plan.people) ? `${plan.people}명` : "-"}`,
    `메뉴: ${menuText}`,
    `이용 방식: ${alcoholLabel[plan.alcoholMode] || "식사 중심"}`,
    drinkText,
    `추천 음식: ${recommendation.items.join(", ")}`,
    plan.restaurantName ? `식당명: ${plan.restaurantName}` : "",
    currentRestaurant ? `후보: ${currentRestaurant.title}` : "",
    `평점 확인: 카카오맵 기준`
  ]
    .filter(Boolean)
    .join("\n");
}

function getMenuRecommendation(plan = getPlan()) {
  const mode = plan.alcoholMode === "drinks" ? "drinks" : "meal";
  const recommendations = menuRecommendations[plan.category] || menuRecommendations.korean;
  let items = recommendations[mode] || recommendations.meal;

  if (mode === "drinks" && plan.drinkType) {
    const drinkRecommendations = drinkMenuRecommendations[plan.drinkType] || drinkMenuRecommendations.soju;
    items = drinkRecommendations[plan.category] || drinkRecommendations.other || items;
  }

  if (plan.category === "other" && plan.customMenu) {
    items = mode === "drinks"
      ? [`${plan.customMenu} 안주`, `${plan.customMenu} 구이`, `${drinkTypeLabel[plan.drinkType] || "술"} 페어링 메뉴`, "국물 요리"]
      : [`${plan.customMenu} 대표 메뉴`, `${plan.customMenu} 정식`, "국물 요리", "구이 메뉴"];
  }

  const title = mode === "drinks" && plan.drinkType
    ? `${drinkTypeLabel[plan.drinkType] || "술"}에 맞춘 추천 음식`
    : mode === "drinks"
      ? "술과 어울리는 추천 음식"
      : "식사 중심 추천 음식";
  const detail = `${items.join(", ")} 쪽으로 검색 의도를 맞춥니다.`;

  return { title, detail, items };
}

function updateMenuRecommendation() {
  const recommendation = getMenuRecommendation();
  recommendationTitle.textContent = recommendation.title;
  recommendationDetail.textContent = recommendation.detail;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const field = document.createElement("textarea");
  field.value = text;
  document.body.append(field);
  field.select();
  document.execCommand("copy");
  field.remove();
}

function formatSettingsStatus(settings) {
  const naverReady = settings.naverClientId && settings.naverClientSecret;
  const kakaoReady = settings.kakaoRestApiKey;
  const parts = [];

  parts.push(naverReady ? `네이버 저장됨 (${settings.naverClientIdPreview})` : "네이버 키 없음");
  parts.push(kakaoReady ? `카카오 저장됨 (${settings.kakaoRestApiKeyPreview})` : "카카오 키 없음");

  return parts.join(" · ");
}

function updateSettingsPanelVisibility(settings) {
  const naverReady = settings.naverClientId && settings.naverClientSecret;
  const kakaoReady = settings.kakaoRestApiKey;
  const shouldHide = naverReady || kakaoReady;
  settingsPanel.classList.toggle("is-hidden", shouldHide);
  settingsPanel.setAttribute("aria-hidden", String(shouldHide));
}

async function loadSettingsStatus() {
  try {
    const hasAccess = await ensureAppAccess();
    if (!hasAccess) {
      settingsStatus.textContent = "PIN 확인 후 저장 상태를 볼 수 있습니다.";
      return;
    }

    const response = await fetch("/api/settings");
    const settings = await response.json();
    settingsStatus.textContent = formatSettingsStatus(settings);
    updateSettingsPanelVisibility(settings);
  } catch {
    settingsPanel.classList.remove("is-hidden");
    settingsPanel.setAttribute("aria-hidden", "false");
    settingsStatus.textContent = "저장 상태를 확인하지 못했습니다.";
  }
}

async function saveApiSettings(event) {
  event.preventDefault();

  const hasAccess = await ensureAppAccess(true);
  if (!hasAccess) return;

  const payload = {};
  if (naverClientIdInput.value.trim()) payload.NAVER_CLIENT_ID = naverClientIdInput.value.trim();
  if (naverClientSecretInput.value.trim()) payload.NAVER_CLIENT_SECRET = naverClientSecretInput.value.trim();
  if (kakaoRestApiKeyInput.value.trim()) payload.KAKAO_REST_API_KEY = kakaoRestApiKeyInput.value.trim();

  if (!Object.keys(payload).length) {
    settingsStatus.textContent = "붙여넣은 값이 없습니다.";
    return;
  }

  settingsStatus.textContent = "저장 중입니다.";

  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const settings = await response.json();

    if (!response.ok) {
      throw new Error(settings.error || "저장에 실패했습니다.");
    }

    apiSettingsForm.reset();
    settingsStatus.textContent = formatSettingsStatus(settings);
    updateSettingsPanelVisibility(settings);
    setStatus("API 키 저장됨", "이제 후보 검색을 다시 누르면 저장된 키로 실제 지역 검색을 시도합니다.");
  } catch (error) {
    settingsStatus.textContent = error.message;
  }
}

function setSelectedRestaurant(item) {
  currentRestaurant = item;
}

function openInNewTab(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function handleBookingOpen(item) {
  setSelectedRestaurant(item);
  openInNewTab(item.bookingSearchUrl);
  setStatus("네이버 예약 열림", `${item.title} 예약 링크를 새 탭에서 열었습니다.`);
}

function renderEmptyState(message, payload = {}) {
  results.className = "results-empty";
  results.innerHTML = "";

  const text = document.createElement("p");
  text.textContent = message;
  results.append(text);

  if (!payload.fallbackLinks) return;

  const detail = document.createElement("p");
  detail.className = "empty-detail";
  detail.textContent = payload.station && payload.radiusApplied !== false
    ? `${payload.station.label} 기준 1km 안쪽 후보만 사용합니다. 또는 정확한 식당명을 입력하면 그 이름으로 예약/지도 링크를 만들 수 있습니다.`
    : payload.station
      ? `${payload.station.label} 역명 기반 후보를 사용합니다. 정확한 식당명을 입력하면 그 이름으로 예약/지도 링크를 만들 수 있습니다.`
    : "또는 정확한 식당명을 입력하면 그 이름으로 예약/지도 링크를 만들 수 있습니다.";
  results.append(detail);

  const actions = document.createElement("div");
  actions.className = "empty-actions";

  const naverLink = document.createElement("a");
  naverLink.className = "empty-link";
  naverLink.href = payload.fallbackLinks.naverSearchUrl;
  naverLink.target = "_blank";
  naverLink.rel = "noopener noreferrer";
  naverLink.textContent = "네이버 플레이스 보기";

  const kakaoLink = document.createElement("a");
  kakaoLink.className = "empty-link";
  kakaoLink.href = payload.fallbackLinks.kakaoMapUrl;
  kakaoLink.target = "_blank";
  kakaoLink.rel = "noopener noreferrer";
  kakaoLink.textContent = "카카오맵에서 평점 보기";

  actions.append(naverLink, kakaoLink);
  results.append(actions);
}

function renderResults(items, plan, payload = {}) {
  results.className = "results-list";
  results.innerHTML = "";

  if (!items.length) {
    let message = "검색 결과가 없습니다. 장소나 카테고리를 조금 넓혀 보세요.";
    if (payload.needsApiKey) {
      message = "현재 API 키가 없어 실제 식당명을 앱 안에 표시하지 않습니다.";
    } else if (payload.reservationOnly) {
      message = "확인된 네이버 예약 링크가 있는 식당을 찾지 못했습니다. 장소나 카테고리를 조금 넓혀 보세요.";
    }

    renderEmptyState(message, payload);
    return;
  }

  for (const [index, item] of items.entries()) {
    const node = template.content.firstElementChild.cloneNode(true);
    const rank = item.recommendationRank || index + 1;
    const basis = item.recommendationBasis ? ` · ${item.recommendationBasis}` : "";

    node.querySelector(".rank-badge").textContent = `추천 ${rank}위`;
    node.querySelector("h3").textContent = item.title;
    node.querySelector(".category").textContent = item.category || "카테고리 정보 없음";
    node.querySelector(".address").textContent = item.distanceText
      ? `${item.address || "주소 정보 없음"} · ${item.distanceText}`
      : item.address || "주소 정보 없음";
    node.querySelector(".description").textContent = `${item.description || "네이버 예약 화면에서 세부 조건을 확인하세요."}${basis}`;

    node.querySelector(".map-button").addEventListener("click", () => {
      openInNewTab(item.naverMapUrl);
      setStatus("지도 열림", `${item.title} 네이버 지도 검색을 새 탭에서 열었습니다.`);
    });

    node.querySelector(".rating-button").addEventListener("click", () => {
      setSelectedRestaurant(item);
      openInNewTab(item.kakaoMapUrl);
      setStatus("카카오맵 평점 조회", `${item.title} 카카오맵 검색을 새 탭에서 열었습니다.`);
    });

    node.querySelector(".booking-button").addEventListener("click", () => {
      handleBookingOpen(item);
    });

    results.append(node);
  }
}

async function search(plan) {
  const hasAccess = await ensureAppAccess();
  if (!hasAccess) return false;

  const params = new URLSearchParams({
    location: plan.location,
    date: plan.date,
    time: plan.time,
    people: String(plan.people),
    category: plan.category,
    alcoholMode: plan.alcoholMode,
    drinkType: plan.drinkType,
    customMenu: plan.customMenu,
    restaurantName: plan.restaurantName
  });

  setStatus("검색 중", "식당 후보와 예약 검색 링크를 준비하고 있습니다.");
  resultMeta.textContent = "검색 중입니다.";

  const response = await fetch(`/api/search?${params.toString()}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "검색 요청에 실패했습니다.");
  }

  renderResults(payload.items || [], plan, payload);
  const radiusMeta = payload.station && payload.radiusApplied !== false
    ? ` · ${payload.station.label} 기준 ${Math.round((payload.radiusMeters || 1000) / 1000)}km 이내`
    : payload.station
      ? ` · ${payload.station.label} 역명 기반`
    : "";
  const reservationMeta = payload.reservationOnly ? " · 네이버 예약 링크 확인" : "";
  resultMeta.textContent = `${payload.query} · 추천순 ${payload.items?.length || 0}개 후보${radiusMeta}${reservationMeta} · ${payload.source}`;

  if (payload.warning) {
    setStatus(payload.needsApiKey ? "API 키 필요" : "검색 안내", payload.warning);
  } else {
    const stationText = payload.station && payload.radiusApplied !== false
      ? `${payload.station.label} 기준 1km 안쪽 결과입니다. `
      : payload.station
        ? `${payload.station.label} 역명 기반 결과입니다. `
        : "";
    setStatus("예약 링크 확인 완료", `${stationText}네이버 예약 링크가 확인된 후보만 추천 순위로 정렬했습니다.`);
  }

  return true;
}

function setDefaultDate() {
  const dateInput = document.querySelector("#dateInput");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  dateInput.value = tomorrow.toISOString().slice(0, 10);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const plan = getPlan();

  if (!plan.location && !plan.restaurantName) {
    setStatus("장소 또는 식당명 필요", "예: 성수역, 강남역처럼 지하철역을 입력하거나 정확한 식당명을 입력하세요.");
    document.querySelector("#locationInput").focus();
    return;
  }

  if (plan.category === "other" && !plan.customMenu) {
    setStatus("세부 메뉴 필요", "기타를 선택했다면 예: 태국음식, 샤브샤브처럼 세부 메뉴를 입력하세요.");
    customMenuInput.focus();
    return;
  }

  currentPlan = plan;

  try {
    const didSearch = await search(plan);
    if (didSearch) {
      saveRecentSearch(plan);
      renderRecentSearches();
    }
  } catch (error) {
    setStatus("검색 실패", error.message);
  }
});

fillDemoButton.addEventListener("click", () => {
  document.querySelector("#locationInput").value = "성수역";
  restaurantNameInput.value = "";
  document.querySelector("#timeInput").value = "19:00";
  document.querySelector("#peopleInput").value = "4";
  document.querySelector('input[name="category"][value="korean"]').checked = true;
  document.querySelector('input[name="alcoholMode"][value="drinks"]').checked = true;
  document.querySelector('input[name="drinkType"][value="soju"]').checked = true;
  updateDrinkTypeVisibility();
  updateCustomMenuVisibility();
  updateMenuRecommendation();
  setDefaultDate();
  setStatus("예시 입력 완료", "API 키가 없으면 실제 식당명 대신 네이버/카카오 검색 링크가 표시됩니다.");
});

copyPlanButton.addEventListener("click", async () => {
  await copyText(getPlanMemo());
  setStatus("예약 메모 복사됨", "채팅이나 메모장에 붙여넣어 예약 조건을 공유할 수 있습니다.");
});

function updateCustomMenuVisibility() {
  const plan = getPlan();
  const isOther = plan.category === "other";
  customMenuField.classList.toggle("is-hidden", !isOther);
  customMenuField.setAttribute("aria-hidden", String(!isOther));
  customMenuInput.disabled = !isOther;
  if (isOther) {
    customMenuInput.focus();
  }
}

function updateDrinkTypeVisibility() {
  const plan = getPlan();
  const isDrinks = plan.alcoholMode === "drinks";
  drinkTypeField.classList.toggle("is-hidden", !isDrinks);
  drinkTypeField.setAttribute("aria-hidden", String(!isDrinks));

  const drinkInputs = drinkTypeField.querySelectorAll('input[name="drinkType"]');
  for (const input of drinkInputs) {
    input.disabled = !isDrinks;
  }

  if (isDrinks && !drinkTypeField.querySelector('input[name="drinkType"]:checked')) {
    const defaultDrinkInput = drinkTypeField.querySelector('input[name="drinkType"][value="soju"]');
    if (defaultDrinkInput) defaultDrinkInput.checked = true;
  }
}

for (const input of document.querySelectorAll('input[name="category"]')) {
  input.addEventListener("change", () => {
    updateCustomMenuVisibility();
    updateMenuRecommendation();
  });
}

for (const input of document.querySelectorAll('input[name="alcoholMode"]')) {
  input.addEventListener("change", () => {
    updateDrinkTypeVisibility();
    updateMenuRecommendation();
  });
}

for (const input of document.querySelectorAll('input[name="drinkType"]')) {
  input.addEventListener("change", updateMenuRecommendation);
}

customMenuInput.addEventListener("input", updateMenuRecommendation);

apiSettingsForm.addEventListener("submit", saveApiSettings);

clearRecentButton.addEventListener("click", () => {
  localStorage.removeItem(recentSearchStorageKey);
  renderRecentSearches();
  setStatus("최근 검색 지움", "최근 검색 목록을 비웠습니다.");
});

mobileSearchButton.addEventListener("click", () => {
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return;
  }

  form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
});

scrollTopButton.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

async function setupInstallSupport() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/service-worker.js");
    } catch {
      // The app still works in the browser if service worker registration is unavailable.
    }
  }

  if (!installAppButton || isStandaloneApp()) return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installAppButton.classList.remove("is-hidden");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installAppButton.classList.add("is-hidden");
    setStatus("앱 설치됨", "이제 브라우저 앱 목록에서 네이버 예약 도우미를 열 수 있습니다.");
  });

  installAppButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      setStatus("설치 준비 중", "브라우저 주소창 또는 메뉴의 설치 버튼을 확인해 주세요.");
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installAppButton.classList.add("is-hidden");
  });
}

setDefaultDate();
updateDrinkTypeVisibility();
updateCustomMenuVisibility();
updateMenuRecommendation();
renderRecentSearches();
loadSettingsStatus();
setupInstallSupport();

const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://daily-brief-yte8.onrender.com";

const heroStory = document.querySelector("#hero-story");
const list = document.querySelector(".news-list");
const searchInput = document.querySelector(".search");
const filterButtons = document.querySelectorAll(".filters button");
const keywordList = document.querySelector(".keyword-list");
const themeToggle = document.querySelector("#theme-toggle");
const modal = document.querySelector(".news-modal");
const modalImage = document.querySelector(".modal-image");
const modalTitle = document.querySelector(".modal-title");
const modalDescription = document.querySelector(".modal-description");
const modalSource = document.querySelector(".modal-source");
const modalLink = document.querySelector(".modal-link");
const modalClose = document.querySelector(".modal-close");
const modalOverlay = document.querySelector(".modal-overlay");

let allArticles = [];
let currentFilter = "all";
let currentKeyword = "";
let bookmarks = JSON.parse(localStorage.getItem("bookmarks")) || [];

/* =========================
   1) 공통 유틸
========================= */
function removeHtmlTags(text = "") {
  return text.replace(/<[^>]*>/g, "");
}

function saveBookmarks() {
  localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
}

function isBookmarked(article) {
  return bookmarks.some((item) => item.url === article.url);
}

/* =========================
   2) 데이터 정규화
========================= */
function getDomesticFallbackImage(index) {
  const fallbackImages = [
    "./assets/korea-news-1.jpg",
    "./assets/korea-news-2.jpg",
    "./assets/korea-news-3.jpg",
  ];

  return fallbackImages[index % fallbackImages.length];
}

function normalizeDomesticNews(items) {
  return items.map((item, index) => ({
    id: `domestic-${index}-${item.link || index}`,
    title: removeHtmlTags(item.title) || "제목 없음",
    description: removeHtmlTags(item.description) || "설명이 없습니다.",
    image: item.image || getDomesticFallbackImage(index),
    source: "Naver News",
    url: item.originallink || item.link || "#",
    region: "domestic",
    translatedTitle: null,
    translatedDescription: null,
    isTranslated: false,
    hotScore: 0,
  }));
}

function normalizeWorldNews(items) {
  return items.map((item, index) => ({
    id: `world-${index}-${item.url || index}`,
    title: item.title || "제목 없음",
    description: item.description || "설명이 없습니다.",
    image:
      item.urlToImage || "https://picsum.photos/seed/worldfallback/600/400",
    source: item.source?.name || "출처 없음",
    url: item.url || "#",
    region: "world",
    translatedTitle: null,
    translatedDescription: null,
    isTranslated: false,
    hotScore: 0,
  }));
}

/* =========================
   3) API 호출
========================= */
async function getDomesticNews() {
  const keywords = ["경제", "증시", "금리", "반도체", "환율"];

  const results = await Promise.all(
    keywords.map(async (keyword) => {
      const res = await fetch(
        `${API_BASE}/api/naver-news?q=${encodeURIComponent(keyword)}`,
      );
      const data = await res.json();
      return data.items || [];
    }),
  );

  const merged = results.flat();
  return normalizeDomesticNews(merged);
}

async function getWorldNews() {
  const res = await fetch(`${API_BASE}/api/world-news`);
  const data = await res.json();
  return normalizeWorldNews(data.articles || []);
}

/* =========================
   4) 데이터 가공
========================= */
function deduplicateArticles(articles) {
  const seen = new Set();

  return articles.filter((article) => {
    const key = article.title.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractKeywordsWithCount(articles) {
  const stopWords = [
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "amid",
    "after",
    "into",
    "over",
    "more",
    "than",
    "will",
    "said",
    "says",
    "its",
    "their",
    "시장",
    "관련",
    "기자",
    "오늘",
    "속보",
    "대한",
    "통해",
    "전망",
    "확대",
    "경제",
    "증시",
    "금리",
    "반도체",
    "global",
    "korea",
    "news",
    "is",
    "to",
    "of",
    "in",
    "on",
    "an",
    "at",
    "by",
    "as",
  ];

  const wordCount = {};

  articles.forEach((article, index) => {
    const words = article.title
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, "")
      .split(/\s+/);

    words.forEach((word) => {
      if (!word || word.length < 3) return;
      if (stopWords.includes(word)) return;
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
  });

  return wordCount;
}

function extractTrendingKeywords(articles) {
  const keywordMap = extractKeywordsWithCount(articles);

  return Object.entries(keywordMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function calculateHotScore(article, keywordMap) {
  let score = 0;

  const titleWords = article.title
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, "")
    .split(/\s+/);

  titleWords.forEach((word) => {
    if (keywordMap[word]) {
      score += keywordMap[word] * 3;
    }
  });

  if (article.description && article.description !== "설명이 없습니다.") {
    score += 8;
  }

  if (article.image && !article.image.includes("fallback")) {
    score += 2;
  }

  if (article.region === "world") {
    score += 3;
  }

  if (isBookmarked(article)) {
    score += 5;
  }

  return score;
}

function rankArticlesByHotScore(articles) {
  const keywordMap = extractKeywordsWithCount(articles);

  return [...articles]
    .map((article) => ({
      ...article,
      hotScore: calculateHotScore(article, keywordMap),
    }))
    .sort((a, b) => b.hotScore - a.hotScore);
}

function getTop10Articles(articles) {
  return rankArticlesByHotScore(articles).slice(0, 10);
}

/* =========================
   5) 북마크 / 번역
========================= */
function toggleBookmark(article) {
  if (isBookmarked(article)) {
    bookmarks = bookmarks.filter((item) => item.url !== article.url);
  } else {
    bookmarks.push(article);
  }

  saveBookmarks();
  applyFilters();
}

async function translateText(text) {
  const res = await fetch(
    `https://daily-brief-yte8.onrender.com/api/translate?text=${encodeURIComponent(text)}`,
  );
  const data = await res.json();
  return data.translatedText || text;
}

async function handleTranslate(articleId) {
  const target = allArticles.find((article) => article.id === articleId);
  if (!target || target.region !== "world") return;

  if (target.isTranslating) return;

  try {
    target.isTranslating = true;
    applyFilters();

    if (!target.translatedTitle) {
      target.translatedTitle = await translateText(target.title);
    }

    if (!target.translatedDescription) {
      target.translatedDescription = await translateText(target.description);
    }

    target.isTranslated = !target.isTranslated;
  } catch (error) {
    console.error("번역 실패:", error);
  } finally {
    target.isTranslating = false;
    applyFilters();
  }
}

/* =========================
   6) 렌더링
========================= */
function renderTrending(articles) {
  const keywords = extractTrendingKeywords(articles);
  keywordList.innerHTML = "";

  keywords.forEach((keyword, index) => {
    const btn = document.createElement("button");

    btn.textContent = index < 3 ? `🔥 ${keyword}` : keyword;

    btn.addEventListener("click", () => {
      currentKeyword = keyword;
      searchInput.value = keyword;
      applyFilters();
    });

    keywordList.appendChild(btn);
  });
}

function renderNews(articles, options = {}) {
  list.innerHTML = "";

  const { isBookmarksView = false, hasKeyword = false } = options;

  if (articles.length === 0) {
    let message = "조건에 맞는 뉴스가 없습니다.";

    if (isBookmarksView && hasKeyword) {
      message = "저장한 뉴스 중 검색 결과가 없습니다.";
    } else if (isBookmarksView) {
      message = "저장한 뉴스가 아직 없습니다.";
    }

    list.innerHTML = `
  <div class="empty-state">
    <h3>${message}</h3>
    <p>${
      isBookmarksView
        ? "관심 있는 기사를 저장해두고 나중에 다시 확인해보세요."
        : "검색어를 바꾸거나 다른 필터를 선택해보세요."
    }</p>
  </div>`;
    return;
  }

  articles.forEach((article, index) => {
    const card = document.createElement("article");
    card.className = "news-card";

    if (isBookmarked(article)) {
      card.classList.add("bookmarked");
    }

    const title = article.isTranslated
      ? article.translatedTitle || article.title
      : article.title;

    const description = article.isTranslated
      ? article.translatedDescription || article.description
      : article.description;

    const category = getCategoryInfo(article);
    const sentiment = getSentimentInfo(article);
    const importance = getImportanceInfo(article);

    card.innerHTML = `
    <img 
      src="${article.image}" 
      alt="${title}"
      onerror="this.onerror=null; this.src='./assets/korea-news-1.jpg';"
    />
    ${index < 10 ? `<span class="rank-badge">🔥 ${index + 1}</span>` : ""}
    <div class="news-content">
      <div class="news-top">
        <div class="meta-tags">
          <span class="meta-tag">${category.icon} ${category.label}</span>
          <span class="meta-tag ${sentiment.className}">${sentiment.icon} ${sentiment.label}</span>
          <span class="meta-tag ${importance.className}">${importance.icon} ${importance.label}</span>
        </div>
      </div>

      <h3>${title}</h3>
      <p>${description}</p>
      <div class="news-source">
        🌎 ${article.region === "domestic" ? "국내" : "해외"} · ${article.source}
      </div>

      <div class="card-actions">
        <button class="action-btn bookmark-btn">
          ${isBookmarked(article) ? "★ 저장됨" : "☆ 저장"}
        </button>
        ${
          article.region === "world"
            ? `<button class="action-btn translate-btn" ${
                article.isTranslating ? "disabled" : ""
              }>${
                article.isTranslating
                  ? "번역중..."
                  : article.isTranslated
                    ? "원문 보기"
                    : "번역"
              }</button>`
            : ""
        }
      </div>
    </div>
  `;

    card.addEventListener("click", (event) => {
      if (event.target.closest(".action-btn")) return;
      openNewsModal(article);
    });

    const bookmarkBtn = card.querySelector(".bookmark-btn");
    bookmarkBtn.addEventListener("click", () => {
      toggleBookmark(article);
    });

    const translateBtn = card.querySelector(".translate-btn");
    if (translateBtn) {
      translateBtn.addEventListener("click", async () => {
        await handleTranslate(article.id);
      });
    }

    list.appendChild(card);
  });
}

/* =========================
   7) 필터 / 검색
========================= */
function applyFilters() {
  let filtered =
    currentFilter === "bookmarks" ? [...bookmarks] : [...allArticles];

  if (currentFilter !== "all" && currentFilter !== "bookmarks") {
    filtered = filtered.filter((article) => article.region === currentFilter);
  }

  if (currentKeyword.trim() !== "") {
    const keyword = currentKeyword.toLowerCase();

    filtered = filtered.filter((article) => {
      const title = (article.translatedTitle || article.title).toLowerCase();
      const description = (
        article.translatedDescription || article.description
      ).toLowerCase();

      return title.includes(keyword) || description.includes(keyword);
    });
  }

  const topArticles = getTop10Articles(filtered);

  renderHeroStory(filtered);
  renderNews(topArticles, {
    isBookmarksView: currentFilter === "bookmarks",
    hasKeyword: currentKeyword.trim() !== "",
  });
}

function updateActiveButton() {
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === currentFilter);
  });
}

/* =========================
   8) 테마
========================= */
function applySavedTheme() {
  const savedTheme = localStorage.getItem("theme");

  if (savedTheme === "dark") {
    document.body.classList.add("dark");
    themeToggle.textContent = "☀️";
  } else {
    themeToggle.textContent = "🌙";
  }
}

/* =========================
   9) 초기 로드
========================= */
async function loadNews() {
  renderSkeleton();

  const cachedNews = localStorage.getItem("cachedNews");
  const cachedTime = localStorage.getItem("cachedNewsTime");
  const now = Date.now();

  // 30분 캐시
  const isCacheValid =
    cachedNews && cachedTime && now - Number(cachedTime) < 30 * 60 * 1000;

  if (isCacheValid) {
    allArticles = JSON.parse(cachedNews);
    renderHeroStory(allArticles);
    renderTrending(allArticles);
    updateMarketSummary(allArticles);
    applyFilters();
    updateActiveButton();
    return;
  }

  try {
    const domesticNews = await getDomesticNews();
    const worldNews = await getWorldNews();

    allArticles = deduplicateArticles([...domesticNews, ...worldNews]);

    localStorage.setItem("cachedNews", JSON.stringify(allArticles));
    localStorage.setItem("cachedNewsTime", String(now));

    renderHeroStory(allArticles);
    renderTrending(allArticles);
    updateMarketSummary(allArticles);
    applyFilters();
    updateActiveButton();
  } catch (error) {
    console.error(error);
    list.innerHTML = `<p class="error-message">뉴스를 불러오지 못했습니다.</p>`;
  }
}

/* =========================
   10) 이벤트 연결
========================= */
searchInput.addEventListener("input", (event) => {
  currentKeyword = event.target.value;
  applyFilters();
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    updateActiveButton();
    applyFilters();
  });
});

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");

  const isDark = document.body.classList.contains("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  themeToggle.textContent = isDark ? "☀️" : "🌙";
});

/* =========================
   11) 모달
========================= */

function openNewsModal(article) {
  const title = article.isTranslated
    ? article.translatedTitle || article.title
    : article.title;

  const description = article.isTranslated
    ? article.translatedDescription || article.description
    : article.description;

  modalImage.src = article.image;
  modalTitle.textContent = title;
  modalDescription.textContent = description;
  modalSource.textContent = `${article.source} · ${formatDateLabel(getYesterdayDate())}`;
  modalLink.href = article.url;

  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
}

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", closeModal);

/* =========================
   12) 날짜 계산, 표시
========================= */

function getYesterdayDate() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
}

function formatDateLabel(date) {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const dayName = days[date.getDay()];

  return `${formatDate(date)} (${dayName}) 기준`;
}

function renderHeadlineDate() {
  const headlineDate = document.querySelector("#headline-date");
  const yesterday = getYesterdayDate();

  headlineDate.textContent = formatDateLabel(yesterday);
}

/* =========================
   13) skeleton
========================= */

function renderSkeleton() {
  list.innerHTML = "";

  for (let i = 0; i < 6; i++) {
    const card = document.createElement("div");

    card.className = "skeleton-card";

    card.innerHTML = `
      <div class="skeleton-image"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text short"></div>
    `;

    list.appendChild(card);
  }
}

/* =========================
   14) 뉴스 카테고리
========================= */

function getCategoryInfo(article) {
  const text = `${article.title} ${article.description}`.toLowerCase();

  if (
    text.includes("금리") ||
    text.includes("fed") ||
    text.includes("inflation") ||
    text.includes("interest")
  ) {
    return { icon: "💰", label: "금리/물가" };
  }

  if (
    text.includes("반도체") ||
    text.includes("semiconductor") ||
    text.includes("chip") ||
    text.includes("ai")
  ) {
    return { icon: "🧠", label: "기술/반도체" };
  }

  if (
    text.includes("환율") ||
    text.includes("달러") ||
    text.includes("oil") ||
    text.includes("tariff") ||
    text.includes("trade")
  ) {
    return { icon: "🌍", label: "환율/무역" };
  }

  return { icon: "📊", label: "시장" };
}

/* =========================
   15) 뉴스 sentiment
========================= */

function getSentimentInfo(article) {
  const text = `${article.title} ${article.description}`.toLowerCase();

  const positiveKeywords = [
    "rally",
    "gain",
    "rise",
    "growth",
    "recover",
    "surge",
    "확대",
    "상승",
    "회복",
    "호재",
  ];

  const negativeKeywords = [
    "fall",
    "drop",
    "risk",
    "cut",
    "crisis",
    "recession",
    "decline",
    "둔화",
    "하락",
    "위기",
    "악화",
  ];

  const positiveScore = positiveKeywords.filter((word) =>
    text.includes(word),
  ).length;
  const negativeScore = negativeKeywords.filter((word) =>
    text.includes(word),
  ).length;

  if (positiveScore > negativeScore) {
    return { icon: "📈", label: "긍정", className: "positive" };
  }

  if (negativeScore > positiveScore) {
    return { icon: "📉", label: "부정", className: "negative" };
  }

  return { icon: "➖", label: "중립", className: "neutral" };
}

/* =========================
   16) 뉴스 중요도
========================= */

function getImportanceInfo(article) {
  if ((article.hotScore || 0) >= 35) {
    return { icon: "🔥", label: "Breaking", className: "breaking" };
  }

  if ((article.hotScore || 0) >= 20) {
    return { icon: "🟡", label: "Important", className: "important" };
  }

  return { icon: "⚪", label: "Normal", className: "normal" };
}

/* =========================
   16) summary
========================= */

function updateMarketSummary(articles) {
  let korea = { positive: 0, negative: 0, neutral: 0 };
  let global = { positive: 0, negative: 0, neutral: 0 };

  articles.forEach((article) => {
    const sentiment = getSentimentInfo(article);

    if (article.region === "domestic") {
      if (sentiment.className === "positive") korea.positive++;
      else if (sentiment.className === "negative") korea.negative++;
      else korea.neutral++;
    } else {
      if (sentiment.className === "positive") global.positive++;
      else if (sentiment.className === "negative") global.negative++;
      else global.neutral++;
    }
  });

  const koreaBox = document.querySelector("#korea-summary");
  const globalBox = document.querySelector("#global-summary");

  koreaBox.querySelector(".positive").textContent = `📈 ${korea.positive}`;
  koreaBox.querySelector(".negative").textContent = `📉 ${korea.negative}`;
  koreaBox.querySelector(".neutral").textContent = `➖ ${korea.neutral}`;

  globalBox.querySelector(".positive").textContent = `📈 ${global.positive}`;
  globalBox.querySelector(".negative").textContent = `📉 ${global.negative}`;
  globalBox.querySelector(".neutral").textContent = `➖ ${global.neutral}`;
}

/* =========================
   16) Top Story
========================= */

function renderHeroStory(articles) {
  const topArticle = getTop10Articles(articles)[0];

  if (!topArticle) {
    heroStory.innerHTML = "";
    return;
  }

  const title = topArticle.isTranslated
    ? topArticle.translatedTitle || topArticle.title
    : topArticle.title;

  const description = topArticle.isTranslated
    ? topArticle.translatedDescription || topArticle.description
    : topArticle.description;

  const category = getCategoryInfo(topArticle);
  const sentiment = getSentimentInfo(topArticle);
  const importance = getImportanceInfo(topArticle);

  heroStory.innerHTML = `
    <article class="hero-card">
      <div class="hero-image-wrap">
        <img
          src="${topArticle.image}"
          alt="${title}"
          onerror="this.onerror=null; this.src='./assets/korea-news-1.jpg';"
        />
        <span class="hero-rank">🔥 대표 뉴스</span>
      </div>

      <div class="hero-content">
        <div class="hero-meta">
          <span class="meta-tag">${category.icon} ${category.label}</span>
          <span class="meta-tag ${sentiment.className}">
            ${sentiment.icon} ${sentiment.label}
          </span>
          <span class="meta-tag ${importance.className}">
            ${importance.icon} ${importance.label}
          </span>
        </div>

        <h3>${title}</h3>
        <p>${description}</p>
        <div class="news-source">
          🌎 ${topArticle.region === "domestic" ? "국내" : "해외"} · ${topArticle.source}
        </div>
      </div>
    </article>
  `;

  heroStory.querySelector(".hero-card").addEventListener("click", () => {
    openNewsModal(topArticle);
  });
}

applySavedTheme();
renderHeadlineDate();
loadNews();

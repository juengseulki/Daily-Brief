require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const NEWS_API_KEY = process.env.NEWS_API_KEY;

/* =========================
   공통 유틸
========================= */
async function safeFetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `요청 실패: ${response.status} ${response.statusText} / ${text}`,
    );
  }

  return response.json();
}

/* =========================
   네이버 기사 이미지 추출
   - 기사 페이지에서 og:image 추출
========================= */
async function extractImageFromUrl(url) {
  try {
    if (!url) return "";

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return "";
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const candidates = [
      $('meta[property="og:image"]').attr("content"),
      $('meta[name="og:image"]').attr("content"),
      $('meta[property="twitter:image"]').attr("content"),
      $('meta[name="twitter:image"]').attr("content"),
      $('meta[property="og:image:url"]').attr("content"),
      $('meta[name="msapplication-TileImage"]').attr("content"),
    ].filter(Boolean);

    const image = candidates.find((src) => {
      return (
        typeof src === "string" &&
        src.startsWith("http") &&
        !src.includes("logo") &&
        !src.includes("icon")
      );
    });

    return image || "";
  } catch (error) {
    console.error("이미지 추출 실패:", error.message);
    return "";
  }
}

/* =========================
   국내 뉴스: 네이버 뉴스 검색
========================= */
app.get("/api/naver-news", async (req, res) => {
  try {
    const query = req.query.q || "경제";
    const display = Number(req.query.display) || 10;
    const sort = req.query.sort || "date";

    const url =
      `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}` +
      `&display=${display}` +
      `&sort=${sort}`;

    const data = await safeFetchJson(url, {
      headers: {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
      },
    });

    const itemsWithImage = await Promise.all(
      (data.items || []).map(async (item, index) => {
        let image = "";

        if (index < 5) {
          const targetUrl = item.originallink || item.link || "";
          image = await extractImageFromUrl(targetUrl);
        }

        return {
          ...item,
          image,
        };
      }),
    );

    res.json({
      ...data,
      items: itemsWithImage,
    });
  } catch (error) {
    console.error("Naver API error:", error.message);
    res.status(500).json({
      message: "네이버 뉴스 요청 실패",
      items: [],
    });
  }
});

/* =========================
   해외 뉴스: NewsAPI
========================= */
app.get("/api/world-news", async (req, res) => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const from = yesterday.toISOString().split("T")[0];

    const query =
      '(stock OR market OR inflation OR "interest rate" OR fed OR oil OR recession OR tariff OR earnings OR AI OR semiconductor) NOT sports';

    const url =
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}` +
      `&from=${from}` +
      `&to=${from}` +
      `&language=en` +
      `&sortBy=popularity` +
      `&pageSize=20` +
      `&apiKey=${NEWS_API_KEY}`;

    const data = await safeFetchJson(url);

    res.json(data);
  } catch (error) {
    console.error("World API error:", error.message);
    res.status(500).json({
      message: "해외 뉴스 요청 실패",
      articles: [],
    });
  }
});

/* =========================
   번역: MyMemory
========================= */
app.get("/api/translate", async (req, res) => {
  try {
    const text = req.query.text || "";

    if (!text.trim()) {
      return res.json({ translatedText: "" });
    }

    const url =
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}` +
      `&langpair=en|ko`;

    const data = await safeFetchJson(url);

    res.json({
      translatedText: data?.responseData?.translatedText || text,
    });
  } catch (error) {
    console.error("Translate API error:", error.message);
    res.status(500).json({
      translatedText: "번역 실패",
    });
  }
});

/* =========================
   서버 시작
========================= */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

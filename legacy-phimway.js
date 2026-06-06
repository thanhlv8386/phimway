#!/usr/bin/env node

/**
 * Phimway to IINA script
 * Usage: node phimway.js <id>
 *
 * Downloads subtitles to a local folder and opens IINA.
 */

const { exec } = require("child_process");
const readline = require("readline/promises");
const { stdin: input, stdout: output } = require("process");
const os = require("os");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { webcrypto } = require("crypto");

const USER_AGENT =
  "Mozilla/5.0 (iPad; CPU OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5355d Safari/8536.25";
const API_URL = "https://legacy.phimway.com/b/g";
const BASE_URL = "https://legacy.phimway.com";

function getTodayDateString() {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function parseCommandArgs(argv) {
  const args = argv.slice(2);

  if (args.length === 0) {
    return {
      mode: "interactive",
    };
  }

  // Giữ behavior cũ:
  // node phimway.js 322
  if (args.length === 1 && /^\d+$/.test(args[0])) {
    return {
      mode: "id",
      id: args[0],
    };
  }

  const rawInput = args.join(" ").trim();

  // Hỗ trợ:
  // node phimway.js Fallout 2/4
  // keyword = Fallout, season = 2, episode = 4
  const seasonEpisodeMatch = rawInput.match(/(.+?)\s+(\d+)\/(\d+)$/);

  if (seasonEpisodeMatch) {
    return {
      mode: "search_auto_episode",
      keyword: seasonEpisodeMatch[1].trim(),
      seasonNumber: Number(seasonEpisodeMatch[2]),
      episodeNumber: Number(seasonEpisodeMatch[3]),

      // Có season/episode thì ưu tiên TV Show hoặc type != movie
      preferNonMovie: true,
    };
  }

  // Hỗ trợ:
  // node phimway.js Fallout 2
  // keyword = Fallout, season = 2
  const seasonOnlyMatch = rawInput.match(/(.+?)\s+(\d+)$/);

  if (seasonOnlyMatch) {
    return {
      mode: "search_auto_season",
      keyword: seasonOnlyMatch[1].trim(),
      seasonNumber: Number(seasonOnlyMatch[2]),

      // Có season thì ưu tiên TV Show hoặc type != movie
      preferNonMovie: true,
    };
  }

  // Hỗ trợ:
  // node phimway.js Fallout
  // Không có season/episode thì ưu tiên Movie
  return {
    mode: "search",
    keyword: rawInput,
    preferMovie: true,
  };
}

function normalizeText(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function searchTitles(titles, keyword, limit = 20, options = {}) {
  const { preferMovie = false, preferNonMovie = false } = options;

  const q = normalizeText(keyword);

  return titles
    .map((item) => {
      const [id, nameEn, nameVi, posterPath, type, imdbId] = item;

      const en = normalizeText(nameEn);
      const vi = normalizeText(nameVi);
      const normalizedType = normalizeText(type);
      const haystack = `${en} ${vi}`;

      let score = 0;

      if (en === q || vi === q) score += 100;
      if (en.startsWith(q) || vi.startsWith(q)) score += 50;
      if (haystack.includes(q)) score += 20;

      const tokens = q.split(/\s+/).filter(Boolean);
      const matchedTokens = tokens.filter((token) => haystack.includes(token));
      score += matchedTokens.length * 5;

      const isMovie = normalizedType === "movie";

      // node phimway.js Fallout
      // Ưu tiên Movie
      if (preferMovie) {
        if (isMovie) {
          score += 40;
        } else {
          score -= 20;
        }
      }

      // node phimway.js Fallout 2
      // node phimway.js Fallout 2/4
      // Ưu tiên TV Show hoặc các type khác Movie
      if (preferNonMovie) {
        if (!isMovie) {
          score += 40;
        } else {
          score -= 30;
        }
      }

      return {
        id,
        nameEn,
        nameVi,
        posterPath,
        type,
        imdbId,
        score,
      };
    })
    .filter((movie) => movie.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function formatEpisodeLabel(item) {
  const numberLabel =
    item.number !== null && item.number !== undefined
      ? `#${item.number}`
      : `ID ${item.id}`;

  const typeLabel = item.type ? item.type : "title";
  const watchableLabel = item.watchable ? "watchable" : "folder";
  const childrenLabel =
    item.childrenCount && item.childrenCount > 0
      ? `, ${item.childrenCount} tập/mục con`
      : "";

  return `${numberLabel} - ${typeLabel} - ${watchableLabel}${childrenLabel}`;
}

function findNodeByNumber(nodes, targetNumber) {
  return nodes.find((node) => Number(node.number) === Number(targetNumber));
}

async function fetchSuggestions() {
  const today = getTodayDateString();
  const url = `${BASE_URL}/b/suggestions/titles-${today}.js`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Referer: BASE_URL,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch suggestions: ${response.status} ${response.statusText}`,
    );
  }

  return await response.json();
}

async function askUserToSelectMovie() {
  const rl = readline.createInterface({ input, output });

  try {
    const keyword = await rl.question("\x1b[36mNhập tên phim cần tìm: \x1b[0m");

    if (!keyword.trim()) {
      console.error("\x1b[31mBạn chưa nhập tên phim.\x1b[0m");
      process.exit(1);
    }

    console.log("\x1b[35m>>> Đang tải danh sách phim...\x1b[0m");

    const titles = await fetchSuggestions();
    const results = searchTitles(titles, keyword, 20);

    if (results.length === 0) {
      console.error(
        `\x1b[31mKhông tìm thấy phim nào khớp với: ${keyword}\x1b[0m`,
      );
      process.exit(1);
    }

    console.log("\n\x1b[32mKết quả tìm kiếm:\x1b[0m");

    results.forEach((movie, index) => {
      const typeLabel = movie.type === "show" ? "TV" : "Movie";
      console.log(
        `${index + 1}. [${typeLabel}] ${movie.nameVi || movie.nameEn} ${movie.nameEn && movie.nameVi && movie.nameEn !== movie.nameVi
          ? `(${movie.nameEn})`
          : ""
        } - ID: ${movie.id}`,
      );
    });

    const answer = await rl.question(
      "\n\x1b[36mChọn số thứ tự phim muốn phát: \x1b[0m",
    );

    const selectedIndex = Number(answer) - 1;

    if (
      Number.isNaN(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= results.length
    ) {
      console.error("\x1b[31mLựa chọn không hợp lệ.\x1b[0m");
      process.exit(1);
    }

    const selected = results[selectedIndex];

    console.log(
      `\x1b[32m✓ Đã chọn:\x1b[0m ${selected.nameVi || selected.nameEn} - ID: ${selected.id}`,
    );

    return selected.id;
  } finally {
    rl.close();
  }
}

async function askUserToSelectFromList(items, title = "Danh sách") {
  const rl = readline.createInterface({ input, output });

  try {
    console.log(`\n\x1b[32m${title}:\x1b[0m`);

    items.forEach((item, index) => {
      console.log(`${index + 1}. ${formatEpisodeLabel(item)} - ID: ${item.id}`);
    });

    const answer = await rl.question(
      "\n\x1b[36mChọn số thứ tự muốn phát/mở: \x1b[0m",
    );

    const selectedIndex = Number(answer) - 1;

    if (
      Number.isNaN(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= items.length
    ) {
      console.error("\x1b[31mLựa chọn không hợp lệ.\x1b[0m");
      process.exit(1);
    }

    return items[selectedIndex];
  } finally {
    rl.close();
  }
}

async function resolvePlayableTitleId(title) {
  if (!title) {
    console.error("\x1b[31mError: Movie not found.\x1b[0m");
    process.exit(1);
  }

  const hasChildren =
    Array.isArray(title.children) && title.children.length > 0;

  // Nếu title đã có srcUrl và không có children thì phát luôn
  if (title.srcUrl && !hasChildren) {
    return title.id;
  }

  // Nếu có children thì gọi API lấy danh sách tập/mùa đầy đủ
  if (hasChildren) {
    console.log(
      `\x1b[35m>>> "${title.nameVi || title.nameEn || title.id}" có danh sách tập/mùa, đang tải...\x1b[0m`,
    );

    let currentParentId = title.id;

    while (true) {
      const childrenData = await fetchChildren(currentParentId);
      const nodes = childrenData?.data?.titles?.nodes || [];
      let selected = null;

      if (nodes.length === 0) {
        console.error("\x1b[31mKhông tìm thấy danh sách tập/mùa con.\x1b[0m");
        process.exit(1);
      } else if (nodes.length == 1) {
        selected = nodes[0];
      } else {
        selected = await askUserToSelectFromList(
          nodes,
          `Danh sách tập/mùa của ID ${currentParentId}`,
        );
      }

      // Nếu item này còn children thì nghĩa là user chọn một season/folder
      if (selected.childrenCount && selected.childrenCount > 0) {
        currentParentId = selected.id;
        continue;
      }

      // Nếu item watchable thì lấy ID này để phát
      return selected.id;
    }
  }

  // Trường hợp API không báo children nhưng cũng chưa có srcUrl
  console.error(
    "\x1b[31mTitle này chưa có srcUrl và cũng không có children để chọn.\x1b[0m",
  );
  process.exit(1);
}

async function fetchMovieInfo(id) {
  const query = `query TitleWatch($id: String!, $server: String) {
  title(id: $id, server: $server) {
    id
    nameEn
    nameVi
    intro
    publishDate
    tmdbPoster
    tmdbBackdrop
    srcUrl
    srcServer
    canUseVpn
    vpnFee
    spriteUrl
    useVipLink
    reachedWatchLimit
    needImproveSubtitle
    needImproveVideo
    removed
    type
    number
    subsceneSlug
    nextEpisodeId
    movieInfo {
      width
      height
      __typename
    }
    parent {
      id
      number
      intro
      publishDate
      tmdbPoster
      parent {
        id
        nameEn
        nameVi
        tmdbBackdrop
        __typename
      }
      __typename
    }
    children {
      id
      number
      __typename
    }
    relatedTitles {
      ...TitleBasics
      __typename
    }
    __typename
  }
}

fragment TitleBasics on Title {
  id
  nameEn
  nameVi
  type
  postedAt
  tmdbPoster
  publishDate
  intro
  imdbRating
  countries
  genres {
    nameVi
    slug
    __typename
  }
  translation
  __typename
}`;

  const body = {
    operationName: "TitleWatch",
    variables: { id: String(id), server: "1" },
    query,
  };

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
      Origin: "https://legacy.phimway.com",
      Referer: "https://legacy.phimway.com",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch movie info: ${response.status}`);
  }

  return await response.json();
}

async function fetchChildren(parentId) {
  const query = `query Children($parentId: String) {
  titles(first: 100, sort: "number", order: "asc", parentId: $parentId) {
    nodes {
      id
      number
      tmdbPoster
      publishDate
      type
      watchable
      childrenCount
      __typename
    }
    __typename
  }
}`;

  const body = {
    operationName: "Children",
    variables: { parentId: String(parentId) },
    query,
  };

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
      Origin: "https://legacy.phimway.com",
      Referer: "https://legacy.phimway.com",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch children: ${response.status}`);
  }

  return await response.json();
}

async function fetchSubtitles(id) {
  const query = `query Subtitles($titleId: String!) {
  subtitles(titleId: $titleId) {
    id
    subsceneId
    language
    fileName
    isDefault
    likes
  }
}`;

  const body = {
    operationName: "Subtitles",
    variables: { titleId: String(id) },
    query: query,
  };

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return await response.json();
}

function rot19(s) {
  return s.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 19) % 26) + base);
  });
}

async function downloadSubtitle(url, destPath) {
  // fileName = phần cuối của URL, ví dụ "v01.srt"
  const fileName = path.basename(new URL(url).pathname);

  // 1. Derive AES-256 key: SHA-256( "/watch/" + ROT19(fileName) )
  const keyInput = "/watch/" + rot19(fileName);
  const hash = await webcrypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(keyInput),
  );
  const key = await webcrypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  // 2. Tải file base64
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "*/*",
    },
  });
  if (!response.ok)
    throw new Error(`Failed to download subtitle: ${response.status}`);
  const b64 = (await response.text()).trim();

  // 3. Base64 -> bytes, tách IV (12) + ciphertext+tag
  const bytes = Buffer.from(b64, "base64");
  const iv = bytes.subarray(0, 12);
  const ct = bytes.subarray(12);

  // 4. AES-GCM decrypt
  const pt = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  const text = new TextDecoder("utf-8").decode(pt);

  fs.writeFileSync(destPath, text, "utf-8");
  return destPath;
}

async function searchAndPickFirst(keyword, options = {}) {
  console.log(`\x1b[35m>>> Đang tìm phim: ${keyword}...\x1b[0m`);

  const titles = await fetchSuggestions();
  const results = searchTitles(titles, keyword, 20, options);

  if (results.length === 0) {
    console.error(
      `\x1b[31mKhông tìm thấy phim nào khớp với: ${keyword}\x1b[0m`,
    );
    process.exit(1);
  }

  const selected = results[0];

  console.log("\n\x1b[32mKết quả đầu tiên được chọn tự động:\x1b[0m");
  console.log(
    `1. [${selected.type}] ${selected.nameVi || selected.nameEn} ${selected.nameEn && selected.nameVi && selected.nameEn !== selected.nameVi
      ? `(${selected.nameEn})`
      : ""
    } - ID: ${selected.id}`,
  );

  return selected.id;
}

async function resolveSeasonEpisodeTitleId(
  rootTitle,
  seasonNumber,
  episodeNumber,
) {
  if (!rootTitle) {
    console.error("\x1b[31mError: Movie not found.\x1b[0m");
    process.exit(1);
  }

  const hasChildren =
    Array.isArray(rootTitle.children) && rootTitle.children.length > 0;

  if (!hasChildren) {
    console.error(
      `\x1b[31m"${rootTitle.nameVi || rootTitle.nameEn}" không có danh sách season/episode.\x1b[0m`,
    );
    process.exit(1);
  }

  console.log(
    `\x1b[35m>>> Đang chọn Season ${seasonNumber}, Episode ${episodeNumber}...\x1b[0m`,
  );

  const seasonData = await fetchChildren(rootTitle.id);
  const seasons = seasonData?.data?.titles?.nodes || [];

  if (seasons.length === 0) {
    console.error("\x1b[31mKhông tìm thấy danh sách season.\x1b[0m");
    process.exit(1);
  }

  let selectedSeason = findNodeByNumber(seasons, seasonNumber);

  // Một số phim không chia season, children chính là episode luôn.
  // Nếu không tìm thấy season nhưng có episode number thì thử chọn episode trực tiếp ở level này.
  if (!selectedSeason) {
    const directEpisode = findNodeByNumber(seasons, episodeNumber);

    if (directEpisode && directEpisode.watchable) {
      console.log(
        `\x1b[33mKhông thấy Season ${seasonNumber}, chọn trực tiếp Episode ${episodeNumber} ở danh sách tập.\x1b[0m`,
      );
      return directEpisode.id;
    }

    console.error(`\x1b[31mKhông tìm thấy Season ${seasonNumber}.\x1b[0m`);
    console.log("\x1b[36mDanh sách hiện có:\x1b[0m");
    seasons.forEach((item) => {
      console.log(
        `- season ${item.number} - ID: ${item.id}, episodes=${item.childrenCount}`,
      );
    });
    process.exit(1);
  }

  console.log(
    `\x1b[32m✓ Season selected:\x1b[0m Season ${selectedSeason.number} - ID: ${selectedSeason.id}`,
  );

  // Nếu selectedSeason là episode xem được luôn thì trả về luôn.
  // Trường hợp này hiếm, nhưng giúp code không chết nếu structure hơi khác.
  if (selectedSeason.watchable && !selectedSeason.childrenCount) {
    return selectedSeason.id;
  }

  const episodeData = await fetchChildren(selectedSeason.id);
  const episodes = episodeData?.data?.titles?.nodes || [];

  if (episodes.length === 0) {
    console.error(
      `\x1b[31mKhông tìm thấy episode trong Season ${seasonNumber}.\x1b[0m`,
    );
    process.exit(1);
  }

  const selectedEpisode = findNodeByNumber(episodes, episodeNumber);

  if (!selectedEpisode) {
    console.error(
      `\x1b[31mKhông tìm thấy Episode ${episodeNumber} trong Season ${seasonNumber}.\x1b[0m`,
    );
    console.log("\x1b[36mDanh sách episode hiện có:\x1b[0m");
    episodes.forEach((item) => {
      console.log(
        `- episode ${item.number} - ID: ${item.id}, episodes=${item.childrenCount}`,
      );
    });
    process.exit(1);
  }

  console.log(
    `\x1b[32m✓ Episode selected:\x1b[0m S${seasonNumber}E${episodeNumber} - ID: ${selectedEpisode.id}`,
  );

  return selectedEpisode.id;
}

async function resolveSeasonOnlyTitleId(rootTitle, seasonNumber) {
  if (!rootTitle) {
    console.error("\x1b[31mError: Movie not found.\x1b[0m");
    process.exit(1);
  }

  const hasChildren =
    Array.isArray(rootTitle.children) && rootTitle.children.length > 0;

  if (!hasChildren) {
    console.error(
      `\x1b[31m"${rootTitle.nameVi || rootTitle.nameEn}" không có danh sách season/episode.\x1b[0m`,
    );
    process.exit(1);
  }

  console.log(
    `\x1b[35m>>> Đang mở danh sách Episode của Season ${seasonNumber}...\x1b[0m`,
  );

  const seasonData = await fetchChildren(rootTitle.id);
  const seasons = seasonData?.data?.titles?.nodes || [];

  if (seasons.length === 0) {
    console.error("\x1b[31mKhông tìm thấy danh sách season.\x1b[0m");
    process.exit(1);
  }

  const selectedSeason = findNodeByNumber(seasons, seasonNumber);

  if (!selectedSeason) {
    console.error(`\x1b[31mKhông tìm thấy Season ${seasonNumber}.\x1b[0m`);
    console.log("\x1b[36mDanh sách hiện có:\x1b[0m");

    seasons.forEach((item) => {
      console.log(
        `- season ${item.number} - ID: ${item.id}, episodes=${item.childrenCount}`,
      );
    });

    process.exit(1);
  }

  console.log(
    `\x1b[32m✓ Season selected:\x1b[0m Season ${selectedSeason.number} - ID: ${selectedSeason.id}`,
  );

  // Nếu season này xem được luôn thì phát luôn
  if (selectedSeason.watchable && !selectedSeason.childrenCount) {
    return selectedSeason.id;
  }

  const episodeData = await fetchChildren(selectedSeason.id);
  const episodes = episodeData?.data?.titles?.nodes || [];

  if (episodes.length === 0) {
    console.error(
      `\x1b[31mKhông tìm thấy episode trong Season ${seasonNumber}.\x1b[0m`,
    );
    process.exit(1);
  }

  const selectedEpisode = await askUserToSelectFromList(
    episodes,
    `Danh sách Episode của Season ${seasonNumber}`,
  );

  if (selectedEpisode.childrenCount && selectedEpisode.childrenCount > 0) {
    console.error(
      "\x1b[31mEpisode được chọn vẫn còn mục con. Structure phim này hơi khác, cần chọn tiếp thủ công.\x1b[0m",
    );
    process.exit(1);
  }

  if (!selectedEpisode.watchable) {
    console.error(
      "\x1b[31mEpisode được chọn không xem được hoặc chưa có srcUrl.\x1b[0m",
    );
    process.exit(1);
  }

  console.log(
    `\x1b[32m✓ Episode selected:\x1b[0m S${seasonNumber}E${selectedEpisode.number} - ID: ${selectedEpisode.id}`,
  );

  return selectedEpisode.id;
}

async function startSubInjector(ipcSocketPath, subtitleMap) {
  let client = null;
  try {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (fs.existsSync(ipcSocketPath)) break;
    }

    if (!fs.existsSync(ipcSocketPath)) {
      console.log("\x1b[31m[Background] Không thể kết nối tới IINA IPC.\x1b[0m");
      return;
    }

    client = net.createConnection(ipcSocketPath);
    const addedSubsFor = new Set();

    const injectSubtitles = (currentUrl) => {
      if (!currentUrl || addedSubsFor.has(currentUrl)) return;
      const subs = subtitleMap.get(currentUrl);
      if (subs && subs.length > 0) {
        addedSubsFor.add(currentUrl);
        console.log(`\n\x1b[35m[Background] Đã nạp phụ đề vào trình phát...\x1b[0m`);

        const viSubs = [];
        const enSubs = [];

        for (const sub of subs) {
          if (sub.includes("_VN_")) {
            viSubs.push(sub);
          } else {
            enSubs.push(sub);
          }
        }

        // Nạp phụ đề tiếng Anh trước (cached)
        for (const sub of enSubs) {
          client.write(JSON.stringify({ command: ["sub-add", sub, "cached", "English", "eng"] }) + "\n");
        }

        // Nạp phụ đề tiếng Việt sau cùng (select) để làm mặc định
        for (const sub of viSubs) {
          client.write(JSON.stringify({ command: ["sub-add", sub, "select", "Tiếng Việt", "vie"] }) + "\n");
        }
      }
    };

    client.on('data', data => {
      const messages = data.toString().split('\n').filter(Boolean);
      for (const msg of messages) {
        try {
          const json = JSON.parse(msg);
          if (json.event === 'file-loaded') {
            client.write(JSON.stringify({ command: ["get_property", "path"], request_id: 999 }) + "\n");
          } else if (json.request_id === 999 && json.data) {
            injectSubtitles(json.data);
          }
        } catch (e) { }
      }
    });

    client.write(JSON.stringify({ command: ["enable_elements", "events"] }) + "\n");
    client.write(JSON.stringify({ command: ["get_property", "path"], request_id: 999 }) + "\n");
  } catch (err) {
    console.log("\x1b[31m[Background] Lỗi IPC:\x1b[0m", err.message);
  }
}

async function main() {
  try {
    const command = parseCommandArgs(process.argv);

    let id;
    let autoSeasonEpisode = null;
    let autoSeasonOnly = null;

    if (command.mode === "interactive") {
      id = await askUserToSelectMovie();
    } else if (command.mode === "id") {
      id = command.id;
    } else if (command.mode === "search") {
      const titles = await fetchSuggestions();
      const results = searchTitles(titles, command.keyword, 20);

      if (results.length === 0) {
        console.error(
          `\x1b[31mKhông tìm thấy phim nào khớp với: ${command.keyword}\x1b[0m`,
        );
        process.exit(1);
      }

      console.log("\n\x1b[32mKết quả tìm kiếm:\x1b[0m");

      results.forEach((movie, index) => {
        const typeLabel = movie.type === "show" ? "TV" : "Movie";
        console.log(
          `${index + 1}. [${typeLabel}] ${movie.nameVi || movie.nameEn} ${movie.nameEn && movie.nameVi && movie.nameEn !== movie.nameVi
            ? `(${movie.nameEn})`
            : ""
          } - ID: ${movie.id}`,
        );
      });

      const rl = readline.createInterface({ input, output });

      try {
        const answer = await rl.question(
          "\n\x1b[36mChọn số thứ tự phim muốn phát: \x1b[0m",
        );

        const selectedIndex = Number(answer) - 1;

        if (
          Number.isNaN(selectedIndex) ||
          selectedIndex < 0 ||
          selectedIndex >= results.length
        ) {
          console.error("\x1b[31mLựa chọn không hợp lệ.\x1b[0m");
          process.exit(1);
        }

        id = results[selectedIndex].id;
      } finally {
        rl.close();
      }
    } else if (command.mode === "search_auto_episode") {
      id = await searchAndPickFirst(command.keyword, {
        preferNonMovie: command.preferNonMovie,
      });

      autoSeasonEpisode = {
        seasonNumber: command.seasonNumber,
        episodeNumber: command.episodeNumber,
      };
    } else if (command.mode === "search_auto_season") {
      id = await searchAndPickFirst(command.keyword, {
        preferNonMovie: command.preferNonMovie,
      });

      autoSeasonOnly = {
        seasonNumber: command.seasonNumber,
      };
    }

    console.log(`\x1b[36m>>> Processing Movie ID: ${id}...\x1b[0m`);
    const movieData = await fetchMovieInfo(id);
    const rootTitle = movieData?.data?.title;

    if (!rootTitle) {
      console.error("\x1b[31mError: Movie not found.\x1b[0m");
      process.exit(1);
    }

    let playableId;

    if (autoSeasonEpisode) {
      playableId = await resolveSeasonEpisodeTitleId(
        rootTitle,
        autoSeasonEpisode.seasonNumber,
        autoSeasonEpisode.episodeNumber,
      );
    } else if (autoSeasonOnly) {
      playableId = await resolveSeasonOnlyTitleId(
        rootTitle,
        autoSeasonOnly.seasonNumber,
      );
    } else {
      playableId = await resolvePlayableTitleId(rootTitle);
    }

    const playableMovieData = await fetchMovieInfo(playableId);
    const title = playableMovieData?.data?.title;

    if (!title || !title.srcUrl) {
      console.error(
        "\x1b[31mError: Selected episode has no playable srcUrl.\x1b[0m",
      );
      process.exit(1);
    }

    console.log(`\x1b[32mMovie:\x1b[0m ${rootTitle.nameVi || rootTitle.nameEn}`);

    // 1. Xác định danh sách các tập cần phát (từ tập được chọn đến hết season)
    let episodeIds = [];
    if (title.parent && title.parent.id) {
      const parentChildrenData = await fetchChildren(title.parent.id);
      const siblings = parentChildrenData?.data?.titles?.nodes || [];
      const currentIndex = siblings.findIndex((s) => s.id === playableId);
      if (currentIndex !== -1) {
        episodeIds = siblings.slice(currentIndex).map((s) => s.id);
      } else {
        episodeIds = [playableId];
      }
    } else {
      episodeIds = [playableId];
    }

    console.log(`\n\x1b[36m>>> Đang chuẩn bị danh sách phát (${episodeIds.length} tập)...\x1b[0m`);
    const downloadDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `phimway-playlist-${id}-`),
    );
    console.log(`\x1b[36m📁 Thư mục phụ đề và playlist: ${downloadDir}\x1b[0m`);

    const playlistItems = [];

    // 2. Chạy song song từng batch 5 tập để tải data và phụ đề
    for (let i = 0; i < episodeIds.length; i += 5) {
      const chunk = episodeIds.slice(i, i + 5);

      const chunkResults = await Promise.all(chunk.map(async (epId) => {
        const epData = await fetchMovieInfo(epId);
        const epTitle = epData?.data?.title;
        if (!epTitle || !epTitle.srcUrl) return null;

        const subData = await fetchSubtitles(epId);
        const subs = subData?.data?.subtitles || [];

        const viSubs = subs.filter((s) => s.language === "vi" && s.fileName).sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 5);
        const enSubs = subs.filter((s) => s.language !== "vi" && s.fileName).sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 5);
        const sortedSubs = [...viSubs, ...enSubs];

        const localSubPaths = [];
        await Promise.all(sortedSubs.map(async (sub, idx) => {
          const remoteUrl = `https://legacy.phimway.com/b/subtitle/${sub.subsceneId}/${sub.fileName}`;
          const lang = sub.language === "vi" ? "VN" : "EN";
          const fileName = `E${epTitle.number || epId}_${idx + 1}_${lang}_${sub.subsceneId}.vtt`;
          const localPath = path.join(downloadDir, fileName);
          try {
            await downloadSubtitle(remoteUrl, localPath);
            localSubPaths.push(localPath);
          } catch (e) {
            // bỏ qua file lỗi
          }
        }));

        return {
          id: epId,
          number: epTitle.number || epId,
          srcUrl: epTitle.srcUrl,
          subPaths: localSubPaths
        };
      }));

      playlistItems.push(...chunkResults.filter(Boolean));
      process.stdout.write(`\r\x1b[32mĐã xử lý: ${Math.min(i + 5, episodeIds.length)}/${episodeIds.length} tập...\x1b[0m`);
    }
    console.log(); // newline

    // 3. Tạo file M3U playlist
    let m3uContent = "#EXTM3U\n\n";
    const subtitleMap = new Map();

    playlistItems.forEach((item) => {
      const titleName = rootTitle.nameVi || rootTitle.nameEn;
      const episodeName = episodeIds.length > 1 ? ` - Tập ${item.number}` : "";
      m3uContent += `#EXTINF:-1, ${titleName}${episodeName}\n`;
      m3uContent += `${item.srcUrl}\n\n`;
      subtitleMap.set(item.srcUrl, item.subPaths);
    });

    const playlistPath = path.join(downloadDir, "playlist.m3u");
    fs.writeFileSync(playlistPath, m3uContent, "utf-8");

    function shellQuote(str) {
      return `'${String(str).replace(/'/g, `'\\''`)}'`;
    }

    const ipcSocketPath = path.join(os.tmpdir(), `phimway-ipc-${Date.now()}.sock`);
    const mpvArgs = [
      `--user-agent=${shellQuote(USER_AGENT)}`,
      `--referrer=${shellQuote("https://legacy.phimway.com")}`,
      `--http-header-fields=${shellQuote("Origin: https://legacy.phimway.com")}`,
      `--resume-playback=no`,
      `--input-ipc-server=${shellQuote(ipcSocketPath)}`,
    ];

    const finalCommand = [
      "open",
      "-n",
      "-a",
      "IINA",
      "--args",
      shellQuote(playlistPath),
      ...mpvArgs.map((arg) => "--mpv-" + arg.substring(2)),
    ].join(" ");

    console.log(`\n\x1b[35m>>> Opening IINA via iina-cli...\x1b[0m`);
    console.log(`\x1b[90m${finalCommand}\x1b[0m`);

    // Chạy trực tiếp iina-cli
    exec(finalCommand, (err, stdout, stderr) => {
      if (err) {
        console.error("\x1b[31mError opening IINA via iina-cli\x1b[0m");
        if (stderr) console.error(stderr);
      } else {
        console.log("\x1b[32m✓ Success! IINA should be playing now.\x1b[0m");
      }
    });

    console.log(`\n\x1b[36m[Chú ý] Cửa sổ Terminal sẽ tiếp tục chạy ngầm để nạp phụ đề vào IINA.\x1b[0m`);
    startSubInjector(ipcSocketPath, subtitleMap);
  } catch (error) {
    if (
      error?.name === "AbortError" ||
      error?.message?.includes("Ctrl+C") ||
      error?.message?.includes("aborted")
    ) {
      console.log("\n\x1b[33mĐã thoát.\x1b[0m");
      process.exit(0);
    }

    console.error("\x1b[31mAn error occurred:\x1b[0m", error);
    process.exit(1);
  }
}

main();

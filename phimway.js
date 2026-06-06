// #!/usr/bin/env node

// /**
//  * Phimway (new SvelteKit site) -> IINA
//  *
//  * Usage:
//  *   node phimway.js <name>            search by name, pick interactively
//  *   node phimway.js <shortId>         play a movie / episode short id directly
//  *   node phimway.js <name> <S> <E>    e.g. node phimway.js fallout 2 1  (jump to S2E1)
//  *   node phimway.js <name> <S>        jump to season S, then pick episode
//  *
//  * If the selected title is a series, you'll be prompted to choose a season
//  * (when there's more than one) and then a specific episode. Movies play directly.
//  *
//  * Fetches .m3u8 via getVideoSrc, episode lists via getEpisodes, and decrypts
//  * subtitles via getSubtitles.
//  */

// const { exec } = require("child_process");
// const readline = require("readline/promises");
// const { stdin: input, stdout: output } = require("process");
// const os = require("os");
// const fs = require("fs");
// const path = require("path");
// const net = require("net");
// const { webcrypto } = require("crypto");

const USER_AGENT =
  "Mozilla/5.0 (iPad; CPU OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5355d Safari/8536.25";

const BASE_URL = "https://phimway.com";

// // SvelteKit remote-function id hashes. Build artifacts; resolveRemoteHashes()
// // refreshes them automatically after a site redeploy.
let RF_GET_VIDEO_SRC = "mk89nz/getVideoSrc";
let RF_GET_SUBTITLES = "1odrich/getSubtitles";
// let RF_GET_EPISODES = "y2ceo9/getEpisodes";

// // ---------------------------------------------------------------------------
// // devalue + remote-payload helpers
// // ---------------------------------------------------------------------------

// function encodeRemotePayload(args) {
//   return Buffer.from(JSON.stringify(args))
//     .toString("base64")
//     .replace(/=+$/, "");
// }

// // Minimal devalue.parse for the reference-array format SvelteKit returns.
// function devalueParse(arr) {
//   if (!Array.isArray(arr)) return arr;
//   const seen = new Array(arr.length);
//   const hydrate = (idx) => {
//     if (typeof idx !== "number") return idx;
//     if (idx < 0) return undefined;
//     if (seen[idx] !== undefined) return seen[idx];
//     const v = arr[idx];
//     if (Array.isArray(v)) {
//       const o = [];
//       seen[idx] = o;
//       for (const e of v) o.push(hydrate(e));
//       return o;
//     }
//     if (v && typeof v === "object") {
//       const o = {};
//       seen[idx] = o;
//       for (const k in v) o[k] = hydrate(v[k]);
//       return o;
//     }
//     seen[idx] = v;
//     return v;
//   };
//   return hydrate(0);
// }

// async function remoteGet(rfId, args) {
//   const payload = encodeRemotePayload(args);
//   const url = `${BASE_URL}/_app/remote/${rfId}?payload=${payload}`;
//   const res = await fetch(url, {
//     headers: {
//       accept: "application/json",
//       "User-Agent": USER_AGENT,
//       Referer: BASE_URL,
//     },
//   });
//   if (!res.ok) throw new Error(`Remote function ${rfId} failed: ${res.status}`);
//   const json = await res.json();
//   if (json.type !== "result")
//     throw new Error(`Unexpected remote response for ${rfId}`);
//   return devalueParse(JSON.parse(json.result));
// }

// // ---------------------------------------------------------------------------
// // Remote-hash auto-discovery (best effort; falls back to hardcoded defaults)
// // ---------------------------------------------------------------------------

// async function resolveRemoteHashes(shortId) {
//   try {
//     const html = await (
//       await fetch(`${BASE_URL}/watch/${shortId}`, {
//         headers: { "User-Agent": USER_AGENT, Referer: BASE_URL },
//       })
//     ).text();

//     const chunks = new Set();
//     const re = /\/_app\/immutable\/[^"']+?\.js/g;
//     let m;
//     while ((m = re.exec(html))) chunks.add(m[0]);

//     const found = { vid: false, sub: false, epi: false };
//     for (const rel of chunks) {
//       if (found.vid && found.sub && found.epi) break;
//       let js;
//       try {
//         js = await (
//           await fetch(BASE_URL + rel, { headers: { "User-Agent": USER_AGENT } })
//         ).text();
//       } catch {
//         continue;
//       }
//       const vid = js.match(/([a-z0-9]+\/getVideoSrc)/i);
//       const sub = js.match(/([a-z0-9]+\/getSubtitles)/i);
//       const epi = js.match(/([a-z0-9]+\/getEpisodes)/i);
//       if (vid) {
//         RF_GET_VIDEO_SRC = vid[1];
//         found.vid = true;
//       }
//       if (sub) {
//         RF_GET_SUBTITLES = sub[1];
//         found.sub = true;
//       }
//       if (epi) {
//         RF_GET_EPISODES = epi[1];
//         found.epi = true;
//       }
//     }
//   } catch {
//     // keep defaults
//   }
// }

// // ---------------------------------------------------------------------------
// // Catalog + search
// // ---------------------------------------------------------------------------

// function dateString(d) {
//   const yyyy = d.getFullYear();
//   const mm = String(d.getMonth() + 1).padStart(2, "0");
//   const dd = String(d.getDate()).padStart(2, "0");
//   return `${yyyy}-${mm}-${dd}`;
// }

// // Catalog entry: [shortId, nameEn, nameVi, posterPath, type, imdbId]
// async function fetchSuggestions() {
//   const tryDate = async (d) => {
//     const url = `${BASE_URL}/api/titles/${dateString(d)}-0.js`;
//     const res = await fetch(url, {
//       headers: { "User-Agent": USER_AGENT, Referer: BASE_URL },
//     });
//     if (!res.ok) return null;
//     return res.json();
//   };

//   const today = new Date();
//   let data = await tryDate(today);
//   if (!data) data = await tryDate(new Date(today.getTime() - 86400000));
//   if (!data)
//     throw new Error(
//       "Failed to fetch catalog (today and yesterday both unavailable).",
//     );
//   return data;
// }

// function normalizeText(str) {
//   return String(str || "")
//     .toLowerCase()
//     .normalize("NFD")
//     .replace(/[\u0300-\u036f]/g, "")
//     .replace(/đ/g, "d")
//     .trim();
// }

// function searchTitles(titles, keyword, limit = 20, options = {}) {
//   const { preferMovie = false, preferNonMovie = false } = options;
//   const q = normalizeText(keyword);

//   return titles
//     .map((item) => {
//       const [id, nameEn, nameVi, posterPath, type, imdbId] = item;
//       const en = normalizeText(nameEn);
//       const vi = normalizeText(nameVi);
//       const normalizedType = normalizeText(type);
//       const haystack = `${en} ${vi}`;

//       let score = 0;
//       if (en === q || vi === q) score += 100;
//       if (en.startsWith(q) || vi.startsWith(q)) score += 50;
//       if (haystack.includes(q)) score += 20;

//       const tokens = q.split(/\s+/).filter(Boolean);
//       score += tokens.filter((t) => haystack.includes(t)).length * 5;

//       const isMovie = normalizedType === "movie";
//       if (preferMovie) score += isMovie ? 40 : -20;
//       if (preferNonMovie) score += !isMovie ? 40 : -30;

//       return { id, nameEn, nameVi, posterPath, type, imdbId, score };
//     })
//     .filter((m) => m.score > 0)
//     .sort((a, b) => b.score - a.score)
//     .slice(0, limit);
// }

// async function askUserToSelectMovie(keyword, options = {}) {
//   const rl = readline.createInterface({ input, output });
//   try {
//     let term = keyword;
//     if (!term)
//       term = await rl.question("\x1b[36mNhập tên phim cần tìm: \x1b[0m");
//     if (!term.trim()) {
//       console.error("\x1b[31mBạn chưa nhập tên phim.\x1b[0m");
//       process.exit(1);
//     }

//     console.log("\x1b[35m>>> Đang tải danh sách phim...\x1b[0m");
//     const titles = await fetchSuggestions();
//     const results = searchTitles(titles, term, 20, options);

//     if (results.length === 0) {
//       console.error(`\x1b[31mKhông tìm thấy phim nào khớp với: ${term}\x1b[0m`);
//       process.exit(1);
//     }

//     console.log("\n\x1b[32mKết quả tìm kiếm:\x1b[0m");
//     results.forEach((movie, index) => {
//       const typeLabel =
//         movie.type === "show"
//           ? "TV"
//           : movie.type === "movie"
//             ? "Movie"
//             : movie.type;
//       const altName =
//         movie.nameEn && movie.nameVi && movie.nameEn !== movie.nameVi
//           ? ` (${movie.nameEn})`
//           : "";
//       console.log(
//         `${index + 1}. [${typeLabel}] ${movie.nameVi || movie.nameEn}${altName} - ID: ${movie.id}`,
//       );
//     });

//     const answer = await rl.question(
//       "\n\x1b[36mChọn số thứ tự phim muốn phát: \x1b[0m",
//     );
//     const selectedIndex = Number(answer) - 1;
//     if (
//       Number.isNaN(selectedIndex) ||
//       selectedIndex < 0 ||
//       selectedIndex >= results.length
//     ) {
//       console.error("\x1b[31mLựa chọn không hợp lệ.\x1b[0m");
//       process.exit(1);
//     }

//     const selected = results[selectedIndex];
//     console.log(
//       `\x1b[32m✓ Đã chọn:\x1b[0m ${selected.nameVi || selected.nameEn} - ID: ${selected.id}`,
//     );
//     return selected.id;
//   } finally {
//     rl.close();
//   }
// }

// async function askUserToSelectFromList(items, label, render) {
//   const rl = readline.createInterface({ input, output });
//   try {
//     console.log(`\n\x1b[32m${label}:\x1b[0m`);
//     items.forEach((item, i) => console.log(`${i + 1}. ${render(item)}`));
//     const answer = await rl.question("\n\x1b[36mChọn số thứ tự: \x1b[0m");
//     const idx = Number(answer) - 1;
//     if (Number.isNaN(idx) || idx < 0 || idx >= items.length) {
//       console.error("\x1b[31mLựa chọn không hợp lệ.\x1b[0m");
//       process.exit(1);
//     }
//     return items[idx];
//   } finally {
//     rl.close();
//   }
// }

// // ---------------------------------------------------------------------------
// // New-site media API
// // ---------------------------------------------------------------------------

// // fid = short id string, e.g. "pIai" or an episode fid like "yE8g"
// async function fetchVideoSrcNew(fid, server = "1") {
//   const r = await remoteGet(RF_GET_VIDEO_SRC, [
//     ["__skrao", 1],
//     { fid: 2, server: 3 },
//     String(fid),
//     String(server),
//   ]);
//   if (!r || !r.src)
//     throw new Error("No video source returned (may need login/VIP).");
//   return r.src; // .m3u8 URL
// }

// async function fetchSubtitlesNew(fid) {
//   const subs = await remoteGet(RF_GET_SUBTITLES, [String(fid)]);
//   return Array.isArray(subs) ? subs : [];
// }

// // Episodes of a season: takes a season fid, returns [{fid, number, ...}, ...]
// async function fetchEpisodesNew(seasonFid) {
//   const eps = await remoteGet(RF_GET_EPISODES, [String(seasonFid)]);
//   return Array.isArray(eps) ? eps : [];
// }

// // Seasons are inlined in the watch page SSR data.
// async function fetchSeasonsNew(fid) {
//   const html = await (
//     await fetch(`${BASE_URL}/watch/${fid}`, {
//       headers: { "User-Agent": USER_AGENT, Referer: BASE_URL },
//     })
//   ).text();

//   const m = html.match(/seasons:\[(.*?)\]/s);
//   if (!m) return [];
//   const seasons = [];
//   const re = /fid:"([^"]+)"\s*,\s*number:(\d+)[^}]*?episodeCount:"?(\d+)"?/g;
//   let g;
//   while ((g = re.exec(m[1]))) {
//     seasons.push({
//       fid: g[1],
//       number: Number(g[2]),
//       episodeCount: Number(g[3]),
//     });
//   }
//   return seasons;
// }

// function newSubtitleUrl(sub) {
//   return `${BASE_URL}/api/subtitle/${sub.subsceneId}/${sub.fileName}`;
// }

// // ---------------------------------------------------------------------------
// // Subtitle decryption (same scheme as the legacy site)
// // ---------------------------------------------------------------------------

// function rot19(s) {
//   return s.replace(/[a-z]/gi, (c) => {
//     const base = c <= "Z" ? 65 : 97;
//     return String.fromCharCode(((c.charCodeAt(0) - base + 19) % 26) + base);
//   });
// }

// async function downloadSubtitle(url, destPath) {
//   const fileName = path.basename(new URL(url).pathname);

//   const keyInput = "/watch/" + rot19(fileName);
//   const hash = await webcrypto.subtle.digest(
//     "SHA-256",
//     new TextEncoder().encode(keyInput),
//   );
//   const key = await webcrypto.subtle.importKey(
//     "raw",
//     hash,
//     { name: "AES-GCM" },
//     false,
//     ["decrypt"],
//   );

//   const response = await fetch(url, {
//     headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
//   });
//   if (!response.ok)
//     throw new Error(`Failed to download subtitle: ${response.status}`);
//   const b64 = (await response.text()).trim();

//   const bytes = Buffer.from(b64, "base64");
//   const iv = bytes.subarray(0, 12);
//   const ct = bytes.subarray(12);

//   const pt = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
//   fs.writeFileSync(destPath, new TextDecoder("utf-8").decode(pt), "utf-8");
//   return destPath;
// }

// async function downloadSubsFor(fid, downloadDir, tag) {
//   const subs = await fetchSubtitlesNew(fid).catch(() => []);
//   const likeCount = (s) => (Array.isArray(s.likers) ? s.likers.length : 0);
//   const viSubs = subs
//     .filter((s) => s.language === "vi" && s.fileName)
//     .sort((a, b) => likeCount(b) - likeCount(a))
//     .slice(0, 5);
//   const enSubs = subs
//     .filter((s) => s.language !== "vi" && s.fileName)
//     .sort((a, b) => likeCount(b) - likeCount(a))
//     .slice(0, 5);
//   const chosen = [...viSubs, ...enSubs];

//   const localSubPaths = [];
//   await Promise.all(
//     chosen.map(async (sub, idx) => {
//       const lang = sub.language === "vi" ? "VN" : "EN";
//       const ext = path.extname(sub.fileName) || ".srt";
//       const outName = `${tag}_${idx + 1}_${lang}_${sub.subsceneId}${ext}`;
//       const outPath = path.join(downloadDir, outName);
//       try {
//         await downloadSubtitle(newSubtitleUrl(sub), outPath);
//         localSubPaths.push(outPath);
//       } catch (e) {}
//     }),
//   );
//   return localSubPaths;
// }

// // ---------------------------------------------------------------------------
// // IINA subtitle injector (from your original)
// // ---------------------------------------------------------------------------

// async function startSubInjector(ipcSocketPath, subtitleMap) {
//   let client = null;
//   try {
//     for (let i = 0; i < 20; i++) {
//       await new Promise((r) => setTimeout(r, 500));
//       if (fs.existsSync(ipcSocketPath)) break;
//     }
//     if (!fs.existsSync(ipcSocketPath)) {
//       console.log(
//         "\x1b[31m[Background] Không thể kết nối tới IINA IPC.\x1b[0m",
//       );
//       return;
//     }

//     client = net.createConnection(ipcSocketPath);
//     const addedSubsFor = new Set();

//     const injectSubtitles = (currentUrl) => {
//       if (!currentUrl || addedSubsFor.has(currentUrl)) return;
//       const subs = subtitleMap.get(currentUrl);
//       if (subs && subs.length > 0) {
//         addedSubsFor.add(currentUrl);
//         console.log(
//           `\n\x1b[35m[Background] Đã nạp phụ đề vào trình phát...\x1b[0m`,
//         );

//         const viSubs = [];
//         const enSubs = [];
//         for (const sub of subs) {
//           if (sub.includes("_VN_")) viSubs.push(sub);
//           else enSubs.push(sub);
//         }
//         for (const sub of enSubs) {
//           client.write(
//             JSON.stringify({
//               command: ["sub-add", sub, "cached", "English", "eng"],
//             }) + "\n",
//           );
//         }
//         for (const sub of viSubs) {
//           client.write(
//             JSON.stringify({
//               command: ["sub-add", sub, "select", "Tiếng Việt", "vie"],
//             }) + "\n",
//           );
//         }
//       }
//     };

//     client.on("data", (data) => {
//       const messages = data.toString().split("\n").filter(Boolean);
//       for (const msg of messages) {
//         try {
//           const json = JSON.parse(msg);
//           if (json.event === "file-loaded") {
//             client.write(
//               JSON.stringify({
//                 command: ["get_property", "path"],
//                 request_id: 999,
//               }) + "\n",
//             );
//           } else if (json.request_id === 999 && json.data) {
//             injectSubtitles(json.data);
//           }
//         } catch (e) {}
//       }
//     });

//     client.write(
//       JSON.stringify({ command: ["enable_elements", "events"] }) + "\n",
//     );
//     client.write(
//       JSON.stringify({ command: ["get_property", "path"], request_id: 999 }) +
//         "\n",
//     );
//   } catch (err) {
//     console.log("\x1b[31m[Background] Lỗi IPC:\x1b[0m", err.message);
//   }
// }

// // ---------------------------------------------------------------------------
// // season / episode selection
// // ---------------------------------------------------------------------------

// function looksLikeShortId(s) {
//   return /^[A-Za-z0-9]{2,6}$/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s);
// }

// // Resolve which item to play from a starting fid.
// // - Movie / single title: returns just that fid.
// // - Series: prompts for season (if >1) and episode, returns the chosen episode.
// async function buildEpisodeList(startFid, seasonNumber, episodeNumber) {
//   const seasons = await fetchSeasonsNew(startFid);

//   // No seasons -> movie / single playable title.
//   if (!seasons || seasons.length === 0) {
//     return [{ fid: startFid, number: null }];
//   }

//   console.log(`\x1b[35m>>> Đây là phim bộ (${seasons.length} mùa).\x1b[0m`);

//   // ---- pick season ----
//   let season;
//   if (seasonNumber != null) {
//     season = seasons.find((s) => s.number === Number(seasonNumber));
//     if (!season) {
//       console.error(`\x1b[31mKhông tìm thấy Season ${seasonNumber}.\x1b[0m`);
//       seasons.forEach((s) =>
//         console.log(`- Season ${s.number} (${s.episodeCount} tập)`),
//       );
//       process.exit(1);
//     }
//   } else if (seasons.length === 1) {
//     season = seasons[0];
//     console.log(
//       `\x1b[32m✓ Season:\x1b[0m ${season.number} (${season.episodeCount} tập)`,
//     );
//   } else {
//     season = await askUserToSelectFromList(
//       seasons,
//       "Chọn Mùa (Season)",
//       (s) => `Season ${s.number} - ${s.episodeCount} tập`,
//     );
//   }

//   // ---- load episodes ----
//   const episodes = await fetchEpisodesNew(season.fid);
//   if (episodes.length === 0) {
//     console.error(
//       `\x1b[31mKhông lấy được danh sách tập của Season ${season.number}.\x1b[0m`,
//     );
//     process.exit(1);
//   }

//   // ---- pick episode ----
//   let episode;
//   if (episodeNumber != null) {
//     episode = episodes.find((e) => Number(e.number) === Number(episodeNumber));
//     if (!episode) {
//       console.error(`\x1b[31mKhông tìm thấy Episode ${episodeNumber}.\x1b[0m`);
//       episodes.forEach((e) => console.log(`- Tập ${e.number}`));
//       process.exit(1);
//     }
//   } else if (episodes.length === 1) {
//     episode = episodes[0];
//   } else {
//     episode = await askUserToSelectFromList(
//       episodes,
//       `Chọn Tập - Season ${season.number}`,
//       (e) => `Tập ${e.number}`,
//     );
//   }

//   console.log(`\x1b[32m✓ Đã chọn:\x1b[0m S${season.number}E${episode.number}`);
//   return [{ fid: episode.fid, number: episode.number }];
// }

// // ---------------------------------------------------------------------------
// // main
// // ---------------------------------------------------------------------------

// async function main() {
//   try {
//     const args = process.argv.slice(2);

//     // Optional S and E numbers at the end: "<name> 2 1" or "<name> 2".
//     let seasonNumber = null;
//     let episodeNumber = null;
//     if (
//       args.length >= 3 &&
//       /^\d+$/.test(args[args.length - 1]) &&
//       /^\d+$/.test(args[args.length - 2])
//     ) {
//       episodeNumber = Number(args.pop());
//       seasonNumber = Number(args.pop());
//     } else if (
//       args.length >= 2 &&
//       /^\d+$/.test(args[args.length - 1]) &&
//       !looksLikeShortId(args[0])
//     ) {
//       seasonNumber = Number(args.pop());
//     }

//     const query = args.join(" ").trim();

//     let startFid;
//     if (!query) {
//       startFid = await askUserToSelectMovie();
//     } else if (args.length === 1 && looksLikeShortId(args[0])) {
//       startFid = args[0];
//     } else {
//       const opts = seasonNumber != null ? { preferNonMovie: true } : {};
//       startFid = await askUserToSelectMovie(query, opts);
//     }

//     console.log(`\x1b[36m>>> Processing: ${startFid}...\x1b[0m`);
//     await resolveRemoteHashes(startFid);

//     // Determine what to play (movie = single item, series = chosen episode).
//     const episodeRefs = await buildEpisodeList(
//       startFid,
//       seasonNumber,
//       episodeNumber,
//     );

//     const downloadDir = fs.mkdtempSync(
//       path.join(os.tmpdir(), `phimway-${startFid}-`),
//     );
//     console.log(`\x1b[36m📁 Thư mục phụ đề và playlist: ${downloadDir}\x1b[0m`);

//     const items = [];
//     for (const ref of episodeRefs) {
//       let src;
//       try {
//         src = await fetchVideoSrcNew(ref.fid, "1");
//       } catch (e) {
//         console.error(
//           `\x1b[31mKhông lấy được nguồn cho ${ref.fid}: ${e.message}\x1b[0m`,
//         );
//         continue;
//       }
//       const tag = ref.number != null ? `E${ref.number}` : "E";
//       const subPaths = await downloadSubsFor(ref.fid, downloadDir, tag);
//       items.push({ fid: ref.fid, number: ref.number, src, subPaths });
//       console.log(`\x1b[32m✓ ${tag}: ${subPaths.length} phụ đề.\x1b[0m`);
//     }

//     if (items.length === 0) {
//       console.error("\x1b[31mKhông lấy được nguồn phát nào.\x1b[0m");
//       process.exit(1);
//     }

//     // Build M3U + subtitle map.
//     let m3uContent = "#EXTM3U\n\n";
//     const subtitleMap = new Map();
//     items.forEach((item) => {
//       const label =
//         item.number != null ? `${startFid} - Tập ${item.number}` : startFid;
//       m3uContent += `#EXTINF:-1, ${label}\n${item.src}\n\n`;
//       subtitleMap.set(item.src, item.subPaths);
//     });

//     const playlistPath = path.join(downloadDir, "playlist.m3u");
//     fs.writeFileSync(playlistPath, m3uContent, "utf-8");

//     function shellQuote(str) {
//       return `'${String(str).replace(/'/g, `'\\''`)}'`;
//     }

//     const ipcSocketPath = path.join(
//       os.tmpdir(),
//       `phimway-ipc-${Date.now()}.sock`,
//     );
//     const mpvArgs = [
//       `--user-agent=${shellQuote(USER_AGENT)}`,
//       `--referrer=${shellQuote(BASE_URL)}`,
//       `--http-header-fields=${shellQuote("Origin: " + BASE_URL)}`,
//       `--resume-playback=no`,
//       `--input-ipc-server=${shellQuote(ipcSocketPath)}`,
//     ];

//     const finalCommand = [
//       "open",
//       "-n",
//       "-a",
//       "IINA",
//       "--args",
//       shellQuote(playlistPath),
//       ...mpvArgs.map((arg) => "--mpv-" + arg.substring(2)),
//     ].join(" ");

//     console.log(`\n\x1b[35m>>> Opening IINA...\x1b[0m`);
//     console.log(`\x1b[90m${finalCommand}\x1b[0m`);

//     exec(finalCommand, (err, stdout, stderr) => {
//       if (err) {
//         console.error("\x1b[31mError opening IINA\x1b[0m");
//         if (stderr) console.error(stderr);
//       } else {
//         console.log("\x1b[32m✓ Success! IINA should be playing now.\x1b[0m");
//       }
//     });

//     console.log(
//       `\n\x1b[36m[Chú ý] Terminal chạy ngầm để nạp phụ đề vào IINA.\x1b[0m`,
//     );
//     startSubInjector(ipcSocketPath, subtitleMap);
//   } catch (error) {
//     console.error("\x1b[31mAn error occurred:\x1b[0m", error.message || error);
//     process.exit(1);
//   }
// }

// main();


// add to the hash constants
let RF_GET_EPISODES = "y2ceo9/getEpisodes";

// add to resolveRemoteHashes() loop, alongside the others:
//   const epi = js.match(/([a-z0-9]+\/getEpisodes)/i);
//   if (epi) RF_GET_EPISODES = epi[1];

// Episodes of a season: takes a season fid, returns [{fid, number, ...}, ...]
async function fetchEpisodesNew(seasonFid) {
  const eps = await remoteGet(RF_GET_EPISODES, [String(seasonFid)]);
  return Array.isArray(eps) ? eps : [];
}

// Seasons are embedded in the title/watch page HTML. Scrape them from the SSR data.
async function fetchSeasonsNew(showOrEpisodeFid) {
  const html = await (
    await fetch(`${BASE_URL}/watch/${showOrEpisodeFid}`, {
      headers: { "User-Agent": USER_AGENT, Referer: BASE_URL },
    })
  ).text();

  // seasons:[{fid:"mCw3",number:1,...,episodeCount:"8"}, ...]
  const m = html.match(/seasons:\[(.*?)\]/s);
  if (!m) return [];
  const seasons = [];
  const re = /fid:"([^"]+)"\s*,\s*number:(\d+)[^}]*?episodeCount:"?(\d+)"?/g;
  let g;
  while ((g = re.exec(m[1]))) {
    seasons.push({ fid: g[1], number: Number(g[2]), episodeCount: Number(g[3]) });
  }
  return seasons;
}

const seasons = await fetchSeasonsNew("NngG");          // -> [{fid:"mCw3",number:1,...}, {fid:"lQOZ",number:2,...}]
const eps = await fetchEpisodesNew(seasons[1].fid);     // season 2 episodes
for (const ep of eps) {
  const src = await fetchVideoSrcNew(ep.fid);           // .m3u8 per episode
  const subs = await fetchSubtitlesNew(ep.fid);
  // ...add to M3U + subtitleMap, same as the single-title path
}
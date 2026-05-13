const { core, menu, utils, console, event, http, mpv } = iina;

const USER_AGENT =
  "Mozilla/5.0 (iPad; CPU OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5355d Safari/8536.25";

const BASE_URL = "https://legacy.phimway.com";
const API_URL = `${BASE_URL}/b/g`;

console.log("PHIMWAY MAIN LOADED");

async function fetchPhimway(operationName, variables, query) {
  const res = await http.post(API_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
      Origin: BASE_URL,
      Referer: `${BASE_URL}/`,
    },
    data: {
      operationName,
      variables,
      query,
    },
  });

  console.log("HTTP status:", res.statusCode);
  console.log("Response text:");
  console.log(res.text);

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(
      `HTTP ${res.statusCode}: ${res.reason || "Request failed"}`,
    );
  }

  if (res.data && typeof res.data === "object") {
    return res.data;
  }

  return JSON.parse(res.text);
}

function buildSubtitleUrl(sub) {
  if (!sub || !sub.subsceneId || !sub.files || !sub.files.length) {
    return null;
  }

  return `${BASE_URL}/b/subtitle/${sub.subsceneId}/${sub.files[0]}/vtt.css`;
}

function pickSubtitles(subs) {
  const list = Array.isArray(subs) ? subs : [];

  const viSubs = list
    .filter((s) => s.language === "vi")
    .sort((a, b) => (b.likes || 0) - (a.likes || 0))
    .slice(0, 3);

  const enSubs = list
    .filter((s) => s.language !== "vi")
    .sort((a, b) => (b.likes || 0) - (a.likes || 0))
    .slice(0, 3);

  return [...viSubs, ...enSubs];
}

// function applyPlaybackOptions() {
//   try {
//     mpv.set("user-agent", USER_AGENT);
//     mpv.set("referrer", BASE_URL);

//     // mpv option http-header-fields là list, nên truyền native array.
//     mpv.set("http-header-fields", [
//       `Origin: ${BASE_URL}`,
//       `Referer: ${BASE_URL}/`
//     ]);

//     console.log("Playback options applied");
//   } catch (e) {
//     console.log("applyPlaybackOptions error:", e.message || e);
//   }
// }

function applyPlaybackOptions() {
  try {
    mpv.set("user-agent", USER_AGENT);
    mpv.set("referrer", BASE_URL);

    mpv.set("http-header-fields", [
      `Origin: ${BASE_URL}`,
      `Referer: ${BASE_URL}/`,
    ]);

    console.log("Playback options applied");
  } catch (e) {
    console.log("applyPlaybackOptions error:", e.message || e);
  }
}

function loadSubtitles(subtitleUrls) {
  if (!Array.isArray(subtitleUrls) || subtitleUrls.length === 0) {
    console.log("No subtitle URLs");
    return;
  }

  subtitleUrls.forEach((url, index) => {
    try {
      console.log("Adding subtitle via mpv:", url);

      mpv.command("sub-add", [url, index === 0 ? "select" : "auto"]);

      if (index === 0) {
        core.osd("Subtitle loaded");
      }
    } catch (e) {
      console.log("Subtitle add error:", e.message || e);
    }
  });
}

async function openPhimwayMovie(id) {
  try {
    id = String(id || "").trim();

    if (!id) {
      core.osd("Invalid movie ID");
      return;
    }

    core.osd(`Fetching Movie ${id}...`);
    console.log("Opening Phimway movie ID:", id);

    const movieQuery = `
query TitleWatch($id: String!, $server: String) {
  title(id: $id, server: $server) {
    id
    nameVi
    nameEn
    srcUrl
  }
}
`;

    const subQuery = `
query Subtitles($titleId: String!) {
  subtitles(titleId: $titleId) {
    subsceneId
    language
    files
    isDefault
    likes
  }
}
`;

    const movieRes = await fetchPhimway(
      "TitleWatch",
      {
        id,
        server: "1",
      },
      movieQuery,
    );

    const title = movieRes && movieRes.data && movieRes.data.title;

    console.log("Movie title:");
    console.log(JSON.stringify(title, null, 2));

    if (!title || !title.srcUrl) {
      core.osd("Movie not found!");
      return;
    }

    let subtitleUrls = [];

    try {
      const subRes = await fetchPhimway(
        "Subtitles",
        {
          titleId: id,
        },
        subQuery,
      );

      const subs =
        subRes && subRes.data && Array.isArray(subRes.data.subtitles)
          ? subRes.data.subtitles
          : [];

      subtitleUrls = pickSubtitles(subs).map(buildSubtitleUrl).filter(Boolean);
    } catch (e) {
      console.log("Subtitle fetch failed:", e.message || e);
    }

    const displayName = title.nameVi || title.nameEn || `Movie ${id}`;

    console.log("STREAM URL:");
    console.log(title.srcUrl);

    console.log("SUBTITLE URLS:");
    console.log(JSON.stringify(subtitleUrls, null, 2));

    applyPlaybackOptions();

    let subtitlesLoaded = false;

    event.on("iina.file-loaded", () => {
      if (subtitlesLoaded) {
        return;
      }

      subtitlesLoaded = true;

      console.log("File loaded, loading subtitles");
      loadSubtitles(subtitleUrls);
    });

    console.log("Loading stream via mpv:");
    console.log(title.srcUrl);

    // Không dùng core.open ở đây vì nó làm IINA crash.
    // Dùng mpv.loadfile để mở trực tiếp m3u8.
    setTimeout(() => {
      try {
        mpv.command("loadfile", [title.srcUrl, "replace"]);

        core.osd(`Playing: ${displayName}`);
      } catch (e) {
        console.log("mpv loadfile error:", e.message || e);
        core.osd("Open stream error!");
      }
    }, 100);
  } catch (e) {
    console.log("openPhimwayMovie error:", e.message || e);
    core.osd("Playback Error!");
  }
}

menu.addItem(
  menu.item("Open Phimway Movie ID...", () => {
    const id = utils.prompt("Enter Phimway Movie ID:");

    if (!id) {
      return;
    }

    openPhimwayMovie(id);
  }),
);

// decrypt-sub.js
// Usage:
//   node decrypt-sub.js <subtitle-url> [output.srt]
// Example:
//   node decrypt-sub.js "https://legacy.phimway.com/b/subtitle/-63970/v01.srt" out.srt

import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { webcrypto as crypto } from "node:crypto";

function rot19(s) {
  return s.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 19) % 26) + base);
  });
}

async function decryptPhimwaySub(url) {
  // fileName = phần cuối của URL, ví dụ "v01.srt"
  const fileName = basename(new URL(url).pathname);

  // 1. Derive AES-256 key: SHA-256( "/watch/" + ROT19(fileName) )
  const keyInput = "/watch/" + rot19(fileName);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(keyInput),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  // 2. Tải file base64
  const res = await fetch(url, {
    headers: {
      // một số server chặn nếu không có UA giống browser
      "User-Agent": "Mozilla/5.0",
      Accept: "*/*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} khi tải ${url}`);
  const b64 = (await res.text()).trim();

  // 3. Base64 -> bytes, tách IV (12) + ciphertext+tag (16 ở cuối)
  const bytes = Buffer.from(b64, "base64");
  const iv = bytes.subarray(0, 12);
  const ct = bytes.subarray(12);

  // 4. AES-GCM decrypt
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder("utf-8").decode(pt);
}

// ---------- CLI ----------
const [, , url, outPath] = process.argv;
if (!url) {
  console.error("Usage: node decrypt-sub.js <subtitle-url> [output.srt]");
  process.exit(1);
}

decryptPhimwaySub(url)
  .then((srt) => {
    if (outPath) {
      writeFileSync(outPath, srt, "utf-8");
      console.error(`✓ Đã lưu ${srt.length} ký tự vào ${outPath}`);
    } else {
      process.stdout.write(srt);
    }
  })
  .catch((err) => {
    console.error("Lỗi:", err.message);
    process.exit(1);
  });

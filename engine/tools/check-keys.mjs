#!/usr/bin/env node
/**
 * 逐一驗證 .dev.vars 裡的每一把金鑰是不是真的能用。
 * 用列模型清單（models.list）來驗，不耗生成額度。
 *
 * 用法：node engine/tools/check-keys.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(here, "../../.dev.vars");

let keys = [];
try {
  const line = readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("GEMINI_API_KEYS="));
  keys = (line ?? "").replace("GEMINI_API_KEYS=", "").split(",").map((k) => k.trim()).filter(Boolean);
} catch {
  console.error(`讀不到 ${envFile}`);
  process.exit(1);
}

if (!keys.length) {
  console.error("`.dev.vars` 裡沒有金鑰");
  process.exit(1);
}

console.log(`共 ${keys.length} 把，開始驗證…\n`);
let ok = 0;
for (const [i, key] of keys.entries()) {
  const tail = key.slice(-6);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (res.ok) {
      const data = await res.json();
      const n = (data.models ?? []).length;
      console.log(`✓ 第 ${i + 1} 把（…${tail}）可用，看得到 ${n} 個模型`);
      ok++;
    } else {
      const body = await res.text();
      console.log(`✗ 第 ${i + 1} 把（…${tail}）不可用：${res.status} ${body.slice(0, 120)}`);
    }
  } catch (e) {
    console.log(`✗ 第 ${i + 1} 把（…${tail}）連不上：${e.message}`);
  }
}

console.log(`\n${ok}/${keys.length} 把可用`);
// 用 exitCode 而不是 process.exit()：Windows 上立刻結束會撞到 libuv 的 handle 斷言雜訊
process.exitCode = ok === keys.length ? 0 : 1;

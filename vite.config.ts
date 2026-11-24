import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
// 工作目录可能包含非 ASCII 字符，直接用 URL.pathname 会得到百分号编码路径，
// 导致目录索引（barrel）解析失败。这里在解析时显式解码。
function decodedAlias(): Plugin {
  const resolved = decodeURIComponent(new URL("./src", import.meta.url).pathname);
  return {
    name: "decoded-at-alias",
    enforce: "pre",
    resolveId(source) {
      if (source === "@" || source.startsWith("@/")) {
        const rest = source.slice(1);
        return this.resolve(resolved + rest, undefined, { skipSelf: true });
      }
      return null;
    },
  };
}
export default defineConfig({
  plugins: [vue(), decodedAlias()],
  resolve: {
    extensions: [
      ".mjs",
      ".js",
      ".mts",
      ".ts",
      ".jsx",
      ".tsx",
      ".json",
      ".vue",
    ],
  },
});

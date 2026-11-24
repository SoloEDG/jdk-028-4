import { ref, watch, type Ref } from "vue";
import type { CircuitDocument } from "@/shared/types";
import type { Notice } from "@/shared/commands";
import {
  decodeDocument,
  decodeTraceKind,
  encodeDocument,
  encodeTrace,
} from "../lib/codec";
import { sampleCircuit, emptyCircuit, pipelineCircuit } from "../lib/seeds";
export const STORAGE_KEY = "logic-lab-jdk-028-v1";
/** 已录制实验轨迹单独存储，与电路配置区分。 */
export const TRACE_STORAGE_KEY = "logic-lab-jdk-028-trace-v1";
export function loadInitial(): {
  document: CircuitDocument;
  warning: string | null;
} {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return {
      document: text ? decodeDocument(text) : sampleCircuit(),
      warning: null,
    };
  } catch {
    return {
      document: sampleCircuit(),
      warning: "本地存档无法读取，已打开示例；导出当前实验后可重新保存。",
    };
  }
}
export function useWorkspace(
  document: Ref<CircuitDocument>,
  notify: (notice: Notice) => void,
  reset: () => void,
  options?: { exportTrace?: () => unknown },
) {
  const status = ref("本地自动保存");
  function save() {
    try {
      // 电路配置与实验轨迹分库保存：接线变化不会冲掉历史录制。
      localStorage.setItem(STORAGE_KEY, encodeDocument(document.value));
      if (options?.exportTrace) {
        try {
          localStorage.setItem(
            TRACE_STORAGE_KEY,
            encodeTrace(options.exportTrace()),
          );
        } catch {
          /* 轨迹存储失败不阻断电路保存 */
        }
      }
      status.value = "已保存：电路配置与实验轨迹分开存储";
    } catch {
      status.value = "保存失败，请导出文件";
      notify({ tone: "error", message: "浏览器存储不可用，请导出实验文件" });
    }
  }
  watch(document, save, { deep: true });
  function replace(next: CircuitDocument) {
    document.value = next;
    reset();
  }
  function sample() {
    replace(document.value.mode === "timing" ? pipelineCircuit() : sampleCircuit());
    notify({
      tone: "success",
      message:
        document.value.mode === "timing"
          ? "已载入两级流水示例：单步时钟观察数据逐级移动"
          : "已载入异或示例",
    });
  }
  function clear() {
    replace(emptyCircuit(document.value.mode));
    notify({ tone: "info", message: "已新建空白实验" });
  }
  function importText(text: string) {
    const kind = decodeTraceKind(text);
    if (kind === "trace") {
      notify({
        tone: "info",
        message: "这是实验轨迹文件；电路配置请使用电路 JSON 导入，轨迹可通过“导出轨迹”单独保存。",
      });
      return;
    }
    try {
      const next = decodeDocument(text);
      replace(next);
      notify({ tone: "success", message: "导入成功，电路配置已恢复（轨迹需重新录制）" });
    } catch (error) {
      notify({
        tone: "error",
        message: `导入失败：${error instanceof Error ? error.message : "文件无法读取"}；当前实验已保留`,
      });
    }
  }
  function exportFile() {
    const url = URL.createObjectURL(
      new Blob([encodeDocument(document.value)], { type: "application/json" }),
    );
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${document.value.name.replace(/[^\p{L}\p{N}_-]/gu, "_") || "logic-lab"}-circuit.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify({ tone: "success", message: "电路配置已导出（不含录制轨迹）" });
  }
  function exportTraceFile() {
    if (!options?.exportTrace) return;
    const payload = encodeTrace(options.exportTrace());
    const url = URL.createObjectURL(
      new Blob([payload], { type: "application/json" }),
    );
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${document.value.name.replace(/[^\p{L}\p{N}_-]/gu, "_") || "logic-lab"}-trace.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify({ tone: "success", message: "实验轨迹已单独导出" });
  }
  return {
    status,
    save,
    sample,
    clear,
    importText,
    exportFile,
    exportTraceFile,
  };
}

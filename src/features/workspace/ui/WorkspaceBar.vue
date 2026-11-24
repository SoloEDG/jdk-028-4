<script setup lang="ts">
import { ref } from "vue";
import type { LabMode } from "@/shared/types";
const props = defineProps<{
  name: string;
  status: string;
  mode: LabMode;
}>();
const emit = defineEmits<{
  rename: [name: string];
  sample: [];
  clear: [];
  save: [];
  export: [];
  "export-trace": [];
  import: [text: string];
  "switch-mode": [mode: LabMode];
  error: [message: string];
}>();
const input = ref<HTMLInputElement | null>(null);
async function upload(event: Event) {
  const el = event.target as HTMLInputElement,
    file = el.files?.[0];
  if (!file) return;
  if (file.size > 2_000_000) {
    emit("error", "文件超过 2 MB，当前实验已保留");
    el.value = "";
    return;
  }
  try {
    emit("import", await file.text());
  } catch {
    emit("error", "文件读取失败，当前实验已保留");
  }
  el.value = "";
}
function replace(kind: "sample" | "clear") {
  if (
    window.confirm(
      kind === "clear"
        ? "新建会替换当前工作台，建议先导出。继续吗？"
        : "载入示例会替换当前工作台，继续吗？",
    )
  ) {
    if (kind === "clear") emit("clear");
    else emit("sample");
  }
}
function switchMode() {
  const next: LabMode = props.mode === "timing" ? "combinational" : "timing";
  if (
    window.confirm(
      next === "timing"
        ? "切换到时序实验将清空当前工作台并载入两级流水示例，继续吗？"
        : "切换到组合逻辑将清空时序元件，继续吗？",
    )
  )
    emit("switch-mode", next);
}
</script>
<template>
  <div class="workspace-bar">
    <div class="document-name">
      <input
        :value="props.name"
        aria-label="实验名称"
        maxlength="80"
        @change="
          emit(
            'rename',
            ($event.target as HTMLInputElement).value.trim() || '未命名实验',
          )
        "
      /><span class="save-status">● {{ status }}</span>
    </div>
    <div class="workspace-actions">
      <button class="mode-button" @click="switchMode">
        {{ mode === "timing" ? "切换到组合逻辑" : "切换到时序实验" }}
      </button>
      <button @click="replace('sample')">载入示例</button
      ><button @click="replace('clear')">新建</button
      ><button @click="emit('save')">保存</button
      ><button @click="input?.click()">导入</button
      ><button class="export-button" @click="emit('export')">导出电路 ↓</button
      ><button
        v-if="mode === 'timing'"
        class="export-button trace"
        @click="emit('export-trace')"
        >导出轨迹 ↓</button
      ><input
        ref="input"
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="导入实验文件"
        @change="upload"
      />
    </div>
  </div>
</template>

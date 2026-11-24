<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { CatalogPanel } from "@/features/catalog";
import { CircuitBoard } from "@/features/circuit";
import { InputRack, SignalMonitor } from "@/features/simulation";
import { ChallengePanel } from "@/features/challenge";
import { WorkspaceBar } from "@/features/workspace";
import { TimingPanel, TracePanel } from "@/features/timing";
import { useLab } from "./useLab";
const lab = useLab();
const { document, notice } = lab;
const { tool } = lab.placement,
  { selected, pending } = lab.circuit;
const isTiming = computed(() => document.value.mode === "timing");
const signals = computed(() =>
  isTiming.value ? lab.timing.signals.value : lab.simulation.signals.value,
);
const { target, table, passed, inspected, hint } = lab.challenge;
const { status } = lab.workspace;
const selectedNode = computed(() =>
  document.value.nodes.find((node) => node.id === selected.value),
);
function keydown(event: KeyboardEvent) {
  if ((event.target as HTMLElement).closest("input,textarea,select")) return;
  if (event.key === "Escape") lab.cancel();
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    lab.circuit.deleteSelected();
  }
  if (isTiming.value && event.key === " " && !event.repeat) {
    event.preventDefault();
    lab.timing.step();
  }
}
onMounted(() => window.addEventListener("keydown", keydown));
onUnmounted(() => window.removeEventListener("keydown", keydown));
</script>
<template>
  <div class="lab-app" :class="{ 'timing-mode': isTiming }">
    <header class="masthead">
      <div class="brand">
        <span class="brand-icon">⌘</span>
        <div>
          <h1>LOGIC <em>LAB</em><span>数字电路逻辑实验室</span></h1>
          <p>把逻辑，连接起来。</p>
        </div>
      </div>
      <div class="instrument-label">
        <span class="power-light" :class="{ clocking: isTiming }" />
        {{ isTiming ? "时序流水模式" : "组合逻辑模式" }}
        <small>BENCH / JDK–028</small>
      </div>
    </header>
    <WorkspaceBar
      :name="document.name"
      :status="status"
      :mode="document.mode"
      @rename="document.name = $event"
      @sample="lab.workspace.sample"
      @clear="lab.workspace.clear"
      @save="lab.workspace.save"
      @export="lab.workspace.exportFile"
      @export-trace="lab.workspace.exportTraceFile"
      @import="lab.workspace.importText"
      @switch-mode="lab.switchMode"
      @error="lab.notify({ tone: 'error', message: $event })"
    />
    <main class="workbench">
      <CatalogPanel :tool="tool" :mode="document.mode" @choose="
          tool = $event;
          pending = null;
        " />
      <section class="center-workspace">
        <div class="board-toolbar">
          <span>
            <b>工作台</b>
            <small>{{
              isTiming ? "单比特 · 边沿触发 · 逐级移动" : "单比特 · 即时传播"
            }}</small>
          </span>
          <div>
            <button :disabled="!selected" aria-label="删除所选" @click="lab.circuit.deleteSelected">
              删除所选</button
            ><button :disabled="!pending && !tool" @click="lab.cancel">
              取消 / Esc
            </button>
          </div>
        </div>
        <div class="mode-strip" v-if="tool || pending">
          {{ tool ? `点击网格放置 ${tool}` : "已选择输出，请点击目标输入端口"
          }}<button @click="lab.cancel">取消</button>
        </div>
        <CircuitBoard
          :document="document"
          :signals="signals"
          :selected="selected"
          :pending="pending"
          :tool="tool"
          :mode="document.mode"
          @place="lab.place"
          @move="lab.move"
          @select="selected = $event"
          @port="lab.circuit.pickPort"
          @toggle="lab.toggle"
        />
        <div class="selection-strip">
          <template v-if="selectedNode"
            ><label
              >元件名称
              <input
                :key="selectedNode.id"
                :value="selectedNode.label"
                maxlength="40"
                aria-label="所选元件名称"
                @change="
                  lab.renameNode(($event.target as HTMLInputElement).value)
                " /></label
            ><span
              >{{ selectedNode.kind }} · 拖动移动 · Delete 删除</span
            ></template
          ><span v-else>{{
            selected
              ? "已选择连线，按 Delete 或点击“删除所选”断开。"
              : "拖动元件移动位置 · 点击端口连接 · Esc 取消"
          }}</span
          ><span class="grid-label">GRID 20</span>
        </div>
        <div class="instruments" :class="{ 'timing-instruments': isTiming }">
          <InputRack
            :nodes="document.nodes"
            :signals="signals"
            @toggle="lab.toggle"
          />
          <SignalMonitor
            v-if="!isTiming"
            :document="document"
            :signals="signals"
            :selected="selected"
          />
          <TimingPanel v-else :document="document" :timing="lab.timing" />
        </div>
        <TracePanel v-if="isTiming" :document="document" :timing="lab.timing" />
      </section>
      <ChallengePanel
        v-if="!isTiming"
        :document="document"
        :target="target"
        :table="table"
        :passed="passed"
        :inspected="inspected"
        :hint="hint"
        @choose="lab.challenge.choose"
        @check="inspected = true"
        @hint="hint = !hint"
      />
      <aside v-else class="timing-guide panel">
        <div class="panel-heading"><span>时序实验指引</span><small>GUIDE</small></div>
        <ol class="guide-list">
          <li>放置周期时钟、异步复位源与两个上升沿 D 寄存器，搭成两级流水。</li>
          <li>同一上升沿上，两个寄存器同时读取边沿前的数据，数据不会一拍穿过两级。</li>
          <li>调节建立/保持时间，让激励落在采样窗口（含边界）内，观察违例与 X 输出。</li>
          <li>按下异步复位会立即清零并中断窗口；释放复位不产生采样边沿。</li>
          <li>寄存器反馈允许存在；纯组合反馈会被标出并置为未知。</li>
          <li>暂停后改接线会重建初态；保存时电路配置与录制轨迹分开存储。</li>
        </ol>
        <div class="guide-tip">
          <b>快捷键</b>
          <p>空格键 = 单步一个时钟周期；Esc = 取消放置/连线。</p>
        </div>
      </aside>
    </main>
    <footer class="status-bar" :class="notice.tone" role="status">
      <span
        >{{
          notice.tone === "error" ? "!" : notice.tone === "success" ? "✓" : "●"
        }}
        {{ notice.message }}</span
      ><small>LOCAL LAB / 纯前端实验</small>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { CircuitDocument, TimingParams } from "@/shared/types";
import type { useTiming } from "../model/useTiming";
const props = defineProps<{
  document: CircuitDocument;
  timing: ReturnType<typeof useTiming>;
}>();
const inputs = computed(() =>
  props.document.nodes.filter((n) => n.kind === "INPUT"),
);
const resetNodes = computed(() =>
  props.document.nodes.filter((n) => n.kind === "RESET"),
);
const clocks = computed(() =>
  props.document.nodes.filter((n) => n.kind === "CLOCK"),
);
const dffs = computed(() =>
  props.document.nodes.filter((n) => n.kind === "DFF"),
);
const localSetup = ref(String(props.timing.params.value.setup));
const localHold = ref(String(props.timing.params.value.hold));
const localOffset = ref(String(props.timing.params.value.stimulusOffset));
watch(
  () => props.timing.params.value,
  (p) => {
    localSetup.value = String(p.setup);
    localHold.value = String(p.hold);
    localOffset.value = String(p.stimulusOffset);
  },
);
function commit(field: keyof TimingParams, raw: string) {
  const value = Number(raw);
  if (Number.isFinite(value))
    props.timing.updateParams({ [field]: Math.max(0, value) });
}
const PLAN_LEN = 8;
const plans = ref<Record<string, (0 | 1)[]>>({});
watch(
  inputs,
  (list) => {
    for (const node of list) {
      if (!plans.value[node.id]) {
        const existing = props.timing.getPlan(node.id);
        plans.value[node.id] = Array.from(
          { length: PLAN_LEN },
          (_, i) => existing[i] ?? node.value,
        );
      }
    }
  },
  { immediate: true },
);
function flip(nodeId: string, index: number) {
  const row = [...(plans.value[nodeId] ?? [])];
  row[index] = row[index] === 1 ? 0 : 1;
  plans.value[nodeId] = row;
  props.timing.setPlan(nodeId, row);
}
const hasClock = computed(() => clocks.value.length > 0);
</script>
<template>
  <section class="timing-panel">
    <div class="timing-block clock-block">
      <div class="panel-heading"><span>周期时钟 · 手动单步</span><small>CLOCK</small></div>
      <p class="panel-help">
        每次单步让所有时钟同时产生一个上升沿；同一沿上的全部寄存器读取边沿前的数据，数据每拍只前进一级。
      </p>
      <div class="clock-controls">
        <button class="primary step-button" :disabled="!hasClock" @click="timing.step()">
          单步一个时钟周期 ↥
        </button>
        <button
          v-for="rst in resetNodes"
          :key="rst.id"
          :class="['reset-button', { asserted: rst.value === 1 }]"
          @click="timing.driveReset(rst.id, rst.value === 1 ? 0 : 1)"
        >
          {{ rst.value === 1 ? `释放 ${rst.label}` : `按下 ${rst.label}` }}
        </button>
      </div>
      <div class="cycle-readout">
        <span>当前周期 <b>{{ timing.cycle.value }}</b></span>
        <span v-if="!hasClock" class="warn-text">请先放置一个周期时钟</span>
        <span v-else-if="!dffs.length" class="warn-text">尚未放置 D 寄存器</span>
      </div>
      <ul v-if="timing.pending.value.length" class="pending-list">
        <li v-for="(evt, i) in timing.pending.value" :key="i">
          下一个上升沿 <b>t={{ evt.time >= 0 ? "+" : "" }}{{ evt.time }}</b>
          时，{{ document.nodes.find((n) => n.id === evt.nodeId)?.label }}
          → <b>{{ evt.value }}</b>
        </li>
      </ul>
    </div>

    <div class="timing-block">
      <div class="panel-heading"><span>建立 / 保持时间</span><small>TIMING</small></div>
      <div class="timing-fields">
        <label>
          建立 t<sub>su</sub>
          <input
            type="number"
            min="0"
            max="20"
            :value="localSetup"
            @change="commit('setup', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label>
          保持 t<sub>h</sub>
          <input
            type="number"
            min="0"
            max="20"
            :value="localHold"
            @change="commit('hold', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label>
          激励提前量
          <input
            type="number"
            min="0"
            max="20"
            :value="localOffset"
            @change="commit('stimulusOffset', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
      <p class="small-note">
        采样窗口为闭区间 [-t<sub>su</sub>, +t<sub>h</sub>]，数据在窗口内（含边界）变化即标记违例，受影响采样变为 X。
      </p>
    </div>

    <div class="timing-block">
      <div class="panel-heading"><span>逐拍输入激励</span><small>STIMULUS</small></div>
      <p v-if="!inputs.length" class="panel-help">放置输入开关后，可在此编排每一拍的激励。</p>
      <table v-else class="stimulus-table">
        <thead>
          <tr>
            <th>输入</th>
            <th v-for="i in PLAN_LEN" :key="i">拍{{ i }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="node in inputs" :key="node.id">
            <th>{{ node.label }}</th>
            <td v-for="i in PLAN_LEN" :key="i">
              <button
                :class="['cell-bit', plans[node.id]?.[i - 1] === 1 ? 'bit-on' : 'bit-off']"
                @click="flip(node.id, i - 1)"
              >
                {{ plans[node.id]?.[i - 1] ?? 0 }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="small-note">
        激励在上升沿前「激励提前量」个时间单位施加；把提前量调到 ≤ 建立时间即可复现建立违例。
      </p>
    </div>

    <div v-if="timing.loopWarning.value.length" class="timing-block loop-alert" role="alert">
      <b>检测到纯组合反馈环</b>
      <p>
        环路上的电平无法稳定，相关信号已置为 X。请断开组合环，或让反馈经过 D 寄存器（寄存器反馈是允许的）。
      </p>
    </div>
  </section>
</template>

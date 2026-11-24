<script setup lang="ts">
import { computed } from "vue";
import type { CircuitDocument } from "@/shared/types";
import type { TraceStep } from "../lib/types";
import type { useTiming } from "../model/useTiming";
const props = defineProps<{
  document: CircuitDocument;
  timing: ReturnType<typeof useTiming>;
}>();
const tracked = computed(() =>
  props.document.nodes.filter(
    (n) => n.kind === "DFF" || n.kind === "OUTPUT" || n.kind === "INPUT",
  ),
);
const kindName: Record<string, string> = {
  edge: "时钟沿",
  "reset-on": "异步复位",
  "reset-off": "释放复位",
  rebuild: "重建初态",
  stimulus: "激励",
};
function valueAt(stepIndex: number, nodeId: string) {
  const step = props.timing.trace.value[stepIndex];
  return step?.outputs?.[nodeId] ?? "X";
}
function isViolated(step: TraceStep, nodeId: string) {
  return step.violations.includes(nodeId);
}
function violationKind(step: TraceStep): string {
  const kinds = new Set(
    Object.values(step.samples)
      .map((s) => s.violation)
      .filter((v): v is "setup" | "hold" => v !== null),
  );
  if (kinds.has("setup") && kinds.has("hold")) return "建立+保持违例";
  if (kinds.has("setup")) return "建立违例";
  return "保持违例";
}
</script>
<template>
  <section class="trace-panel">
    <div class="panel-heading"><span>状态轨迹</span><small>WAVE TRACE</small></div>
    <p v-if="!timing.trace.value.length" class="panel-help">
      尚无录制内容：单步时钟、按下复位或重建电路后，每一拍的状态会记录在这里。
    </p>
    <div v-else class="trace-scroll">
      <table class="trace-table">
        <thead>
          <tr>
            <th>拍</th>
            <th>动作</th>
            <th v-for="node in tracked" :key="node.id">
              {{ node.label }}
              <small>{{ node.kind === "DFF" ? ".Q" : "" }}</small>
            </th>
            <th>违例</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(step, index) in timing.trace.value"
            :key="index"
            :class="{ 'row-violation': step.violations.length }"
          >
            <td>{{ step.cycle }}</td>
            <td class="kind-cell">{{ kindName[step.kind] }}</td>
            <td v-for="node in tracked" :key="node.id">
              <span
                :class="[
                  'trace-bit',
                  `text-${valueAt(index, node.id)}`,
                  { violated: isViolated(step, node.id) },
                ]"
                >{{ valueAt(index, node.id) }}</span
              >
            </td>
            <td>
              <span v-if="step.violations.length" class="violation-pill">
                {{
                  step.violations
                    .map((id) => document.nodes.find((n) => n.id === id)?.label)
                    .join("、")
                }}
                {{ violationKind(step) }}
              </span>
              <span v-else class="ok-pill">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ul class="trace-notes">
      <li
        v-for="(step, index) in timing.trace.value.filter((s) => s.note)"
        :key="`n${index}`"
        class="trace-note"
        :class="{ bad: step.violations.length }"
      >
        <b>拍{{ step.cycle }}</b
        >：{{ step.note }}
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { GateNode, SimulationResult } from "@/shared/types";
const props = defineProps<{ nodes: GateNode[]; signals: SimulationResult }>();
defineEmits<{ toggle: [id: string] }>();
const rackNodes = computed(() =>
  props.nodes.filter(
    (n) => n.kind === "INPUT" || n.kind === "CLOCK" || n.kind === "RESET",
  ),
);
const tag: Record<string, string> = {
  INPUT: "激励",
  CLOCK: "时钟",
  RESET: "复位",
};
</script>
<template>
  <div class="input-rack">
    <div class="panel-heading">
      <span>信号源控制</span><small>LIVE INPUTS</small>
    </div>
    <div class="rack-switches">
      <button
        v-for="node in rackNodes"
        :key="node.id"
        :class="[
          'rack-switch',
          { on: signals.values[node.id] === 1, disabled: node.kind === 'CLOCK' },
        ]"
        :aria-label="`切换 ${node.label}`"
        :aria-pressed="signals.values[node.id] === 1"
        @click="node.kind === 'CLOCK' ? null : $emit('toggle', node.id)"
      >
        <span>{{ node.label }} <i class="rack-tag">{{ tag[node.kind] }}</i></span
        ><i /><b>{{ signals.values[node.id] }}</b></button
      ><span v-if="!rackNodes.length" class="panel-help"
        >放置一个输入开关以发送信号。</span
      >
    </div>
    <p v-if="rackNodes.some((n) => n.kind === 'CLOCK')" class="small-note">
      时钟由「单步一个时钟周期」驱动，不能手动拨动；输入与复位在暂停态操作并记录时刻。
    </p>
  </div>
</template>

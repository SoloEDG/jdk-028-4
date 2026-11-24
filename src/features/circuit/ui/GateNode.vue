<script setup lang="ts">
import { computed } from "vue";
import type { GateNode, Signal } from "@/shared/types";
import type { PortRequest } from "@/shared/commands";
import { getSpec, DFF_PORTS } from "@/features/catalog";
import { BOARD, portPoint } from "../lib/geometry";
const props = defineProps<{
  node: GateNode;
  value: Signal;
  selected: boolean;
  pending: boolean;
  violated?: boolean;
}>();
const emit = defineEmits<{
  select: [id: string];
  startDrag: [event: PointerEvent, id: string];
  port: [port: PortRequest];
  toggle: [id: string];
}>();
const spec = computed(() => getSpec(props.node.kind));
const portNames = computed<Record<number, string>>(() => {
  if (props.node.kind === "DFF")
    return {
      [DFF_PORTS.D]: "D",
      [DFF_PORTS.CLK]: "CLK",
      [DFF_PORTS.RST]: "RST",
    } as Record<number, string>;
  return {} as Record<number, string>;
});
</script>
<template>
  <g
    class="gate-node"
    :class="{
      'is-selected': selected,
      'is-violated': violated,
      'is-timing': spec.timingOnly,
    }"
    :data-node="node.id"
    role="group"
    tabindex="0"
    :aria-label="node.label"
    @keydown.enter.self="emit('select', node.id)"
    ><rect
      :x="node.x"
      :y="node.y"
      :width="BOARD.nodeWidth"
      :height="BOARD.nodeHeight"
      rx="10"
      class="node-body"
      @pointerdown.stop="emit('startDrag', $event, node.id)" /><text
      :x="node.x + 12"
      :y="node.y + 21"
      class="node-label"
      pointer-events="none"
      >{{ node.label }}</text
    >
    <text
      v-if="node.kind !== 'DFF'"
      :x="node.x + 56"
      :y="node.y + 57"
      class="node-symbol"
      pointer-events="none"
      >{{ spec.symbol }}</text
    >
    <g v-else class="dff-symbol" pointer-events="none">
      <text :x="node.x + 14" :y="node.y + 44" class="dff-port-name">D</text>
      <text :x="node.x + 14" :y="node.y + 62" class="dff-port-name">CLK</text>
      <text :x="node.x + 14" :y="node.y + 79" class="dff-port-name">RST</text>
      <text :x="node.x + 92" :y="node.y + 52" class="dff-q">Q</text>
      <text :x="node.x + 64" :y="node.y + 52" class="dff-state" :class="`text-${value}`">{{
        value
      }}</text>
    </g>
    <g
      v-if="node.kind === 'INPUT' || node.kind === 'RESET'"
      role="button"
      tabindex="0"
      :aria-label="`切换 ${node.label}，当前 ${value}`"
      @pointerdown.stop
      @click.stop="emit('toggle', node.id)"
      @keydown.enter.prevent="emit('toggle', node.id)"
      @keydown.space.prevent="emit('toggle', node.id)"
      ><rect
        :x="node.x + 74"
        :y="node.y + 42"
        width="27"
        height="28"
        rx="6"
        :class="`switch signal-${value}`"
      /><text :x="node.x + 87" :y="node.y + 61" class="switch-text">{{
        value
      }}</text></g
    >
    <g v-if="node.kind === 'CLOCK'"
      ><rect
        :x="node.x + 70"
        :y="node.y + 42"
        width="34"
        height="28"
        rx="6"
        :class="`clock-led signal-${value}`"
      /><text :x="node.x + 87" :y="node.y + 61" class="switch-text">{{
        value
      }}</text></g
    >
    <g v-if="node.kind === 'OUTPUT'"
      ><circle
        :cx="node.x + 88"
        :cy="node.y + 52"
        r="11"
        :class="`output-led signal-${value}`"
      /><text :x="node.x + 88" :y="node.y + 57" class="led-text">{{
        value
      }}</text></g
    >
    <g
      v-for="port in spec.inputs"
      :key="`in${port}`"
    ><circle
      :cx="portPoint(node, 'input', port - 1).x"
      :cy="portPoint(node, 'input', port - 1).y"
      r="7"
      class="port input-port"
      :class="{ 'port-reset': node.kind === 'DFF' && port - 1 === DFF_PORTS.RST }"
      role="button"
      tabindex="0"
      :aria-label="`${node.label} 输入 ${portNames[port - 1] ?? port}`"
      @pointerdown.stop
      @click.stop="
        emit('port', { nodeId: node.id, port: port - 1, direction: 'input' })
      "
      @keydown.enter="
        emit('port', { nodeId: node.id, port: port - 1, direction: 'input' })
      " />
      <text
        v-if="node.kind === 'DFF'"
        :x="portPoint(node, 'input', port - 1).x + 10"
        :y="portPoint(node, 'input', port - 1).y + 3"
        class="port-tag"
        pointer-events="none"
        >{{ portNames[port - 1] }}</text
      ></g
    ><circle
      v-if="spec.outputs"
      :cx="portPoint(node, 'output').x"
      :cy="portPoint(node, 'output').y"
      r="7"
      :class="['port', `signal-${value}`, { 'port-pending': pending }]"
      role="button"
      tabindex="0"
      :aria-label="`${node.label} 输出端口`"
      @pointerdown.stop
      @click.stop="
        emit('port', { nodeId: node.id, port: 0, direction: 'output' })
      "
      @keydown.enter="
        emit('port', { nodeId: node.id, port: 0, direction: 'output' })
      "
  /></g>
</template>

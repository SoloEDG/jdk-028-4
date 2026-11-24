import { computed, ref, shallowRef, watch, type Ref } from "vue";
import type { CircuitDocument, SimulationResult, TimingParams } from "@/shared/types";
import { TimingEngine } from "../lib/engine";
import { DEFAULT_TIMING, clampTiming, type TraceStep } from "../lib/types";
export interface StimulusRow {
  nodeId: string;
  label: string;
  /** 每个元素是一拍的值，长度不足表示后续保持。 */
  values: (0 | 1)[];
}
export function useTiming(document: Ref<CircuitDocument>) {
  if (!document.value.timing) document.value.timing = { ...DEFAULT_TIMING };
  const engine = shallowRef(new TimingEngine(document.value));
  const tick = ref(0);
  const refresh = () => {
    tick.value += 1;
  };
  const structuralKey = computed(() => {
    const d = document.value;
    return JSON.stringify([
      d.nodes.map((n) => `${n.id}:${n.kind}`),
      d.wires.map((w) => `${w.from.nodeId}.${w.from.port}->${w.to.nodeId}.${w.to.port}`),
    ]);
  });
  // 接线/元件变化（非开关值变化）后，必须重建实验初态。
  watch(structuralKey, () => {
    engine.value.rebuild(true);
    refresh();
  });
  const signals = computed<SimulationResult>(() => {
    void tick.value;
    return engine.value.snapshot();
  });
  const trace = computed<TraceStep[]>(() => {
    void tick.value;
    return engine.value.trace;
  });
  const cycle = computed(() => {
    void tick.value;
    return engine.value.cycle;
  });
  const loopWarning = computed(() => {
    void tick.value;
    return engine.value.combinationalLoops;
  });
  const params = computed<TimingParams>(() => document.value.timing ?? DEFAULT_TIMING);
  function updateParams(patch: Partial<TimingParams>) {
    const current = document.value.timing ?? { ...DEFAULT_TIMING };
    document.value.timing = {
      setup: clampTiming(patch.setup ?? current.setup),
      hold: clampTiming(patch.hold ?? current.hold),
      stimulusOffset: clampTiming(patch.stimulusOffset ?? current.stimulusOffset),
    };
    refresh();
  }
  function step() {
    engine.value.step();
    refresh();
  }
  function forceReset() {
    engine.value.forceReset();
    refresh();
  }
  function driveReset(nodeId: string, value: 0 | 1) {
    engine.value.driveReset(nodeId, value);
    refresh();
  }
  /** 暂停态切换输入/复位，按当前激励偏移记录施加时刻。 */
  function toggleSource(nodeId: string) {
    const node = document.value.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.kind === "RESET") {
      driveReset(nodeId, node.value === 0 ? 1 : 0);
      return;
    }
    const time = 0 - params.value.stimulusOffset;
    engine.value.toggleSource(nodeId, time);
    refresh();
  }
  function setPlan(nodeId: string, values: (0 | 1)[]) {
    engine.value.setPlan(nodeId, values);
    refresh();
  }
  function getPlan(nodeId: string) {
    return engine.value.getPlan(nodeId);
  }
  function rebuild() {
    engine.value.rebuild(true);
    refresh();
  }
  function exportTrace() {
    return engine.value.exportTrace();
  }
  const pending = computed(() => {
    void tick.value;
    return engine.value.pendingEvents();
  });
  return {
    engine,
    signals,
    trace,
    cycle,
    loopWarning,
    params,
    pending,
    updateParams,
    step,
    forceReset,
    driveReset,
    toggleSource,
    setPlan,
    getPlan,
    rebuild,
    exportTrace,
    refresh,
  };
}

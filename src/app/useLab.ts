import { ref, watch } from "vue";
import type { Notice } from "@/shared/commands";
import type { CircuitDocument, Point } from "@/shared/types";
import { usePlacement } from "@/features/catalog";
import { useCircuit, modeAllowsKind } from "@/features/circuit";
import { useSimulation } from "@/features/simulation";
import { useChallenge } from "@/features/challenge";
import { loadInitial, useWorkspace } from "@/features/workspace";
import { useTiming, pipelineCircuit } from "@/features/timing";
import { emptyCircuit } from "@/features/workspace/lib/seeds";
export function useLab() {
  const initial = loadInitial(),
    document = ref(initial.document);
  const notice = ref<Notice>({
    tone: initial.warning ? "error" : "info",
    message: initial.warning ?? "示例已就绪。切换输入，观察信号如何到达输出。",
  });
  const notify = (next: Notice) => {
    notice.value = next;
  };
  const placement = usePlacement();
  const circuit = useCircuit(document, notify);
  const simulation = useSimulation(document);
  const challenge = useChallenge(document);
  const timing = useTiming(document);
  const isTiming = () => document.value.mode === "timing";
  const workspace = useWorkspace(
    document,
    notify,
    () => {
      circuit.resetSelection();
      challenge.reset();
      placement.tool.value = null;
      timing.rebuild();
    },
    { exportTrace: () => timing.exportTrace() },
  );
  // 暂停后改接线：时序引擎的结构 watcher 负责重建初态，这里只负责提示。
  watch(
    () => structuralSignature(document.value),
    () => {
      if (!isTiming()) return;
      // 结构 watcher 的回调顺序不保证，这里依据引擎是否仍保留边沿轨迹判断；
      // 即使引擎已先重建，重建动作本身也会写入 rebuild 轨迹行。
      if (timing.trace.value.some((s) => s.kind === "edge" || s.kind === "rebuild"))
        notify({
          tone: "info",
          message: "检测到接线变化，已重新建立实验初态并清空已录制轨迹。",
        });
    },
  );
  function structuralSignature(d: CircuitDocument) {
    return [
      d.nodes.map((n) => `${n.id}:${n.kind}`).join(","),
      d.wires.map((w) => w.id).join(","),
    ].join("|");
  }
  function place(point: Point) {
    if (!placement.tool.value) return;
    if (!modeAllowsKind(document.value.mode, placement.tool.value)) {
      notify({
        tone: "error",
        message: "该元件属于另一实验模式，请切换模式后再放置。",
      });
      return;
    }
    if (document.value.nodes.length >= 120) {
      notify({
        tone: "error",
        message: "最多支持 120 个元件，请先删除不用的元件",
      });
      return;
    }
    const node = placement.createNode(
      document.value,
      placement.tool.value,
      point,
    );
    document.value.nodes.push(node);
    circuit.selected.value = node.id;
    placement.tool.value = null;
    notify({
      tone: "success",
      message: `已放置 ${node.label}，点击端口开始连线`,
    });
  }
  function move(id: string, point: Point) {
    const node = document.value.nodes.find((n) => n.id === id);
    if (node) {
      node.x = point.x;
      node.y = point.y;
    }
  }
  function cancel() {
    circuit.pending.value = null;
    placement.tool.value = null;
    notify({ tone: "info", message: "已取消当前放置或连线" });
  }
  function renameNode(label: string) {
    const node = document.value.nodes.find(
      (n) => n.id === circuit.selected.value,
    );
    if (node) node.label = label.trim().slice(0, 40) || node.kind;
  }
  /** 统一的输入/复位切换入口：时序模式记录带时刻的激励。 */
  function toggle(id: string) {
    if (isTiming()) {
      timing.toggleSource(id);
      const node = document.value.nodes.find((n) => n.id === id);
      notify({
        tone: "info",
        message:
          node?.kind === "RESET"
            ? "异步复位立即作用；释放复位不会产生采样边沿。"
            : `激励已加入下一个上升沿前的队列，单步时钟即可观察。`,
      });
      return;
    }
    simulation.toggle(id);
  }
  function switchMode(mode: "combinational" | "timing") {
    document.value =
      mode === "timing" ? pipelineCircuit() : emptyCircuit("combinational");
    circuit.resetSelection();
    challenge.reset();
    placement.tool.value = null;
    timing.rebuild();
    notify({
      tone: "success",
      message:
        mode === "timing"
          ? "已进入时序实验：单步时钟，观察数据在两级寄存器间逐级移动。"
          : "已进入组合逻辑模式：信号即时传播。",
    });
  }
  return {
    document,
    notice,
    notify,
    placement,
    circuit,
    simulation,
    challenge,
    workspace,
    timing,
    place,
    move,
    cancel,
    renameNode,
    toggle,
    switchMode,
  };
}

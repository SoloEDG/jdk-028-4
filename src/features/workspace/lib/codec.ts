import type {
  CircuitDocument,
  GateNode,
  TimingParams,
  Wire,
} from "@/shared/types";
import { getSpec } from "@/features/catalog/lib/specs";
import {
  analyzeGraph,
  topologicalOrder,
} from "@/features/circuit/lib/graph";
import { DEFAULT_TIMING } from "@/features/timing/lib/types";
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
function decodeTiming(value: unknown): TimingParams | undefined {
  if (value === undefined) return undefined;
  if (!object(value)) throw new Error("时序参数无效");
  const num = (key: string, fallback: number) => {
    const v = value[key];
    if (v === undefined) return fallback;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 20)
      throw new Error(`时序参数 ${key} 无效`);
    return Math.round(v);
  };
  return {
    setup: num("setup", DEFAULT_TIMING.setup),
    hold: num("hold", DEFAULT_TIMING.hold),
    stimulusOffset: num("stimulusOffset", DEFAULT_TIMING.stimulusOffset),
  };
}
export function decodeDocument(text: string): CircuitDocument {
  if (text.length > 2_000_000)
    throw new Error("实验文件超过 2 MB，请缩小后再导入");
  const data: unknown = JSON.parse(text);
  if (
    !object(data) ||
    data.version !== 1 ||
    typeof data.name !== "string" ||
    data.name.length > 80 ||
    !["xor", "and", "or"].includes(String(data.targetId)) ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.wires)
  )
    throw new Error("文件格式或版本不受支持");
  // 兼容旧版存档：缺省按组合模式处理。
  const mode = data.mode === "timing" ? "timing" : "combinational";
  if (data.nodes.length > 120 || data.wires.length > 480)
    throw new Error("实验最多支持 120 个元件、480 条连线");
  const ids = new Set<string>();
  const nodes: GateNode[] = data.nodes.map((value) => {
    if (
      !object(value) ||
      typeof value.id !== "string" ||
      !value.id ||
      value.id.length > 100 ||
      ids.has(value.id) ||
      typeof value.kind !== "string" ||
      typeof value.label !== "string" ||
      value.label.length > 40 ||
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y) ||
      (value.value !== 0 && value.value !== 1)
    )
      throw new Error("元件内容无效或编号重复");
    const spec = getSpec(value.kind);
    if (mode === "combinational" && spec.timingOnly)
      throw new Error("该文件含时序元件，请切换到时序实验模式再导入");
    ids.add(value.id);
    if (
      Number(value.x) < 20 ||
      Number(value.x) > 880 ||
      Number(value.y) < 40 ||
      Number(value.y) > 420
    )
      throw new Error("元件坐标超出工作台范围");
    return {
      id: value.id,
      kind: spec.kind,
      label: value.label,
      x: Number(value.x),
      y: Number(value.y),
      value: value.value,
    };
  });
  const wireIds = new Set<string>(),
    occupied = new Set<string>();
  const wires: Wire[] = data.wires.map((value) => {
    if (
      !object(value) ||
      typeof value.id !== "string" ||
      !value.id ||
      ids.has(value.id) ||
      wireIds.has(value.id) ||
      !object(value.from) ||
      !object(value.to)
    )
      throw new Error("连线内容无效或编号重复");
    const fromId = value.from.nodeId,
      toId = value.to.nodeId;
    const from = nodes.find((n) => n.id === fromId),
      to = nodes.find((n) => n.id === toId);
    const fp = value.from.port,
      tp = value.to.port;
    if (
      !from ||
      !to ||
      from === to ||
      !Number.isInteger(fp) ||
      !Number.isInteger(tp) ||
      Number(fp) < 0 ||
      Number(fp) >= getSpec(from.kind).outputs ||
      Number(tp) < 0 ||
      Number(tp) >= getSpec(to.kind).inputs
    )
      throw new Error("连线引用了无效端口");
    const key = `${to.id}:${tp}`;
    if (occupied.has(key)) throw new Error("同一输入端口不能连接两个输出");
    occupied.add(key);
    wireIds.add(value.id);
    return {
      id: value.id,
      from: { nodeId: from.id, port: Number(fp) },
      to: { nodeId: to.id, port: Number(tp) },
    };
  });
  const document: CircuitDocument = {
    version: 1,
    name: data.name,
    targetId: String(data.targetId),
    mode,
    timing: mode === "timing" ? decodeTiming(data.timing) : undefined,
    nodes,
    wires,
  };
  if (mode === "timing") {
    const { combinationalLoops } = analyzeGraph(document);
    if (combinationalLoops.length)
      throw new Error("文件含纯组合反馈环，请先断开后再导入");
  } else {
    topologicalOrder(document);
  }
  return document;
}
/** 仅编码电路配置（不含已录制轨迹），便于在不同实验间复用接线。 */
export function encodeDocument(document: CircuitDocument): string {
  return JSON.stringify(document, null, 2);
}
/** 轨迹文件与电路配置分开保存，避免恢复接线时误覆盖实验记录。 */
export function encodeTrace(trace: unknown): string {
  return JSON.stringify(trace, null, 2);
}
export function decodeTraceKind(text: string): "trace" | "circuit" | null {
  try {
    const data = JSON.parse(text) as unknown;
    if (!object(data)) return null;
    if (data.kind === "logic-lab-trace") return "trace";
    if (data.version === 1 && Array.isArray(data.nodes)) return "circuit";
    return null;
  } catch {
    return null;
  }
}

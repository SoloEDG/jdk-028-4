import type { CircuitDocument, GateNode } from "@/shared/types";
import { DFF_PORTS, getSpec } from "@/features/catalog/lib/specs";
function isClockPin(document: CircuitDocument, nodeId: string, port: number): boolean {
  const node = document.nodes.find((item) => item.id === nodeId);
  return !!node && node.kind === "DFF" && port === DFF_PORTS.CLK;
}
function isResetPin(document: CircuitDocument, nodeId: string, port: number): boolean {
  const node = document.nodes.find((item) => nodeId === item.id);
  return !!node && node.kind === "DFF" && port === DFF_PORTS.RST;
}
/**
 * 时序模式下，进入寄存器 D 端口的连线会切断组合环路（状态在边沿更新）；
 * 时钟/复位是控制信号，同样不参与组合求值排序。
 */
function edgeBreaksCycle(document: CircuitDocument, wire: {
  from: { nodeId: string };
  to: { nodeId: string; port: number };
}): boolean {
  const target = document.nodes.find((n) => n.id === wire.to.nodeId);
  if (!target) return false;
  if (target.kind !== "DFF") return false;
  return (
    wire.to.port === DFF_PORTS.D ||
    isClockPin(document, wire.to.nodeId, wire.to.port) ||
    isResetPin(document, wire.to.nodeId, wire.to.port)
  );
}
export interface GraphAnalysis {
  /** 可用于组合求值的节点顺序（寄存器作为状态源，不参与求值）。 */
  order: string[];
  /** 纯组合反馈环，环上不经过任何寄存器。 */
  combinationalLoops: string[][];
}
export function analyzeGraph(document: CircuitDocument): GraphAnalysis {
  const nodes = new Map(document.nodes.map((node) => [node.id, node]));
  const activeWires = document.wires.filter(
    (wire) => nodes.has(wire.from.nodeId) && nodes.has(wire.to.nodeId),
  );
  const combinationalWires = activeWires.filter(
    (wire) => !edgeBreaksCycle(document, wire),
  );
  const degrees = new Map(document.nodes.map((node) => [node.id, 0]));
  const next = new Map(
    document.nodes.map((node) => [node.id, [] as string[]]),
  );
  for (const wire of combinationalWires) {
    degrees.set(wire.to.nodeId, degrees.get(wire.to.nodeId)! + 1);
    next.get(wire.from.nodeId)!.push(wire.to.nodeId);
  }
  const queue = [...degrees]
    .filter(([, count]) => count === 0)
    .map(([id]) => id);
  for (let i = 0; i < queue.length; i++)
    for (const id of next.get(queue[i])!) {
      degrees.set(id, degrees.get(id)! - 1);
      if (degrees.get(id) === 0) queue.push(id);
    }
  const settled = new Set(queue);
  const loops: string[][] = [];
  if (queue.length !== document.nodes.length) {
    // 对残留节点做 DFS，找出每条纯组合反馈环。
    const remaining = new Set(
      document.nodes.map((node) => node.id).filter((id) => !settled.has(id)),
    );
    const stack: string[] = [];
    const onStack = new Set<string>();
    const visit = (id: string) => {
      stack.push(id);
      onStack.add(id);
      for (const child of next.get(id) ?? []) {
        if (!remaining.has(child)) continue;
        if (!onStack.has(child)) {
          visit(child);
        } else {
          const start = stack.indexOf(child);
          if (start >= 0) loops.push([...stack.slice(start), child]);
        }
      }
      onStack.delete(id);
      stack.pop();
      remaining.delete(id);
    };
    for (const id of [...remaining]) if (remaining.has(id)) visit(id);
  }
  return { order: queue, combinationalLoops: loops };
}
/**
 * 组合模式：任何环路都不允许，沿用原有的严格拓扑排序并抛出错误。
 */
export function topologicalOrder(document: CircuitDocument): string[] {
  const degrees = new Map(document.nodes.map((node) => [node.id, 0]));
  const next = new Map(
    document.nodes.map((node) => [node.id, [] as string[]]),
  );
  for (const wire of document.wires) {
    if (!degrees.has(wire.from.nodeId) || !degrees.has(wire.to.nodeId))
      throw new Error("连线引用了不存在的元件");
    degrees.set(wire.to.nodeId, degrees.get(wire.to.nodeId)! + 1);
    next.get(wire.from.nodeId)!.push(wire.to.nodeId);
  }
  const queue = [...degrees]
    .filter(([, count]) => count === 0)
    .map(([id]) => id);
  for (let i = 0; i < queue.length; i++)
    for (const id of next.get(queue[i])!) {
      degrees.set(id, degrees.get(id)! - 1);
      if (degrees.get(id) === 0) queue.push(id);
    }
  if (queue.length !== document.nodes.length)
    throw new Error("当前实验只支持无环组合电路，请断开反馈连线");
  return queue;
}
/** 返回驱动某个节点指定输入端口的连线（没有则 undefined）。 */
export function incomingWire(
  document: CircuitDocument,
  nodeId: string,
  port: number,
) {
  return document.wires.find(
    (wire) => wire.to.nodeId === nodeId && wire.to.port === port,
  );
}
/** 仅供调试/展示使用：节点标签。 */
export function nodeLabel(document: CircuitDocument, id: string): string {
  const node: GateNode | undefined = document.nodes.find((n) => n.id === id);
  return node ? node.label : id;
}
export function hasTimingNodes(document: CircuitDocument): boolean {
  return document.nodes.some((node) => getSpec(node.kind).timingOnly);
}

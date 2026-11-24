import { ref } from "vue";
import type {
  CircuitDocument,
  GateKind,
  GateNode,
  Point,
} from "@/shared/types";
import { createId } from "@/shared/document";
function nextLabel(document: CircuitDocument, kind: GateKind): string {
  const peers = document.nodes.filter((node) => node.kind === kind);
  switch (kind) {
    case "INPUT":
      return (
        ["A", "B", "C", "D"].find(
          (name) => !document.nodes.some((node) => node.label === name),
        ) ?? `I${peers.length + 1}`
      );
    case "OUTPUT":
      return peers.length ? `Y${peers.length + 1}` : "Y";
    case "CLOCK":
      return peers.length ? `CLK${peers.length + 1}` : "CLK";
    case "RESET":
      return peers.length ? `RST${peers.length + 1}` : "RST";
    case "DFF":
      return peers.length ? `FF${peers.length + 1}` : "FF1";
    default:
      return `${kind} ${peers.length + 1}`;
  }
}
export function usePlacement() {
  const tool = ref<GateKind | null>(null);
  function createNode(
    document: CircuitDocument,
    kind: GateKind,
    position: Point,
  ): GateNode {
    return {
      id: createId("node"),
      kind,
      label: nextLabel(document, kind),
      value: 0,
      x: position.x,
      y: position.y,
    };
  }
  return { tool, createNode };
}

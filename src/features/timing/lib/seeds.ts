import type { CircuitDocument } from "@/shared/types";
import { DEFAULT_TIMING } from "./types";
/**
 * 两级流水示例：IN → FF1(D) → FF2(D) → OUT，
 * 两个寄存器共用同一时钟与同一异步复位，观察数据每拍只前进一级。
 */
export function pipelineCircuit(): CircuitDocument {
  return {
    version: 1,
    name: "两级流水寄存器",
    targetId: "xor",
    mode: "timing",
    timing: { ...DEFAULT_TIMING },
    nodes: [
      { id: "in1", kind: "INPUT", label: "D_IN", value: 0, x: 40, y: 200 },
      { id: "clk1", kind: "CLOCK", label: "CLK", value: 0, x: 40, y: 320 },
      { id: "rst1", kind: "RESET", label: "RST", value: 0, x: 40, y: 400 },
      { id: "ff1", kind: "DFF", label: "FF1", value: 0, x: 300, y: 180 },
      { id: "ff2", kind: "DFF", label: "FF2", value: 0, x: 560, y: 180 },
      { id: "out1", kind: "OUTPUT", label: "Y", value: 0, x: 820, y: 200 },
    ],
    wires: [
      { id: "pw1", from: { nodeId: "in1", port: 0 }, to: { nodeId: "ff1", port: 0 } },
      { id: "pw2", from: { nodeId: "clk1", port: 0 }, to: { nodeId: "ff1", port: 1 } },
      { id: "pw3", from: { nodeId: "rst1", port: 0 }, to: { nodeId: "ff1", port: 2 } },
      { id: "pw4", from: { nodeId: "ff1", port: 0 }, to: { nodeId: "ff2", port: 0 } },
      { id: "pw5", from: { nodeId: "clk1", port: 0 }, to: { nodeId: "ff2", port: 1 } },
      { id: "pw6", from: { nodeId: "rst1", port: 0 }, to: { nodeId: "ff2", port: 2 } },
      { id: "pw7", from: { nodeId: "ff2", port: 0 }, to: { nodeId: "out1", port: 0 } },
    ],
  };
}

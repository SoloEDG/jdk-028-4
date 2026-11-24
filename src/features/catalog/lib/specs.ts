import type { GateSpec } from "@/shared/types";
export const gateSpecs: readonly GateSpec[] = [
  {
    kind: "INPUT",
    name: "输入开关",
    symbol: "IN",
    inputs: 0,
    outputs: 1,
    description: "手动切换 0 / 1 信号",
  },
  {
    kind: "OUTPUT",
    name: "输出指示灯",
    symbol: "OUT",
    inputs: 1,
    outputs: 0,
    description: "观察电路末端的逻辑电平",
  },
  {
    kind: "AND",
    name: "与门",
    symbol: "&",
    inputs: 2,
    outputs: 1,
    description: "两个输入都为 1 时输出 1",
  },
  {
    kind: "OR",
    name: "或门",
    symbol: "≥1",
    inputs: 2,
    outputs: 1,
    description: "任一输入为 1 时输出 1",
  },
  {
    kind: "XOR",
    name: "异或门",
    symbol: "=1",
    inputs: 2,
    outputs: 1,
    description: "两个输入不同时输出 1",
  },
  {
    kind: "NOT",
    name: "非门",
    symbol: "1̅",
    inputs: 1,
    outputs: 1,
    description: "将输入电平取反",
  },
  {
    kind: "NAND",
    name: "与非门",
    symbol: "&̅",
    inputs: 2,
    outputs: 1,
    description: "与门结果取反",
  },
  {
    kind: "NOR",
    name: "或非门",
    symbol: "≥1̅",
    inputs: 2,
    outputs: 1,
    description: "或门结果取反",
  },
  {
    kind: "CLOCK",
    name: "周期时钟",
    symbol: "CLK",
    inputs: 0,
    outputs: 1,
    description: "手动单步的周期时钟，每次单步产生一个上升沿",
    timingOnly: true,
  },
  {
    kind: "RESET",
    name: "异步复位源",
    symbol: "RST",
    inputs: 0,
    outputs: 1,
    description: "异步复位开关，按下立即清零寄存器，释放不产生采样边沿",
    timingOnly: true,
  },
  {
    kind: "DFF",
    name: "上升沿寄存器",
    symbol: "D Q",
    inputs: 3,
    outputs: 1,
    description: "上升沿触发 D 寄存器：D 数据、CLK 时钟、RST 异步低有效复位",
    timingOnly: true,
  },
];
export function getSpec(kind: string): GateSpec {
  const spec = gateSpecs.find((item) => item.kind === kind);
  if (!spec) throw new Error(`未知元件类型：${kind}`);
  return spec;
}
/** D 寄存器端口约定：0=D 数据，1=CLK 时钟，2=RST 异步复位。 */
export const DFF_PORTS = { D: 0, CLK: 1, RST: 2 } as const;

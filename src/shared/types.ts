export type Signal = 0 | 1 | "X";
export type LabMode = "combinational" | "timing";
export type GateKind =
  | "INPUT"
  | "OUTPUT"
  | "AND"
  | "OR"
  | "XOR"
  | "NOT"
  | "NAND"
  | "NOR"
  | "DFF"
  | "CLOCK"
  | "RESET";
export interface Point {
  x: number;
  y: number;
}
export interface GateNode extends Point {
  id: string;
  kind: GateKind;
  label: string;
  value: 0 | 1;
}
export interface Endpoint {
  nodeId: string;
  port: number;
}
export interface Wire {
  id: string;
  from: Endpoint;
  to: Endpoint;
}
/** 时序实验的建立/保持参数，时间单位为抽象“拍内时间单位”。 */
export interface TimingParams {
  /** 建立时间：上升沿之前数据必须保持稳定的时长。 */
  setup: number;
  /** 保持时间：上升沿之后数据必须保持稳定的时长。 */
  hold: number;
  /** 自动激励在上升沿之前多少个时间单位施加。 */
  stimulusOffset: number;
}
export interface CircuitDocument {
  version: 1;
  name: string;
  nodes: GateNode[];
  wires: Wire[];
  targetId: string;
  mode: LabMode;
  timing?: TimingParams;
}
export interface GateSpec {
  kind: GateKind;
  name: string;
  symbol: string;
  inputs: number;
  outputs: number;
  description: string;
  /** 时序实验专用元件（时钟、寄存器、复位源）。 */
  timingOnly?: boolean;
}
export interface SimulationResult {
  values: Record<string, Signal>;
  pins: Record<string, Signal[]>;
  wires: Record<string, Signal>;
  order: string[];
  /** 最近一次动作中发生建立/保持违例的寄存器节点 id。 */
  violations?: string[];
}

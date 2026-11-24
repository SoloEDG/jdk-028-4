import type { Signal, TimingParams } from "@/shared/types";
export type { TimingParams };
/** 一拍内部的时间轴：上升沿固定在 t=0。 */
export const EDGE_TIME = 0;
export const DEFAULT_TIMING: TimingParams = {
  setup: 2,
  hold: 2,
  stimulusOffset: 4,
};
/** 拍内事件：某条网络（节点输出）在某时刻发生电平变化。 */
export interface TimedEvent {
  nodeId: string;
  time: number;
  from: Signal;
  to: Signal;
}
/** 单个寄存器在一次边沿上的采样记录。 */
export interface SampleRecord {
  /** 采样发生前（边沿前一刻）D 端数据。 */
  dataBefore: Signal;
  /** 采样窗口内是否发生违例（含恰好落在窗口边界的变化）。 */
  violation: "setup" | "hold" | null;
  /** 违例时受影响的采样结果变为未知。 */
  sampled: Signal;
  /** 采样后寄存器输出。 */
  outputAfter: Signal;
  /** 该拍是否被异步复位中断。 */
  reset: boolean;
}
/** 一拍的完整轨迹行。 */
export interface TraceStep {
  /** 第几个时钟周期，从 1 开始；复位/手动动作记为 0 号准备拍。 */
  cycle: number;
  /** 动作类型：时钟上升沿、异步复位、复位释放、手动改线后的重建。 */
  kind: "edge" | "reset-on" | "reset-off" | "rebuild" | "stimulus";
  clock: Signal;
  reset: Signal;
  /** 拍内各节点输出（拍结束时）。 */
  outputs: Record<string, Signal>;
  /** 该拍所有寄存器的采样明细。 */
  samples: Record<string, SampleRecord>;
  /** 该拍发生违例的寄存器 id。 */
  violations: string[];
  /** 该拍施加的激励：输入节点 id -> 新值。 */
  stimulus: Record<string, 0 | 1>;
  note: string;
}
/** 判断变化时刻是否落在采样窗口内，窗口边界也算违例。 */
export function inSamplingWindow(
  changeTime: number,
  params: TimingParams,
): boolean {
  return changeTime >= EDGE_TIME - params.setup &&
    changeTime <= EDGE_TIME + params.hold;
}
export function clampTiming(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(20, Math.round(value)));
}

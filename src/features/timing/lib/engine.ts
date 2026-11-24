import type {
  CircuitDocument,
  GateNode,
  Signal,
  TimingParams,
} from "@/shared/types";
import { DFF_PORTS, getSpec } from "@/features/catalog/lib/specs";
import { gateValue } from "@/features/simulation/lib/logic";
import { analyzeGraph } from "@/features/circuit/lib/graph";
import {
  DEFAULT_TIMING,
  EDGE_TIME,
  type SampleRecord,
  type TimedEvent,
  type TraceStep,
} from "./types";
interface PendingEvent {
  nodeId: string;
  time: number;
  value: 0 | 1;
}
interface DffRuntime {
  state: Signal;
  dataBefore: Signal;
  violation: "setup" | "hold" | null;
  resetSeen: boolean;
  hadEdge: boolean;
}
const PERIOD = 12;
function isSource(kind: GateNode["kind"]): boolean {
  return kind === "INPUT" || kind === "CLOCK" || kind === "RESET";
}
/**
 * 时序实验离散事件引擎。
 * 上升沿固定在 t=0：建立窗口 [-setup, 0]、保持窗口 [0, +hold]，均为闭区间，
 * 因此恰好落在窗口边界的数据变化同样记为违例。
 *
 * 关键不变量：上升沿到来时，所有寄存器先统一读取边沿前的 D 值并计算新状态，
 * 之后才把新状态写回网络。因此同一边沿上数据不可能一拍穿过两级寄存器，
 * 也与元件在节点数组中的摆放顺序无关。
 */
export class TimingEngine {
  private states = new Map<string, Signal>();
  private pending: PendingEvent[] = [];
  private plan = new Map<string, (0 | 1)[]>();
  cycle = 0;
  trace: TraceStep[] = [];
  violations: string[] = [];
  combinationalLoops: string[][] = [];
  constructor(private document: CircuitDocument) {
    this.rebuild(false);
  }
  get params(): TimingParams {
    return this.document.timing ?? DEFAULT_TIMING;
  }
  /** 改接线/增删元件后重建实验初态：寄存器回到未知，轨迹清空。 */
  rebuild(log: boolean): void {
    this.states.clear();
    this.pending = [];
    this.plan.clear();
    this.cycle = 0;
    this.trace = [];
    this.violations = [];
    for (const node of this.document.nodes) {
      if (node.kind === "DFF") this.states.set(node.id, "X");
      else if (isSource(node.kind))
        this.states.set(node.id, node.kind === "CLOCK" ? 0 : node.value);
    }    this.combinationalLoops = analyzeGraph(this.document).combinationalLoops;
    if (log) {
      this.trace.push({
        cycle: 0,
        kind: "rebuild",
        clock: this.clockLevel(),
        reset: this.resetLevel(),
        outputs: this.snapshot().values,
        samples: {},
        violations: [],
        stimulus: {},
        note: "电路接线已变更，实验初态重新建立：寄存器输出为未知 X，轨迹已清空。",
      });
    }
  }
  /** 暂停态（含待施加激励投影）的显示用组合求值结果。 */
  snapshot() {
    const values = this.evaluate(this.projectedSources());
    const pins: Record<string, Signal[]> = {};
    const wires: Record<string, Signal> = {};
    for (const node of this.document.nodes) {
      const spec = getSpec(node.kind);
      pins[node.id] = Array.from({ length: spec.inputs }, (_, port) => {
        const wire = this.document.wires.find(
          (w) => w.to.nodeId === node.id && w.to.port === port,
        );
        return wire ? (values[wire.from.nodeId] ?? "X") : "X";
      });
    }
    for (const wire of this.document.wires)
      wires[wire.id] = values[wire.from.nodeId] ?? "X";
    return {
      values,
      pins,
      wires,
      order: analyzeGraph(this.document).order,
      violations: [...this.violations],
    };
  }
  setPlan(nodeId: string, values: (0 | 1)[]): void {
    this.plan.set(nodeId, values);
  }
  getPlan(nodeId: string): (0 | 1)[] {
    return this.plan.get(nodeId) ?? [];
  }
  /** 暂停态手动切换输入/复位源，记录相对下一个上升沿的施加时刻。 */
  toggleSource(nodeId: string, time: number): void {
    const node = this.document.nodes.find((n) => n.id === nodeId);
    if (!node || !isSource(node.kind)) return;
    const next = node.value === 0 ? 1 : 0;
    node.value = next;
    this.pending.push({ nodeId, time, value: next });
  }
  pendingEvents(): PendingEvent[] {
    return [...this.pending];
  }
  /** 手动全局异步复位：立即把所有寄存器清零，不需要时钟沿。 */
  forceReset(): TraceStep {
    for (const node of this.document.nodes)
      if (node.kind === "DFF") this.states.set(node.id, 0);
    this.violations = [];
    const step: TraceStep = {
      cycle: this.cycle,
      kind: "reset-on",
      clock: this.clockLevel(),
      reset: 1,
      outputs: this.snapshot().values,
      samples: this.sampleSummary(true),
      violations: [],
      stimulus: {},
      note: "异步复位生效：寄存器输出立即清零，采样窗口被中断，本动作不产生时钟沿。",
    };
    this.trace.push(step);
    return step;
  }
  /** 执行一次手动单步：所有时钟同时产生一个上升沿。 */
  step(): TraceStep {
    const doc = this.document;
    const params = this.params;
    const dffs = doc.nodes.filter((n) => n.kind === "DFF");
    const runtimes = new Map<string, DffRuntime>(
      dffs.map((n) => [
        n.id,
        {
          state: this.states.get(n.id) ?? "X",
          dataBefore: "X",
          violation: null,
          resetSeen: false,
          hadEdge: false,
        },
      ]),
    );
    // 1) 组装拍内源事件：计划激励、手动激励、时钟下降/上升。
    const events: PendingEvent[] = [];
    const stimulus: Record<string, 0 | 1> = {};
    for (const node of doc.nodes) {
      if (node.kind !== "INPUT") continue;
      const planned = this.plan.get(node.id)?.shift();
      const current = this.states.get(node.id) ?? 0;
      if (planned !== undefined && planned !== current) {
        events.push({
          nodeId: node.id,
          time: EDGE_TIME - params.stimulusOffset,
          value: planned,
        });
        stimulus[node.id] = planned;
        node.value = planned;
      }
    }
    for (const evt of this.pending) {
      events.push({ ...evt });
      if (doc.nodes.find((n) => n.id === evt.nodeId)?.kind === "INPUT")
        stimulus[evt.nodeId] = evt.value;
    }
    this.pending = [];
    for (const clk of doc.nodes.filter((n) => n.kind === "CLOCK")) {
      if ((this.states.get(clk.id) ?? 0) === 1)
        events.push({ nodeId: clk.id, time: EDGE_TIME - PERIOD, value: 0 });
      events.push({ nodeId: clk.id, time: EDGE_TIME, value: 1 });
    }
    // 同一时刻先处理数据/复位事件，再处理时钟上升沿。
    events.sort((a, b) => {
      const ak = doc.nodes.find((n) => n.id === a.nodeId)?.kind === "CLOCK" ? 1 : 0;
      const bk = doc.nodes.find((n) => n.id === b.nodeId)?.kind === "CLOCK" ? 1 : 0;
      return a.time - b.time || ak - bk;
    });
    // 2) 建立工作网络：值 + 最近一次变化时刻 + 事件日志。
    // 工作网络从内部“拍前状态”种入；暂停态对 node.value 的改写通过事件注入，
    // 这样待施加激励既能在快照中预览，又能在拍内保留正确的变化时刻。
    const values = new Map<string, Signal>();
    const lastChange = new Map<string, number>();
    const netEvents = new Map<string, TimedEvent[]>();
    for (const node of doc.nodes) {
      if (isSource(node.kind) || node.kind === "DFF")
        values.set(node.id, this.states.get(node.id) ?? "X");
      lastChange.set(node.id, Number.NEGATIVE_INFINITY);
    }
    const record = (nodeId: string, evt: TimedEvent) => {
      const list = netEvents.get(nodeId) ?? [];
      list.push(evt);
      netEvents.set(nodeId, list);
    };
    const loopNodes = new Set(this.combinationalLoops.flat());
    const propagate = () => {
      // 纯组合环上的节点无法稳定求值，直接置为未知。
      for (const id of loopNodes) values.set(id, "X");
      const { order } = analyzeGraph(doc);
      for (const id of order) {
        const node = doc.nodes.find((n) => n.id === id)!;
        if (node.kind === "DFF" || isSource(node.kind)) continue;
        const next = loopNodes.has(id)
          ? ("X" as Signal)
          : gateValue(node.kind, this.pinsOf(id, values));
        const prev = values.get(id) ?? "X";
        values.set(id, next);
        if (prev !== next) {
          // 组合输出的变化时刻取其输入网络最近变化时刻。
          const inputs = this.inputNets(id);
          const t = inputs.reduce(
            (m, net) => Math.max(m, lastChange.get(net) ?? Number.NEGATIVE_INFINITY),
            Number.NEGATIVE_INFINITY,
          );
          lastChange.set(id, t);
          record(id, { nodeId: id, time: t, from: prev, to: next });
        }
      }
    };
    propagate();
    const setNet = (nodeId: string, value: Signal, time: number) => {
      const from = values.get(nodeId) ?? "X";
      values.set(nodeId, value);
      lastChange.set(nodeId, time);
      if (from !== value)
        record(nodeId, { nodeId, time, from, to: value });
      propagate();
    };
    const dNetOf = (dffId: string) => {
      const wire = doc.wires.find(
        (w) => w.to.nodeId === dffId && w.to.port === DFF_PORTS.D,
      );
      return wire?.from.nodeId;
    };
    const cNetOf = (dffId: string) => {
      const wire = doc.wires.find(
        (w) => w.to.nodeId === dffId && w.to.port === DFF_PORTS.CLK,
      );
      return wire?.from.nodeId;
    };
    const rNetOf = (dffId: string) => {
      const wire = doc.wires.find(
        (w) => w.to.nodeId === dffId && w.to.port === DFF_PORTS.RST,
      );
      return wire?.from.nodeId;
    };
    const resetActive = (dffId: string) => {
      const rNet = rNetOf(dffId);
      return rNet ? values.get(rNet) === 1 : false;
    };
    // 3) 推进事件；t=0 处先统一采样，再让时钟网络跳变。
    for (const evt of events) {
      const node = doc.nodes.find((n) => n.id === evt.nodeId);
      if (!node) continue;
      const isClockRise =
        evt.time === EDGE_TIME && node.kind === "CLOCK" && evt.value === 1;
      if (isClockRise) {
        // 3a) 所有寄存器基于边沿前网络同时计算新状态（先不写回）。
        // 该时钟网络上所有 DFF 都在本沿触发：时钟事件本身即 0→1 上升沿。
        const clockNetId = node.id;
        for (const dff of dffs) {
          const rt = runtimes.get(dff.id)!;
          const cNet = cNetOf(dff.id);
          if (cNet !== clockNetId) continue;
          rt.hadEdge = true;
          const dNet = dNetOf(dff.id);
          rt.dataBefore = dNet ? (values.get(dNet) ?? "X") : "X";
          if (resetActive(dff.id)) {
            rt.resetSeen = true;
            rt.state = 0;
            continue;
          }
          // 建立检查：D 网络（含组合逻辑）最近变化是否落在闭区间 [-setup, 0]。
          const dChange = dNet ? (lastChange.get(dNet) ?? Number.NEGATIVE_INFINITY) : Number.NEGATIVE_INFINITY;
          if (dChange >= EDGE_TIME - params.setup && dChange <= EDGE_TIME) {
            rt.violation = "setup";
            rt.state = "X";
          } else {
            rt.state = rt.dataBefore;
          }
        }
        // 3b) 统一写回寄存器新状态，再驱动时钟网络，杜绝同沿穿透。
        for (const dff of dffs) {
          const rt = runtimes.get(dff.id)!;
          if (!rt.hadEdge) continue;
          setNet(dff.id, rt.state, EDGE_TIME);
        }
        setNet(node.id, 1, EDGE_TIME);
        continue;
      }
      setNet(node.id, evt.value, evt.time);
      // 3c) 异步复位立即生效并中断当前窗口；保持窗口检查。
      for (const dff of dffs) {
        const rt = runtimes.get(dff.id)!;
        if (resetActive(dff.id) && !rt.resetSeen) {
          rt.resetSeen = true;
          rt.violation = null;
          rt.state = 0;
          setNet(dff.id, 0, evt.time);
        }
        if (
          rt.hadEdge &&
          !rt.resetSeen &&
          evt.time > EDGE_TIME &&
          evt.time <= EDGE_TIME + params.hold
        ) {
          const dNet = dNetOf(dff.id);
          const dChange = dNet
            ? (lastChange.get(dNet) ?? Number.NEGATIVE_INFINITY)
            : Number.NEGATIVE_INFINITY;
          if (dChange === evt.time) {
            rt.violation = "hold";
            rt.state = "X";
            setNet(dff.id, "X", evt.time);
          }
        }
      }
    }
    // 4) 写回状态并生成轨迹行。
    const samples: Record<string, SampleRecord> = {};
    const violations: string[] = [];
    for (const dff of dffs) {
      const rt = runtimes.get(dff.id)!;
      this.states.set(dff.id, rt.state);
      if (rt.violation) violations.push(dff.id);
      samples[dff.id] = {
        dataBefore: rt.dataBefore,
        violation: rt.resetSeen ? null : rt.violation,
        sampled: rt.resetSeen ? 0 : rt.violation ? "X" : rt.state,
        outputAfter: rt.state,
        reset: rt.resetSeen,
      };
    }
    for (const node of doc.nodes)
      if (isSource(node.kind))
        this.states.set(node.id, values.get(node.id) ?? node.value);
    this.violations = violations;
    this.cycle += 1;
    const step: TraceStep = {
      cycle: this.cycle,
      kind: "edge",
      clock: 1,
      reset: this.resetLevel(),
      outputs: this.snapshot().values,
      samples,
      violations,
      stimulus,
      note: violations.length
        ? `第 ${this.cycle} 拍检测到 ${violations.length} 个建立/保持违例，受影响寄存器输出变为未知 X。`
        : `第 ${this.cycle} 个上升沿：所有寄存器同时采样边沿前的数据，信号逐级移动。`,
    };
    this.trace.push(step);
    return step;
  }
  /** 暂停态按下/释放复位源，立即作用并记录；释放复位不产生采样边沿。 */
  driveReset(nodeId: string, value: 0 | 1): TraceStep {
    const node = this.document.nodes.find((n) => n.id === nodeId);
    if (!node || node.kind !== "RESET") throw new Error("仅复位源可驱动复位");
    node.value = value;
    this.states.set(node.id, value);
    const asserted: string[] = [];
    if (value === 1)
      for (const dff of this.document.nodes.filter((n) => n.kind === "DFF")) {
        const wire = this.document.wires.find(
          (w) =>
            w.to.nodeId === dff.id &&
            w.to.port === DFF_PORTS.RST &&
            w.from.nodeId === nodeId,
        );
        if (wire) {
          this.states.set(dff.id, 0);
          asserted.push(dff.id);
        }
      }
    this.violations = [];
    const kind = value === 1 ? "reset-on" : "reset-off";
    const step: TraceStep = {
      cycle: this.cycle,
      kind,
      clock: this.clockLevel(),
      reset: value,
      outputs: this.snapshot().values,
      samples: Object.fromEntries(
        asserted.map((id) => [
          id,
          {
            dataBefore: "X",
            violation: null,
            sampled: 0,
            outputAfter: 0,
            reset: true,
          } satisfies SampleRecord,
        ]),
      ),
      violations: [],
      stimulus: {},
      note:
        value === 1
          ? "异步复位中断采样窗口并立即清零寄存器，无需等待时钟沿。"
          : "复位已释放：寄存器保持当前值，释放动作不会自行产生采样边沿。",
    };
    this.trace.push(step);
    return step;
  }
  exportTrace() {
    return {
      kind: "logic-lab-trace",
      version: 1,
      exportedAt: new Date().toISOString(),
      cycle: this.cycle,
      timing: this.params,
      nodeIds: this.document.nodes.map((n) => n.id),
      steps: this.trace,
    };
  }
  private inputNets(nodeId: string): string[] {
    return this.document.wires
      .filter((w) => w.to.nodeId === nodeId)
      .map((w) => w.from.nodeId);
  }
  private pinsOf(nodeId: string, values: Map<string, Signal>): Signal[] {
    const node = this.document.nodes.find((n) => n.id === nodeId)!;
    return Array.from({ length: getSpec(node.kind).inputs }, (_, port) => {
      const wire = this.document.wires.find(
        (w) => w.to.nodeId === nodeId && w.to.port === port,
      );
      return wire ? (values.get(wire.from.nodeId) ?? "X") : "X";
    });
  }
  private evaluate(sources: Map<string, Signal>): Record<string, Signal> {
    const values = new Map<string, Signal>();
    for (const node of this.document.nodes) {
      if (isSource(node.kind))
        values.set(node.id, sources.get(node.id) ?? node.value);
      else if (node.kind === "DFF")
        values.set(node.id, this.states.get(node.id) ?? "X");
      else values.set(node.id, "X");
    }
    const { order, combinationalLoops } = analyzeGraph(this.document);
    const loopSet = new Set(combinationalLoops.flat());
    for (const id of order) {
      const node = this.document.nodes.find((n) => n.id === id)!;
      if (node.kind === "DFF" || isSource(node.kind)) continue;
      values.set(
        id,
        loopSet.has(id) ? "X" : gateValue(node.kind, this.pinsOf(id, values)),
      );
    }
    return Object.fromEntries(values);
  }
  private projectedSources(): Map<string, Signal> {
    const sources = new Map<string, Signal>();
    for (const node of this.document.nodes)
      if (isSource(node.kind))
        sources.set(
          node.id,
          node.kind === "CLOCK"
            ? (this.states.get(node.id) ?? 0)
            : node.value,
        );
    return sources;
  }
  private clockLevel(): Signal {
    const clk = this.document.nodes.find((n) => n.kind === "CLOCK");
    return clk ? (this.states.get(clk.id) ?? 0) : 0;
  }
  private resetLevel(): Signal {
    const rst = this.document.nodes.find((n) => n.kind === "RESET");
    return rst ? rst.value : 0;
  }
  private sampleSummary(reset: boolean): Record<string, SampleRecord> {
    return Object.fromEntries(
      this.document.nodes
        .filter((n) => n.kind === "DFF")
        .map((n) => [
          n.id,
          {
            dataBefore: this.states.get(n.id) ?? "X",
            violation: null,
            sampled: 0,
            outputAfter: 0,
            reset,
          } satisfies SampleRecord,
        ]),
    );
  }
}

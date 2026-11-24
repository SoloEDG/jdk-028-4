import { TimingEngine } from "../src/features/timing/lib/engine";
import { pipelineCircuit } from "../src/features/timing/lib/seeds";
import type { CircuitDocument } from "../src/shared/types";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name} ${detail}`);
  }
}
function doc(): CircuitDocument {
  return JSON.parse(JSON.stringify(pipelineCircuit()));
}
// 用节点 id 快速取值
function val(engine: TimingEngine, id: string) {
  return engine.snapshot().values[id];
}

console.log("1) 两级流水：数据每拍只前进一级，同沿不穿过两级");
{
  const d = doc();
  const eng = new TimingEngine(d);
  // 仅通过带时刻的激励接口施加 1（初态为 0）。
  eng.toggleSource("in1", 0 - (d.timing!.stimulusOffset));
  eng.step(); // 拍1：FF1 采样到 1，FF2 仍为 X（初态）
  check("拍1 FF1.Q = 1", val(eng, "ff1") === 1, `got ${val(eng, "ff1")}`);
  check("拍1 FF2.Q 仍为 X（数据未穿过两级）", val(eng, "ff2") === "X", `got ${val(eng, "ff2")}`);
  check("拍1 输出 Y 跟随 FF2 = X", val(eng, "out1") === "X");
  eng.step(); // 拍2：FF1 保持 1，FF2 才采样到上一拍 FF1 的 1
  check("拍2 FF2.Q = 1（延迟一拍）", val(eng, "ff2") === 1, `got ${val(eng, "ff2")}`);
  check("拍2 输出 Y = 1", val(eng, "out1") === 1);
  check("拍2 FF1.Q 仍为 1", val(eng, "ff1") === 1);
}

console.log("2) 同一边沿全部寄存器读取边沿前数据，与摆放顺序无关");
{
  const d = doc();
  // 调换节点数组顺序，把 ff2 放到 ff1 前面
  d.nodes = [
    ...d.nodes.filter((n) => n.id === "ff2"),
    ...d.nodes.filter((n) => n.id !== "ff2"),
  ];
  const eng = new TimingEngine(d);
  eng.toggleSource("in1", -4);
  eng.step();
  check("乱序摆放后拍1 FF1=1", val(eng, "ff1") === 1);
  check("乱序摆放后拍1 FF2 仍为 X", val(eng, "ff2") === "X", `got ${val(eng, "ff2")}`);
}

console.log("3) 建立时间：数据在窗口内（含边界）变化 → 违例 → 采样为 X");
{
  const d = doc();
  d.timing!.setup = 2;
  d.timing!.hold = 2;
  const eng = new TimingEngine(d);
  // 激励在 t=-2，恰好落在建立窗口左边界 [-2,0]
  eng.toggleSource("in1", -2);
  const step = eng.step();
  check("边界 t=-2 也算建立违例", step.violations.includes("ff1"), JSON.stringify(step.samples.ff1));
  check("违例后 FF1 采样为 X", val(eng, "ff1") === "X", `got ${val(eng, "ff1")}`);
}

console.log("4) 保持时间：上升沿后窗口内（含边界）变化 → 保持违例");
{
  const d = doc();
  d.timing!.setup = 2;
  d.timing!.hold = 2;
  const eng = new TimingEngine(d);
  // 第一拍：提前 4 施加 1，安全
  eng.toggleSource("in1", -4);
  eng.step();
  check("安全激励 FF1=1", val(eng, "ff1") === 1);
  // 第二拍：在 t=+2（保持窗口右边界）把输入拉低
  eng.toggleSource("in1", 2);
  const step = eng.step();
  const ff1 = step.samples.ff1;
  check("边界 t=+2 触发保持违例标记", ff1.violation === "hold", JSON.stringify(ff1));
  check("保持违例后 FF1=X", val(eng, "ff1") === "X", `got ${val(eng, "ff1")}`);
}

console.log("5) 窗口外的变化不违例");
{
  const d = doc();
  d.timing!.setup = 2;
  d.timing!.hold = 2;
  const eng = new TimingEngine(d);
  eng.toggleSource("in1", -3); // 窗口为 [-2,+2]，-3 在窗外
  const step = eng.step();
  check("窗外 t=-3 无违例", step.violations.length === 0);
  check("窗外变化正常采样 FF1=1", val(eng, "ff1") === 1);
}

console.log("6) 异步复位：立即改变输出并中断窗口，释放不产生采样边沿");
{
  const d = doc();
  const eng = new TimingEngine(d);
  eng.toggleSource("in1", -4);
  eng.step();
  eng.step();
  check("复位前 FF2=1", val(eng, "ff2") === 1);
  const rst = d.nodes.find((n) => n.id === "rst1")!;
  eng.driveReset("rst1", 1);
  check("按下复位后 FF1 立即为 0", val(eng, "ff1") === 0);
  check("按下复位后 FF2 立即为 0", val(eng, "ff2") === 0);
  check("复位动作不推进周期计数", eng.cycle === 2, `cycle=${eng.cycle}`);
  // 在复位保持时施加激励并释放复位，再单步：释放本身不应采样
  const before = eng.cycle;
  eng.driveReset("rst1", 0);
  check("释放复位不产生新时钟沿（周期不变）", eng.cycle === before);
  check("释放后寄存器保持 0", val(eng, "ff2") === 0);
}

console.log("7) 复位中断采样窗口：窗口内复位不算违例，输出立即 0");
{
  const d = doc();
  const eng = new TimingEngine(d);
  // 先让 FF1 变成 1
  eng.toggleSource("in1", -4);
  eng.step();
  check("准备态 FF1=1", val(eng, "ff1") === 1);
  // 第二拍：建立窗口内制造一个变化（本会违例），同拍按下复位
  eng.toggleSource("in1", -1);
  eng.driveReset("rst1", 1);
  const step = eng.step();
  check("复位优先，无违例记录", step.violations.length === 0, JSON.stringify(step.violations));
  check("复位后 FF1=0", val(eng, "ff1") === 0);
  eng.driveReset("rst1", 0);
}

console.log("8) 寄存器反馈允许，纯组合反馈被标记");
{
  const d = doc();
  // FF1 输出反馈到自己的 D 端（经过寄存器，允许）
  d.wires = d.wires.filter((w) => w.id !== "pw1");
  d.wires.push({
    id: "fb1",
    from: { nodeId: "ff1", port: 0 },
    to: { nodeId: "ff1", port: 0 },
  });
  const eng = new TimingEngine(d);
  check("寄存器反馈不报组合环", eng.combinationalLoops.length === 0);
  eng.step();
  check("自反馈寄存器保持可求值（X 或稳定值，不报错）", ["X", 0, 1].includes(val(eng, "ff1") as string));

  // 纯组合环：NOT 输出接回自己输入
  const c: CircuitDocument = {
    version: 1,
    name: "comb-loop",
    targetId: "xor",
    mode: "timing",
    timing: { setup: 2, hold: 2, stimulusOffset: 4 },
    nodes: [
      { id: "n1", kind: "NOT", label: "NOT1", value: 0, x: 100, y: 100 },
      { id: "clk", kind: "CLOCK", label: "CLK", value: 0, x: 100, y: 200 },
      { id: "ff", kind: "DFF", label: "FF", value: 0, x: 300, y: 100 },
      { id: "o1", kind: "OUTPUT", label: "Y", value: 0, x: 500, y: 100 },
    ],
    wires: [
      { id: "l1", from: { nodeId: "n1", port: 0 }, to: { nodeId: "n1", port: 0 } },
      { id: "l2", from: { nodeId: "clk", port: 0 }, to: { nodeId: "ff", port: 1 } },
      { id: "l3", from: { nodeId: "ff", port: 0 }, to: { nodeId: "o1", port: 0 } },
    ],
  };
  const eng2 = new TimingEngine(c);
  check("纯组合反馈环被识别", eng2.combinationalLoops.length > 0);
  check("组合环上信号被置 X", eng2.snapshot().values.n1 === "X");
}

console.log("9) 暂停后改接线 → 重建初态、清空轨迹");
{
  const d = doc();
  const eng = new TimingEngine(d);
  eng.toggleSource("in1", -4);
  eng.step();
  check("录制了 1 拍", eng.trace.length === 1);
  // 模拟增删元件/改接线
  d.nodes = d.nodes.filter((n) => n.id !== "out1");
  d.wires = d.wires.filter((w) => w.id !== "pw7");
  eng.rebuild(true);
  check("重建后轨迹清空", eng.trace.length === 1 && eng.trace[0].kind === "rebuild");
  check("重建后周期归零", eng.cycle === 0);
  check("重建后寄存器为 X", eng.snapshot().values.ff1 === "X");
}

console.log("10) 电路配置与轨迹分离导出");
{
  const d = doc();
  const eng = new TimingEngine(d);
  eng.step();
  const trace = eng.exportTrace() as { kind: string; steps: unknown[] };
  check("轨迹带独立 kind 标记", trace.kind === "logic-lab-trace");
  check("轨迹包含录制步骤", trace.steps.length >= 1);
  const circuitText = JSON.stringify(d);
  check("电路配置不含轨迹字段", !circuitText.includes("logic-lab-trace"));
}

console.log("11) 逐拍计划激励按拍施加");
{
  const d = doc();
  const eng = new TimingEngine(d);
  eng.setPlan("in1", [1, 0, 1]);
  eng.step();
  check("拍1 计划激励 1 被采样", val(eng, "ff1") === 1);
  eng.step();
  check("拍2 计划激励 0 被采样到 FF1", val(eng, "ff1") === 0);
  check("拍2 FF2 拿到拍1 的 1", val(eng, "ff2") === 1);
  eng.step();
  check("拍3 计划激励 1 被采样到 FF1", val(eng, "ff1") === 1);
}

console.log("");
if (failures) {
  console.error(`失败 ${failures} 项`);
  process.exit(1);
} else {
  console.log("全部时序引擎断言通过");
}

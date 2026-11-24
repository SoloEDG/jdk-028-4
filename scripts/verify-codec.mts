import { decodeDocument, encodeDocument, decodeTraceKind } from "../src/features/workspace/lib/codec";
import { pipelineCircuit } from "../src/features/timing/lib/seeds";
import { sampleCircuit } from "../src/features/workspace/lib/seeds";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

console.log("A) 时序电路编解码往返");
{
  const d = pipelineCircuit();
  const text = encodeDocument(d);
  const back = decodeDocument(text);
  check("模式保持 timing", back.mode === "timing");
  check("时序参数保持", back.timing?.setup === 2 && back.timing?.hold === 2);
  check("元件数一致", back.nodes.length === d.nodes.length);
  check("连线数一致", back.wires.length === d.wires.length);
  check("DFF 三端口保留", back.nodes.some((n) => n.kind === "DFF"));
}

console.log("B) 旧版（无 mode 字段）存档默认按组合模式");
{
  const old = sampleCircuit() as Record<string, unknown>;
  delete old.mode;
  const back = decodeDocument(JSON.stringify(old));
  check("缺省 mode=combinational", back.mode === "combinational");
  check("无时序参数", back.timing === undefined);
}

console.log("C) 组合模式拒绝时序元件文件");
{
  const d = pipelineCircuit();
  const text = JSON.stringify({ ...d, mode: "combinational" });
  let threw = false;
  try {
    decodeDocument(text);
  } catch {
    threw = true;
  }
  check("组合模式导入 DFF 文件报错", threw);
}

console.log("D) 轨迹文件与电路文件可区分，导入轨迹被拒绝并提示");
{
  const traceJson = JSON.stringify({ kind: "logic-lab-trace", version: 1, steps: [] });
  check("识别为 trace", decodeTraceKind(traceJson) === "trace");
  const circuitJson = encodeDocument(sampleCircuit());
  check("识别为 circuit", decodeTraceKind(circuitJson) === "circuit");
  check("无关 JSON 返回 null", decodeTraceKind("{}") === null);
}

console.log("E) 纯组合环文件被拒绝导入");
{
  const d = pipelineCircuit();
  // 制造一个不经过寄存器的环
  d.nodes.push({ id: "notx", kind: "NOT", label: "NOTX", value: 0, x: 700, y: 300 });
  d.wires.push({ id: "loopx", from: { nodeId: "notx", port: 0 }, to: { nodeId: "notx", port: 0 } });
  let threw = false;
  try {
    decodeDocument(encodeDocument(d));
  } catch {
    threw = true;
  }
  check("含组合环的时序文件报错", threw);
}

console.log("");
if (failures) {
  console.error(`失败 ${failures} 项`);
  process.exit(1);
}
console.log("全部编解码断言通过");

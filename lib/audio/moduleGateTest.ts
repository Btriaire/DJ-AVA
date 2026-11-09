// Fixed contract: a module closed in the picker generates nothing, and every engine listens to the gate
import { readdirSync, readFileSync } from "node:fs";
import { moduleOpen, onModuleGate, setModulesOpen } from "./moduleGate";

export function moduleGateTest(): string[] {
  const fails: string[] = [];
  const check = (ok: boolean, m: string) => { if (!ok) fails.push(m); };
  check(moduleOpen("gt_unknown"), "a module never mentioned is open");
  const seen: boolean[] = [];
  const off = onModuleGate("gt_a", (o) => seen.push(o));
  check(seen.length === 0, "open: nothing is called at registration");
  setModulesOpen({ gt_a: false });
  check(!moduleOpen("gt_a") && seen.join() === "false", "closing notifies once");
  setModulesOpen({ gt_a: false });
  check(seen.length === 1, "no change, no call");
  const late: boolean[] = [];
  onModuleGate("gt_a", (o) => late.push(o));
  check(late.join() === "false", "an engine created while its module is closed is closed at once");
  setModulesOpen({ gt_a: true });
  check(moduleOpen("gt_a") && seen.join() === "false,true", "opening notifies");
  off();
  setModulesOpen({ gt_a: false });
  check(seen.length === 2, "unsubscribed");
  setModulesOpen({ gt_a: true });
  setModulesOpen({ gt_b: false });
  check(moduleOpen("gt_a"), "a key left out of the list does not change");
  setModulesOpen({ gt_b: true });

  // source audit: a new module cannot forget the gate
  const dir = "lib/audio";
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && x !== "stemJam.ts" && !x.includes("Test"))) {
    const src = readFileSync(`${dir}/${f}`, "utf8");
    for (const line of src.split("\n")) if (line.includes("onJamTick(engine") && !/this\.active|moduleOpen/.test(line)) check(false, `${f}: tick without the gate: ${line.trim().slice(0, 60)}`);
    const classes = (src.match(/class \w+ extends JamModule/g) ?? []).length;
    const gates = (src.match(/this\.gateModule\(/g) ?? []).length;
    if (classes) check(gates >= classes, `${f}: ${classes} modules, ${gates} gates`);
  }
  for (const [f, k] of [["session.ts", 'onModuleGate("session"'], ["classique.ts", 'onModuleGate("session"'], ["stemSamplePad.ts", 'onModuleGate("samplepad"'], ["Rack.ts", "onModuleGate(id"], ["engine.ts", "onModuleGate("], ["Deck.ts", 'onModuleGate("fxpad"'], ["samplerFollow.ts", 'moduleOpen("supersampler")']] as const) check(readFileSync(`${dir}/${f}`, "utf8").includes(k), `${f}: ${k}`);
  return fails;
}

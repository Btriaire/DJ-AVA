import { parseWebSfz, sampleUrl, pickRegion, regionRate, type SfzRegion } from "./websfz";

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

function reg(over: Partial<SfzRegion>): SfzRegion {
  return {
    sample: "",
    lokey: 0,
    hikey: 127,
    lovel: 0,
    hivel: 127,
    center: 60,
    volume: 0,
    tune: 0,
    seqLength: 1,
    seqPosition: 1,
    release: null,
    offset: 0,
    path: "",
    ...over
  };
}

export function selfTest(): void {
  const sfz = {
    meta: { name: "t", baseUrl: "https://x.io/" },
    global: { default_path: "Samples/" },
    groups: [
      {
        lovel: 0,
        hivel: 63,
        regions: [
          { sample: "a", lokey: 21, hikey: 40, pitch_keycenter: 30 },
          { sample: "b", lokey: 41, hikey: 60 }
        ]
      },
      {
        lovel: 64,
        hivel: 127,
        regions: [
          { sample: "c", key: 50, volume: -3 }
        ]
      }
    ]
  };
  const { regions } = parseWebSfz(sfz);
  assert(regions.length === 3, "parse: regions length");
  assert(regions[0].path === "Samples/", "parse: regions[0].path");
  assert(regions[1].center === 41, "parse: regions[1].center");
  assert(regions[2].center === 50 && regions[2].lokey === 50 && regions[2].hikey === 50 && regions[2].lovel === 64 && regions[2].volume === -3, "parse: regions[2]");

  const pedal = parseWebSfz({ groups: [{ locc64: 65, regions: [{ sample: "res" }] }, { group_volume: -6, regions: [{ sample: "n", volume: -2 }] }, { regions: [{ sample: "rel", trigger: "release" }] }] }).regions;
  assert(pedal.length === 1 && pedal[0].sample === "n" && pedal[0].volume === -8, "parse: pedal-only and release regions skipped, group_volume added");

  const emptyRegions = parseWebSfz({}).regions;
  assert(emptyRegions.length === 0, "parse: empty regions length");

  const stringRegions = parseWebSfz({ groups: [ { regions: [ { sample: "s", lokey: "36" } ] } ] }).regions;
  assert(stringRegions[0].lokey === 36, "parse: string lokey");

  const drum = reg({ path: "Bass Drum 1/", sample: "hit v1" });
  assert(sampleUrl("https://x.io/s/", drum) === "https://x.io/s/Bass%20Drum%201/hit%20v1.ogg", "sampleUrl");
  assert(sampleUrl("https://x.io/s/Pianet T/", reg({ path: "Samples/", sample: "A#3, soft" })) === "https://x.io/s/Pianet%20T/Samples/A%233%2C%20soft.ogg", "sampleUrl encodes # and , and the base once");
  assert(sampleUrl("https://x.io/s/Pianet%20T", reg({ sample: "a" })) === "https://x.io/s/Pianet%20T/a.ogg", "sampleUrl does not encode an encoded base twice");
  assert(sampleUrl("https://x.io/s", drum) === "https://x.io/s/Bass%20Drum%201/hit%20v1.ogg", "sampleUrl without trailing slash");

  assert(pickRegion(regions, 30, 40, 0)?.sample === "a", "pickRegion: (30, 40, 0)");
  assert(pickRegion(regions, 50, 100, 0)?.sample === "c", "pickRegion: (50, 100, 0)");
  assert(pickRegion(regions, 50, 40, 0)?.sample === "b", "pickRegion: (50, 40, 0)");
  assert(pickRegion(regions, 100, 40, 0)?.sample === "b", "pickRegion: (100, 40, 0)");
  assert(pickRegion(regions, 30, 100, 0)?.sample === "c", "pickRegion: (30, 100, 0)");

  const rrRegions = [reg({ sample: "r1", lokey: 60, hikey: 60, lovel: 60, hivel: 60, seqLength: 2, seqPosition: 1 }), reg({ sample: "r2", lokey: 60, hikey: 60, lovel: 60, hivel: 60, seqLength: 2, seqPosition: 2 })];
  assert(pickRegion(rrRegions, 60, 60, 0)?.sample === "r1", "round robin: rr 0");
  assert(pickRegion(rrRegions, 60, 60, 1)?.sample === "r2", "round robin: rr 1");
  assert(pickRegion(rrRegions, 60, 60, 2)?.sample === "r1", "round robin: rr 2");

  assert(Math.abs(regionRate(reg({ center: 60 }), 72) - 2) < 1e-9, "regionRate: center 60, tune 0, midi 72");
  assert(Math.abs(regionRate(reg({ center: 60, tune: 100 }), 60) - 2 ** (1/12)) < 1e-9, "regionRate: center 60, tune 100, midi 60");
}

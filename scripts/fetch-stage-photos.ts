import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import path from "node:path";
import sharp from "sharp";

setDefaultAutoSelectFamilyAttemptTimeout(10_000);

type Hit = { title: string; url: string; licence: string; page: string };
type Label = {
  file: string;
  true_stage: number;
  claimed_stage: number;
  criteria_met: Record<string, boolean>;
  should_verdict: "pass" | "fail" | "unsure";
  licence: string;
  source: string;
  note: string;
};

const buckets: { stage: number; queries: string[] }[] = [
  { stage: 1, queries: ["construction site clearing", "land survey construction", "construction site mobilisation"] },
  { stage: 2, queries: ["foundation excavation construction", "concrete foundation footing", "building foundation trench"] },
  { stage: 3, queries: ["foundation wall construction", "blockwork foundation", "retaining wall construction"] },
  { stage: 4, queries: ["brick wall construction", "masonry construction site", "ground floor construction"] },
  { stage: 5, queries: ["concrete formwork slab", "rebar slab construction", "suspended slab formwork"] },
  { stage: 6, queries: ["roof construction truss", "metal roofing construction", "roof covering building"] },
  { stage: 7, queries: ["interior plastering", "wall plaster construction", "interior tiling construction"] },
  { stage: 8, queries: ["building facade construction", "exterior rendering building", "building exterior cladding"] },
];

const headers = { "user-agent": "CertaEval/1.0 (local stage-photo fixtures; educational)" };

async function search(query: string): Promise<Hit[]> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("license", "cc0,pdm,by,by-sa");
  url.searchParams.set("page_size", "20");
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`openverse ${response.status}`);
  const body = (await response.json()) as {
    results?: { url?: string; license?: string; license_version?: string; foreign_landing_url?: string; title?: string }[];
  };
  const hits: Hit[] = [];
  for (const row of body.results ?? []) {
    if (!row.url || !row.license) continue;
    const licence = `${row.license}${row.license_version ? ` ${row.license_version}` : ""}`.toUpperCase();
    hits.push({
      title: row.title || query,
      url: row.url,
      licence,
      page: row.foreign_landing_url || row.url,
    });
  }
  return hits;
}

async function saveHit(root: string, hit: Hit, file: string): Promise<boolean> {
  const response = await fetch(hit.url, { headers });
  if (!response.ok) {
    process.stderr.write(`skip ${response.status} ${hit.title}\n`);
    return false;
  }
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return false;
  const bytes = Buffer.from(await response.arrayBuffer());
  const jpeg = await sharp(bytes).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  writeFileSync(path.join(root, file), jpeg);
  return true;
}

async function main() {
  const root = path.join(process.cwd(), "tests/fixtures/stage-photos");
  mkdirSync(root, { recursive: true });
  for (const name of readdirSync(root)) {
    if (name.endsWith(".jpg") || name.endsWith(".json") || name.endsWith(".md")) unlinkSync(path.join(root, name));
  }
  const labels: Label[] = [];
  const seen = new Set<string>();
  let index = 0;
  for (const bucket of buckets) {
    let saved = 0;
    for (const query of bucket.queries) {
      if (saved >= 5) break;
      const hits = await search(query);
      process.stderr.write(`stage ${bucket.stage} "${query}" ${hits.length}\n`);
      for (const hit of hits) {
        if (saved >= 5 || seen.has(hit.url)) continue;
        seen.add(hit.url);
        index += 1;
        const file = `stage-${bucket.stage}-${String(index).padStart(2, "0")}.jpg`;
        try {
          if (!(await saveHit(root, hit, file))) continue;
        } catch (error) {
          process.stderr.write(`skip ${hit.title} ${error instanceof Error ? error.message : ""}\n`);
          continue;
        }
        saved += 1;
        const wrong = saved === 5;
        labels.push({
          file,
          true_stage: bucket.stage,
          claimed_stage: wrong ? (bucket.stage % 8) + 1 : bucket.stage,
          criteria_met: { c1: !wrong },
          should_verdict: wrong ? "fail" : "unsure",
          licence: hit.licence,
          source: hit.page,
          note: hit.title,
        });
      }
    }
    if (saved < 5) throw new Error(`Stage ${bucket.stage} only saved ${saved} openly licensed photos.`);
  }
  const first = labels[0];
  if (!first) throw new Error("No photos were saved.");
  const source = path.join(root, first.file);
  writeFileSync(path.join(root, "dark.jpg"), await sharp(source).modulate({ brightness: 0.05 }).jpeg().toBuffer());
  writeFileSync(path.join(root, "blur.jpg"), await sharp(source).blur(20).jpeg().toBuffer());
  writeFileSync(path.join(root, "duplicate.jpg"), await sharp(source).jpeg().toBuffer());
  const inner = await sharp(source).resize(640, 400, { fit: "cover" }).toBuffer();
  writeFileSync(
    path.join(root, "screen.jpg"),
    await sharp({ create: { width: 1280, height: 800, channels: 3, background: { r: 28, g: 28, b: 32 } } })
      .composite([{ input: inner, left: 320, top: 160 }])
      .jpeg()
      .toBuffer(),
  );
  const derivatives: { file: string; note: string; verdict: "fail" | "unsure" }[] = [
    { file: "dark.jpg", note: "Derivative of the first fixture, darkened. Same licence.", verdict: "unsure" },
    { file: "blur.jpg", note: "Derivative of the first fixture, blurred. Same licence.", verdict: "unsure" },
    { file: "duplicate.jpg", note: "Copy of the first fixture, for the reused-photo case. Same licence.", verdict: "fail" },
    { file: "screen.jpg", note: "The first fixture placed inside a screen bezel. Same licence.", verdict: "fail" },
  ];
  for (const derivative of derivatives) {
    labels.push({
      file: derivative.file,
      true_stage: first.true_stage,
      claimed_stage: first.true_stage,
      criteria_met: { c1: false },
      should_verdict: derivative.verdict,
      licence: first.licence,
      source: first.source,
      note: derivative.note,
    });
  }
  writeFileSync(path.join(root, "labels.json"), JSON.stringify(labels, null, 2));
  const lines = [
    "# Stage photo fixtures",
    "",
    "Each file is an openly licensed photograph found through Openverse, or a derivative of one. Derivatives stay under the source licence. NC and ND works were not used.",
    "",
  ];
  for (const label of labels) lines.push(`- \`${label.file}\` — ${label.licence}. ${label.note}. ${label.source}`);
  writeFileSync(path.join(root, "LICENSES.md"), `${lines.join("\n")}\n`);
  process.stdout.write(`saved ${labels.length}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "fetch failed";
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  process.stderr.write(`${message}${cause ? ` (${cause})` : ""}\n`);
  process.exit(1);
});

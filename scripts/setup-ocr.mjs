import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function packageDir(name) {
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
}

const coreDir = packageDir("tesseract.js-core");
const tessDir = packageDir("tesseract.js");

if (!coreDir || !tessDir) {
  console.error("Missing dependency. Run: npm i tesseract.js");
  process.exit(1);
}

mkdirSync("public/tesseract", { recursive: true });
cpSync(coreDir, "public/tesseract", { recursive: true });

const workerSource = [
  join(tessDir, "dist", "worker.min.js"),
  join(tessDir, "dist", "worker.js"),
].find(existsSync);

if (!workerSource) {
  console.error("Could not locate the tesseract worker script.");
  process.exit(1);
}
cpSync(workerSource, "public/tesseract/worker.min.js");

mkdirSync("public/tessdata", { recursive: true });
const languageFile = "public/tessdata/eng.traineddata.gz";

if (!existsSync(languageFile)) {
  console.log("Downloading English recognition data (~10MB)…");
  const response = await fetch("https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz");
  if (!response.ok) {
    console.error(`Download failed: ${response.status}. Re-run this script to retry.`);
    process.exit(1);
  }
  writeFileSync(languageFile, Buffer.from(await response.arrayBuffer()));
}

console.log("OCR assets ready. Image pixels are processed locally and never uploaded.");

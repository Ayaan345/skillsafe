import { concat } from "./bytes";

export type InflateFormat = "deflate-raw" | "deflate" | "gzip";

/** Streaming inflate with a hard byte cap, so a lying header cannot bomb us. */
export async function inflateBytes(
  data: Uint8Array,
  cap: number,
  deadline: number,
  format: InflateFormat,
): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress deflate streams.");
  }

  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });

  const transform = new DecompressionStream(format) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
  const reader = source.pipeThrough(transform).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    if (Date.now() > deadline) {
      await reader.cancel();
      throw new Error("Decompression exceeded the time budget.");
    }
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      throw new Error("Decompression exceeded the size cap.");
    }
    chunks.push(value);
  }

  return concat(chunks, total);
}

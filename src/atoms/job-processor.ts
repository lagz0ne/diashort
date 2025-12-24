import { atom, tags } from "@pumped-fn/lite";
import { jobConfigTag } from "../config/tags";
import { loggerAtom } from "./logger";
import { jobStoreAtom, type JobRecord } from "./job-store";
import { queueAtom } from "./queue";
import { mermaidRendererAtom } from "./mermaid-renderer";
import { cacheAtom } from "./cache";
import { spawnFnTag } from "../config/tags";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function getContentType(outputType: "svg" | "png"): string {
  return outputType === "svg" ? "image/svg+xml" : "image/png";
}

const readStream = async (stream: ReadableStream): Promise<string> => {
  const reader = stream.getReader();
  let result = "";
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value);
  }
  return result;
};

export interface JobProcessor {
  isRunning(): boolean;
}

export const jobProcessorAtom = atom({
  deps: {
    config: tags.required(jobConfigTag),
    logger: loggerAtom,
    jobStore: jobStoreAtom,
    queue: queueAtom,
    mermaidRenderer: mermaidRendererAtom,
    spawn: tags.required(spawnFnTag),
    cache: cacheAtom,
  },
  factory: (ctx, { config, logger, jobStore, queue, mermaidRenderer, spawn, cache }): JobProcessor => {
    let running = true;
    let pollTimeout: ReturnType<typeof setTimeout> | null = null;
    let cleanupInterval: ReturnType<typeof setInterval> | null = null;

    const renderDiagram = async (
      source: string,
      format: "mermaid" | "d2" | "plantuml" | "graphviz",
      outputType: "svg" | "png"
    ): Promise<Uint8Array> => {
      // Use mermaid renderer for mermaid
      if (format === "mermaid") {
        return await mermaidRenderer.render(source, outputType);
      }

      // Use subprocess for d2
      if (format === "d2") {
        const id = randomUUID();
        const tempDir = tmpdir();
        const inputPath = join(tempDir, `diashort-${id}.d2`);
        const outputPath = join(tempDir, `diashort-${id}.${outputType}`);

        try {
          await Bun.write(inputPath, source);

          const cmd = ["d2", inputPath, outputPath];
          let proc;
          try {
            proc = spawn(cmd, {
              stdout: "pipe",
              stderr: "pipe",
            });
          } catch (e: any) {
            throw new Error(`Failed to spawn renderer: ${e.message}`);
          }

          const exitCode = await proc.exited;

          if (exitCode !== 0) {
            const stderr = await readStream(proc.stderr);
            throw new Error(`Renderer failed with exit code ${exitCode}: ${stderr}`);
          }

          const output = Bun.file(outputPath);
          const exists = await output.exists();
          if (!exists) {
            throw new Error("Output file not generated");
          }

          const bytes = await output.bytes();
          return bytes;
        } finally {
          // Cleanup
          try {
            const inputExists = await Bun.file(inputPath).exists();
            if (inputExists) await Bun.file(inputPath).delete();

            const outputExists = await Bun.file(outputPath).exists();
            if (outputExists) await Bun.file(outputPath).delete();
          } catch (cleanupError) {
            logger.warn({ cleanupError }, "Failed to cleanup temp files");
          }
        }
      }

      throw new Error(`Unsupported format: ${format}`);
    };

    const processJob = async (job: JobRecord): Promise<void> => {
      logger.debug({ jobId: job.id }, "Processing job");
      jobStore.updateStatus(job.id, "rendering");

      let release: (() => void) | null = null;
      try {
        release = await queue.acquire();
        const bytes = await renderDiagram(job.source, job.format, job.outputType);
        const base64Data = uint8ArrayToBase64(bytes);
        const contentType = getContentType(job.outputType);
        const shortlink = cache.store(base64Data, contentType);

        jobStore.updateStatus(job.id, "completed", { shortlink });
        logger.info({ jobId: job.id, shortlink }, "Job completed");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        jobStore.updateStatus(job.id, "failed", { error: message });
        logger.error({ jobId: job.id, error: message }, "Job failed");
      } finally {
        if (release) release();
      }
    };

    const poll = async (): Promise<void> => {
      if (!running) return;

      try {
        const job = jobStore.getPending();
        if (job) {
          await processJob(job);
          if (running) pollTimeout = setTimeout(poll, 0);
        } else {
          if (running) pollTimeout = setTimeout(poll, config.pollIntervalMs);
        }
      } catch (error) {
        logger.error({ error }, "Error in job processor poll");
        if (running) pollTimeout = setTimeout(poll, config.pollIntervalMs);
      }
    };

    const runCleanup = (): void => {
      try {
        jobStore.cleanup();
      } catch (error) {
        logger.error({ error }, "Error in job cleanup");
      }
    };

    // Start polling and cleanup
    poll();
    cleanupInterval = setInterval(runCleanup, config.cleanupIntervalMs);

    ctx.cleanup(() => {
      running = false;
      if (pollTimeout) clearTimeout(pollTimeout);
      if (cleanupInterval) clearInterval(cleanupInterval);
      logger.debug("Job processor stopped");
    });

    return { isRunning: () => running };
  },
});

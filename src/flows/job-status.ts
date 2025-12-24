import { flow } from "@pumped-fn/lite";
import { jobStoreAtom } from "../atoms/job-store";
import { loggerAtom } from "../atoms/logger";

export class JobNotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(jobId: string) {
    super(`Job not found: ${jobId}`);
    this.name = "JobNotFoundError";
  }
}

export interface JobStatusInput {
  jobId: string;
}

export interface JobStatusResult {
  jobId: string;
  status: "pending" | "rendering" | "completed" | "failed";
  shortlink: string | null;
  error: string | null;
  url: string | null;
}

export const jobStatusFlow = flow({
  name: "job-status",
  deps: {
    jobStore: jobStoreAtom,
    logger: loggerAtom,
  },
  factory: async (ctx, { jobStore, logger }) => {
    const { input } = ctx;

    logger.debug({ jobId: input.jobId }, "Looking up job status");

    const job = jobStore.get(input.jobId);

    if (!job) {
      throw new JobNotFoundError(input.jobId);
    }

    const result: JobStatusResult = {
      jobId: job.id,
      status: job.status,
      shortlink: job.shortlink ?? null,
      error: job.error ?? null,
      url: job.shortlink ? `/d/${job.shortlink}` : null,
    };

    return result;
  },
});

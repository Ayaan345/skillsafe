import { z } from "zod";

export const OSV_MAX_QUERIES = 200;

export const osvRequestSchema = z.object({
  queries: z
    .array(
      z.object({
        name: z
          .string()
          .min(1)
          .max(160)
          .regex(/^(?:@[A-Za-z0-9._-]{1,60}\/)?[A-Za-z0-9._-]{1,100}$/),
        version: z.string().min(1).max(60).regex(/^[0-9A-Za-z.+-]{1,60}$/),
        ecosystem: z.enum(["npm", "PyPI"]),
      }),
    )
    .min(1)
    .max(OSV_MAX_QUERIES),
});

export type OsvRequest = z.infer<typeof osvRequestSchema>;

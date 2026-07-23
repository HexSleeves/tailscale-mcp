import { z } from "zod";
import { DeviceSummarySchema, TailnetSummarySchema } from "./tailscale.js";

const ListedDeviceSummarySchema = DeviceSummarySchema.extend({
  advertisedRoutes: z.array(z.string()).optional(),
  enabledRoutes: z.array(z.string()).optional(),
});

export const DevicesOutputSchema = z.object({
  devices: z.array(ListedDeviceSummarySchema),
});

export const MessageOutputSchema = z.object({
  message: z.string(),
});

export const NetworkStatusOutputSchema = z.object({
  status: z.unknown(),
});

export const TailnetOutputSchema = z.object({
  tailnet: TailnetSummarySchema,
});

export const DataOutputSchema = z.object({
  data: z.unknown(),
});

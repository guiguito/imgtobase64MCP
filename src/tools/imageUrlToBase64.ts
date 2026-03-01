import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchImageFromUrl } from "../utils/imageUtils.js";
import { logger } from "../utils/logger.js";

const InputSchema = {
	url: z.string().url().describe("The URL of the image to convert"),
	timeout_ms: z
		.number()
		.int()
		.min(1_000)
		.max(120_000)
		.default(30_000)
		.describe("Request timeout in milliseconds (1000-120000, default 30000)"),
};

export function registerImageUrlToBase64(server: McpServer): void {
	server.tool(
		"image_url_to_base64",
		"Fetch an image from a URL and convert it to base64. Returns base64 data, MIME type, size, dimensions, and a ready-to-use data URI.",
		InputSchema,
		async ({ url, timeout_ms }) => {
			logger.info("image_url_to_base64 called", { url, timeout_ms });
			try {
				const result = await fetchImageFromUrl(url, timeout_ms);
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(
								{
									base64: result.base64,
									mimeType: result.mimeType,
									sizeBytes: result.sizeBytes,
									...(result.width != null && { width: result.width }),
									...(result.height != null && { height: result.height }),
									dataUri: result.dataUri,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error("image_url_to_base64 failed", { url, error: message });
				return {
					content: [{ type: "text" as const, text: `Error: ${message}` }],
					isError: true,
				};
			}
		},
	);
}

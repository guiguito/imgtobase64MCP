import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readImageFromFile } from "../utils/imageUtils.js";
import { logger } from "../utils/logger.js";

const InputSchema = {
	file_path: z.string().min(1).describe("Path to the local image file"),
};

export function registerImageFileToBase64(server: McpServer): void {
	server.tool(
		"image_file_to_base64",
		"Read a local image file and convert it to base64. Returns base64 data, MIME type, size, dimensions, resolved path, and a ready-to-use data URI.",
		InputSchema,
		async ({ file_path }) => {
			logger.info("image_file_to_base64 called", { file_path });
			try {
				const result = await readImageFromFile(file_path);
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
									resolvedPath: result.resolvedPath,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error("image_file_to_base64 failed", { file_path, error: message });
				return {
					content: [{ type: "text" as const, text: `Error: ${message}` }],
					isError: true,
				};
			}
		},
	);
}

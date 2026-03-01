import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerImageFileToBase64 } from "./tools/imageFileToBase64.js";
import { registerImageUrlToBase64 } from "./tools/imageUrlToBase64.js";

export function createServer(): McpServer {
	const server = new McpServer({
		name: "imgtobase64-mcp-server",
		version: "1.0.0",
	});

	registerImageUrlToBase64(server);
	registerImageFileToBase64(server);

	return server;
}

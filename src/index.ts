#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { createServer } from "./server.js";
import { logger } from "./utils/logger.js";

function getTransport(): string {
	const flagIdx = process.argv.indexOf("--transport");
	if (flagIdx !== -1 && process.argv[flagIdx + 1]) {
		return process.argv[flagIdx + 1];
	}
	return process.env.TRANSPORT || "stdio";
}

async function startStdio(): Promise<void> {
	const server = createServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
	logger.info("MCP server running on stdio");
}

async function startHttp(): Promise<void> {
	const app = express();
	app.use(express.json());

	const sessions = new Map<
		string,
		{ transport: StreamableHTTPServerTransport; server: ReturnType<typeof createServer> }
	>();

	app.post("/mcp", async (req, res) => {
		const sessionId = req.headers["mcp-session-id"] as string | undefined;

		if (!sessionId) {
			// New session — must be an initialize request
			if (!isInitializeRequest(req.body)) {
				res.status(400).json({ error: "First request must be an initialize request" });
				return;
			}

			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				onsessioninitialized: (id) => {
					sessions.set(id, { transport, server });
				},
			});

			const server = createServer();
			await server.connect(transport);
			await transport.handleRequest(req, res, req.body);
			return;
		}

		// Existing session
		const session = sessions.get(sessionId);
		if (!session) {
			res.status(404).json({ error: "Session not found" });
			return;
		}
		await session.transport.handleRequest(req, res, req.body);
	});

	app.get("/mcp", async (req, res) => {
		const sessionId = req.headers["mcp-session-id"] as string | undefined;
		if (!sessionId) {
			res.status(400).json({ error: "Missing mcp-session-id header" });
			return;
		}
		const session = sessions.get(sessionId);
		if (!session) {
			res.status(404).json({ error: "Session not found" });
			return;
		}
		await session.transport.handleRequest(req, res);
	});

	app.delete("/mcp", async (req, res) => {
		const sessionId = req.headers["mcp-session-id"] as string | undefined;
		if (!sessionId) {
			res.status(400).json({ error: "Missing mcp-session-id header" });
			return;
		}
		const session = sessions.get(sessionId);
		if (!session) {
			res.status(404).json({ error: "Session not found" });
			return;
		}
		await session.transport.handleRequest(req, res);
		sessions.delete(sessionId);
	});

	app.get("/health", (_req, res) => {
		res.json({ status: "ok", timestamp: new Date().toISOString() });
	});

	const port = Number.parseInt(process.env.PORT || "3000", 10);
	const httpServer = app.listen(port, "0.0.0.0", () => {
		logger.info(`MCP HTTP server listening on http://0.0.0.0:${port}`);
	});

	const shutdown = () => {
		logger.info("Shutting down HTTP server…");
		for (const [id, session] of sessions) {
			session.transport.close();
			sessions.delete(id);
		}
		httpServer.close(() => {
			logger.info("HTTP server closed");
			process.exit(0);
		});
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

const transport = getTransport();
logger.info(`Starting MCP server with transport: ${transport}`);

if (transport === "http") {
	startHttp().catch((err) => {
		logger.error("Failed to start HTTP server", { error: String(err) });
		process.exit(1);
	});
} else if (transport === "stdio") {
	startStdio().catch((err) => {
		logger.error("Failed to start stdio server", { error: String(err) });
		process.exit(1);
	});
} else {
	logger.error(`Unknown transport: ${transport}. Use "stdio" or "http".`);
	process.exit(1);
}

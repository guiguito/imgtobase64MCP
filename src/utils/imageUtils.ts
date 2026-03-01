import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { logger } from "./logger.js";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const SUPPORTED_MIME_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/bmp",
	"image/svg+xml",
	"image/tiff",
	"image/x-icon",
	"image/vnd.microsoft.icon",
	"image/avif",
]);

const EXT_TO_MIME: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".bmp": "image/bmp",
	".svg": "image/svg+xml",
	".tiff": "image/tiff",
	".tif": "image/tiff",
	".ico": "image/x-icon",
	".avif": "image/avif",
};

export interface ImageResult {
	base64: string;
	mimeType: string;
	sizeBytes: number;
	width?: number;
	height?: number;
	dataUri: string;
}

/** Detect MIME type via magic bytes, falling back to file extension. */
async function detectMimeType(buffer: Buffer, filename?: string): Promise<string | null> {
	const detected = await fileTypeFromBuffer(buffer);
	if (detected && SUPPORTED_MIME_TYPES.has(detected.mime)) {
		return detected.mime;
	}
	// SVG won't be detected by magic bytes — check extension + content heuristic
	if (filename) {
		const ext = extname(filename).toLowerCase();
		const mime = EXT_TO_MIME[ext];
		if (mime && SUPPORTED_MIME_TYPES.has(mime)) return mime;
	}
	// Last-resort SVG check: look for <svg in the first bytes
	if (buffer.subarray(0, 256).toString("utf-8").includes("<svg")) {
		return "image/svg+xml";
	}
	return null;
}

/** Parse image dimensions from buffer headers (lightweight, no native deps). */
function parseDimensions(buffer: Buffer, mime: string): { width?: number; height?: number } {
	try {
		if (mime === "image/png" && buffer.length >= 24) {
			// PNG IHDR: width at offset 16 (4 bytes BE), height at offset 20
			return {
				width: buffer.readUInt32BE(16),
				height: buffer.readUInt32BE(20),
			};
		}
		if (mime === "image/gif" && buffer.length >= 10) {
			// GIF: width at offset 6 (2 bytes LE), height at offset 8
			return {
				width: buffer.readUInt16LE(6),
				height: buffer.readUInt16LE(8),
			};
		}
		if (mime === "image/bmp" && buffer.length >= 26) {
			// BMP: width at offset 18 (4 bytes LE), height at offset 22
			return {
				width: buffer.readUInt32LE(18),
				height: Math.abs(buffer.readInt32LE(22)),
			};
		}
		if (mime === "image/webp" && buffer.length >= 30) {
			// VP8 lossy: signature "VP8 " at offset 12
			if (buffer.subarray(12, 16).toString("ascii") === "VP8 " && buffer.length >= 30) {
				// Frame header starts at 20, dimensions at 26-29
				const w = buffer.readUInt16LE(26) & 0x3fff;
				const h = buffer.readUInt16LE(28) & 0x3fff;
				return { width: w, height: h };
			}
			// VP8L lossless: signature "VP8L" at offset 12
			if (buffer.subarray(12, 16).toString("ascii") === "VP8L" && buffer.length >= 25) {
				const bits = buffer.readUInt32LE(21);
				const w = (bits & 0x3fff) + 1;
				const h = ((bits >> 14) & 0x3fff) + 1;
				return { width: w, height: h };
			}
		}
		if (mime === "image/jpeg" && buffer.length >= 2) {
			return parseJpegDimensions(buffer);
		}
	} catch (e) {
		logger.debug("Failed to parse image dimensions", {
			error: e instanceof Error ? e.message : String(e),
		});
	}
	return {};
}

function parseJpegDimensions(buffer: Buffer): { width?: number; height?: number } {
	let offset = 2; // skip SOI marker
	while (offset < buffer.length - 1) {
		if (buffer[offset] !== 0xff) break;
		const marker = buffer[offset + 1];
		// SOF markers: C0-C3, C5-C7, C9-CB, CD-CF
		if (
			(marker >= 0xc0 && marker <= 0xc3) ||
			(marker >= 0xc5 && marker <= 0xc7) ||
			(marker >= 0xc9 && marker <= 0xcb) ||
			(marker >= 0xcd && marker <= 0xcf)
		) {
			if (offset + 9 <= buffer.length) {
				return {
					height: buffer.readUInt16BE(offset + 5),
					width: buffer.readUInt16BE(offset + 7),
				};
			}
		}
		// Skip to next marker
		if (offset + 3 >= buffer.length) break;
		const segmentLength = buffer.readUInt16BE(offset + 2);
		offset += 2 + segmentLength;
	}
	return {};
}

/** Fetch an image from a URL with timeout and size checks. */
export async function fetchImageFromUrl(url: string, timeoutMs = 30_000): Promise<ImageResult> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { "User-Agent": "imgtobase64-mcp-server/1.0" },
			redirect: "follow",
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const contentLength = response.headers.get("content-length");
		if (contentLength && Number.parseInt(contentLength, 10) > MAX_SIZE_BYTES) {
			throw new Error(
				`Image too large: ${Number.parseInt(contentLength, 10)} bytes (max ${MAX_SIZE_BYTES})`,
			);
		}

		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		if (buffer.length > MAX_SIZE_BYTES) {
			throw new Error(`Image too large: ${buffer.length} bytes (max ${MAX_SIZE_BYTES})`);
		}

		// Extract filename hint from URL path
		const urlPath = new URL(url).pathname;
		const filename = urlPath.split("/").pop() || undefined;

		const mimeType = await detectMimeType(buffer, filename);
		if (!mimeType) {
			throw new Error("Unsupported or unrecognizable image format");
		}

		const base64 = buffer.toString("base64");
		const dimensions = parseDimensions(buffer, mimeType);

		return {
			base64,
			mimeType,
			sizeBytes: buffer.length,
			...dimensions,
			dataUri: `data:${mimeType};base64,${base64}`,
		};
	} finally {
		clearTimeout(timer);
	}
}

/** Read a local image file and return its base64 representation. */
export async function readImageFromFile(
	filePath: string,
): Promise<ImageResult & { resolvedPath: string }> {
	const resolvedPath = resolve(filePath);

	const fileStat = await stat(resolvedPath);
	if (!fileStat.isFile()) {
		throw new Error(`Not a file: ${resolvedPath}`);
	}
	if (fileStat.size > MAX_SIZE_BYTES) {
		throw new Error(`Image too large: ${fileStat.size} bytes (max ${MAX_SIZE_BYTES})`);
	}

	const buffer = await readFile(resolvedPath);
	const filename = resolvedPath.split("/").pop() || undefined;

	const mimeType = await detectMimeType(buffer, filename);
	if (!mimeType) {
		throw new Error("Unsupported or unrecognizable image format");
	}

	const base64 = buffer.toString("base64");
	const dimensions = parseDimensions(buffer, mimeType);

	return {
		base64,
		mimeType,
		sizeBytes: buffer.length,
		...dimensions,
		dataUri: `data:${mimeType};base64,${base64}`,
		resolvedPath,
	};
}

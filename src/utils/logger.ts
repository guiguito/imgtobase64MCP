const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const currentLevel: LogLevel = (() => {
	const env = process.env.LOG_LEVEL?.toLowerCase();
	if (env && env in LOG_LEVELS) return env as LogLevel;
	return "info";
})();

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
	if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return;
	const entry = {
		timestamp: new Date().toISOString(),
		level,
		message,
		...(data && { data }),
	};
	process.stderr.write(`${JSON.stringify(entry)}\n`);
}

export const logger = {
	debug: (msg: string, data?: Record<string, unknown>) => log("debug", msg, data),
	info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
	warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
	error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
};

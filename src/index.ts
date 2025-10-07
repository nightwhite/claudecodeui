import { parseArgs, loadEnvFromFile, loadDefaultEnv } from "./utils/envLoader.ts"

// Parse command line arguments
const args = parseArgs();

// Load environment variables in priority order:
// 1. First try to load default .env file (if exists)
// 2. Then load custom config file if specified (overwrites defaults)
// 3. Finally apply command line port override

// Load default .env file if no custom config specified
if (!args.configPath) {
    try {
        const defaultEnv = loadDefaultEnv();
        if (defaultEnv && Object.keys(defaultEnv).length > 0) {
            for (const [key, value] of Object.entries(defaultEnv)) {
                process.env[key] = value;
            }
            console.log(`✅ Loaded ${Object.keys(defaultEnv).length} environment variables from .env`);
        }
    } catch (error) {
        // Silently ignore if .env doesn't exist
    }
}

// Load environment variables from custom config file if specified
if (args.configPath) {
    try {
        const customEnv = loadEnvFromFile(args.configPath);

        // Apply to process.env
        for (const [key, value] of Object.entries(customEnv)) {
            process.env[key] = value;
        }

        console.log(`✅ Loaded ${Object.keys(customEnv).length} environment variables from ${args.configPath}`);
    } catch (error) {
        console.error(`❌ Failed to load config file: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
    }
}

// Override PORT if specified via command line
if (args.port) {
    process.env.PORT = String(args.port);
    console.log(`🔧 Port override: ${args.port}`);
}

import { config } from "./config.ts"
import { app } from "./server.ts"

const signals = ["SIGINT", "SIGTERM"];

for (const signal of signals) {
    process.on(signal, async () => {
        console.log(`Received ${signal}. Initiating graceful shutdown...`);
        await app.stop()
        process.exit(0);
    })
}

process.on("uncaughtException", (error) => {
    console.error(error);
})

process.on("unhandledRejection", (error) => {
    console.error(error);
})

app.listen(config.PORT, () => console.log(`🦊 Server started at ${app.server?.url.origin}`))
    
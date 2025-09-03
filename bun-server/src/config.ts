import env from "env-var";

export const config = {
	NODE_ENV: env
	.get("NODE_ENV")
	.default("development")
	.asEnum(["production", "test", "development"]),
	

	PORT: env.get("PORT").default(3000).asPortNumber(),
	API_URL: env.get("API_URL").default(`https://${env.get("PUBLIC_DOMAIN").asString()}`).asString(),
	
	// Database path (can be relative like ./auth.db or absolute path)
	dbPath: env.get("DB_PATH").default("./auth.db").asString(),
	
	// JWT Secret
	jwtSecret: env.get("JWT_SECRET").default("your-secret-key-change-in-production").asString()
}
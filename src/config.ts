import env from "env-var";

export const config = {
	PORT: env.get("PORT").default(1234).asPortNumber()
}
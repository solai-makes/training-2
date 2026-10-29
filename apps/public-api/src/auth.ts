import { roleFor } from "../../../packages/prisma/src/store-growth.ts";
import { customerSession } from "./customer-auth.ts";
import { readFile } from "node:fs/promises";
import { createRemoteJWKSet, jwtVerify } from "jose";

const { poolId, clientId } = JSON.parse(
  await readFile(
    new URL("../../../.local/cognito.json", import.meta.url),
    "utf8",
  ),
) as {
  poolId: string;
  clientId: string;
};

const endpoint = process.env.COGNITO_LOCAL_ENDPOINT;

if (!endpoint || new URL(endpoint).hostname !== "cognito-local") {
  throw new Error("Local authentication configuration is required");
}

const issuer = `${
  process.env.COGNITO_ISSUER_DOMAIN ?? "http://localhost:9229"
}/${poolId}`;

const keys = createRemoteJWKSet(
  new URL(`${endpoint}/${poolId}/.well-known/jwks.json`),
);

export async function verifyCustomerToken(token: string) {
  if (token.startsWith("ss_")) {
    const session = await customerSession(token);
    if (!session) throw new Error("Invalid or expired customer session");
    return { sub: session.sub };
  }
  const { payload } = await jwtVerify(token, keys, {
    issuer,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "sub", "iat"],
  });

  if (payload.token_use !== "access") {
    throw new Error("Invalid access token");
  }

  if (payload.client_id !== clientId) {
    throw new Error("Invalid client");
  }

  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Invalid subject");
  }

  const groups = payload["cognito:groups"];

  if (Array.isArray(groups) && groups.includes("admin")) {
    throw new Error("Administrator accounts cannot use customer routes");
  }

  if(await roleFor({sub:payload.sub,admin:false,username:typeof payload.username === "string" ? payload.username : payload.sub})) throw new Error("Staff accounts cannot use customer routes");
  return {
    sub: payload.sub,
  };
}

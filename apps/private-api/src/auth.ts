import { readFile } from "node:fs/promises";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createRemoteJWKSet, jwtVerify } from "jose";

const { poolId, clientId } = JSON.parse(
  await readFile(
    new URL("../../../.local/cognito.json", import.meta.url),
    "utf8",
  ),
) as { poolId: string; clientId: string };
const endpoint = process.env.COGNITO_LOCAL_ENDPOINT;
if (!endpoint || new URL(endpoint).hostname !== "cognito-local")
  throw new Error("Local authentication configuration is required");
const issuer = `${process.env.COGNITO_ISSUER_DOMAIN ?? "http://localhost:9229"}/${poolId}`;
const keys = createRemoteJWKSet(
  new URL(`${endpoint}/${poolId}/.well-known/jwks.json`),
);
const cognito = new CognitoIdentityProviderClient({
  endpoint,
  region: "local",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
export async function login(username: string, password: string) {
  const result = await cognito.send(
    new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: username, PASSWORD: password },
    }),
  );
  if (!result.AuthenticationResult?.AccessToken) {
    const failure = new Error(
      "Local account requires additional sign-in steps. Run pnpm setup:local in the Dev Container, then try again.",
    );
    failure.name = "LocalSignInIncomplete";
    throw failure;
  }
  return result.AuthenticationResult.AccessToken;
}
export async function verify(token: string) {
  const { payload } = await jwtVerify(token, keys, {
    issuer,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "sub", "iat"],
  });

  if (payload.token_use !== "access" || payload.client_id !== clientId)
    throw new Error("Invalid access token");

  if (typeof payload.sub !== "string" || payload.sub.length === 0)
    throw new Error("Invalid access token");

  return {
    sub: payload.sub,
    username: typeof payload.username === "string" ? payload.username : typeof payload["cognito:username"] === "string" ? payload["cognito:username"] : payload.sub,
    admin:
      Array.isArray(payload["cognito:groups"]) &&
      payload["cognito:groups"].includes("admin"),
  };
}

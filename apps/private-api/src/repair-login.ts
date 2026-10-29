import { mkdir, writeFile } from "node:fs/promises";
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  CreateGroupCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  ListUserPoolClientsCommand,
  ListUserPoolsCommand,
  UpdateUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";


const endpoint = process.env.COGNITO_LOCAL_ENDPOINT;
if (!endpoint || new URL(endpoint).hostname !== "cognito-local") {
  throw new Error("Run this command in the training2 Dev Container.");
}
const cognito = new CognitoIdentityProviderClient({
  endpoint,
  region: "local",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
const pools = await cognito.send(new ListUserPoolsCommand({ MaxResults: 60 }));
let poolId = pools.UserPools?.find((pool) => pool.Name === "training2")?.Id;
if (!poolId)
  poolId = (
    await cognito.send(new CreateUserPoolCommand({ PoolName: "training2" }))
  ).UserPool?.Id;
if (!poolId) throw new Error("User pool was not created");
const clients = await cognito.send(
  new ListUserPoolClientsCommand({ UserPoolId: poolId, MaxResults: 60 }),
);
let clientId = clients.UserPoolClients?.find(
  (client) => client.ClientName === "training2-app",
)?.ClientId;
if (!clientId)
  clientId = (
    await cognito.send(
      new CreateUserPoolClientCommand({
        UserPoolId: poolId,
        ClientName: "training2-app",
        GenerateSecret: false,
        ExplicitAuthFlows: [
          "ALLOW_USER_PASSWORD_AUTH",
          "ALLOW_REFRESH_TOKEN_AUTH",
        ],
      }),
    )
  ).UserPoolClient?.ClientId;
if (!clientId) throw new Error("App client was not created");
// Repair clients created by an earlier setup as well as newly created clients.
await cognito.send(
  new UpdateUserPoolClientCommand({
    UserPoolId: poolId,
    ClientId: clientId,
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
  }),
);
try {
  await cognito.send(
    new CreateGroupCommand({ UserPoolId: poolId, GroupName: "admin" }),
  );
} catch (error) {
  if (!(error instanceof Error) || error.name !== "GroupExistsException")
    throw error;
}
for (const username of ["admin@example.test", "buyer@example.test"]) {
  try {
    await cognito.send(
      new AdminGetUserCommand({ UserPoolId: poolId, Username: username }),
    );
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "UserNotFoundException")
      throw error;
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username: username,
        MessageAction: "SUPPRESS",
        UserAttributes: [
          { Name: "email", Value: username },
          { Name: "email_verified", Value: "true" },
        ],
      }),
    );
  }
  // These two accounts belong only to the local emulator. Restore their
  // documented password and CONFIRMED status even when they already exist.
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: username,
      Password: "Training2-local!",
      Permanent: true,
    }),
  );
}
await cognito.send(
  new AdminAddUserToGroupCommand({
    UserPoolId: poolId,
    Username: "admin@example.test",
    GroupName: "admin",
  }),
);
const directory = new URL("../../../.local/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL("cognito.json", directory),
  JSON.stringify({ poolId, clientId }),
);
console.log("Local sign-in accounts repaired. Database was not changed.");


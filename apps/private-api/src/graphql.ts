import { allowed } from "../../../packages/api-contracts/src/growth-policy.ts";
import { StaffOperationsPlugin } from "./staff-graphql-plugin.ts";
import { postgraphile } from "postgraphile";
import { PostGraphileAmberPreset } from "postgraphile/presets/amber";
import { makePgService } from "postgraphile/adaptors/pg";
import { grafast } from "postgraphile/grafast";
import { validateCatalogQuery } from "./graphql-policy.ts";
import { verify } from "./auth.ts";
import { roleFor, demand } from "../../../packages/prisma/src/store-growth.ts";
import type { Context } from "hono";

const pgl = postgraphile({
  extends: [PostGraphileAmberPreset],
  plugins: [StaffOperationsPlugin],
  pgServices: [
    makePgService({
      connectionString: process.env.DATABASE_URL,
      schemas: ["training3_api"],
      pubsub: false,
      poolConfig: { max: 4, statement_timeout: 5000 },
    }),
  ],
  schema: { defaultBehavior: "-insert -update -delete" },
  grafserv: { graphiql: false },
});
export async function closeGraphql() {
  await pgl.release();
}
export async function graphqlHandler(c: Context) {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer "))
    return c.json(
      {
        errors: [
          {
            message: "Please sign in.",
            extensions: { code: "UNAUTHENTICATED" },
          },
        ],
      },
      401,
    );
  let identity: Awaited<ReturnType<typeof verify>>;
  try {
    identity = await verify(auth.slice(7));
  } catch {
    return c.json(
      {
        errors: [
          {
            message: "Your session expired. Please sign in again.",
            extensions: { code: "UNAUTHENTICATED" },
          },
        ],
      },
      401,
    );
  }
  const role = await roleFor(identity);
  if (!allowed(role, "catalog:view"))
    return c.json(
      {
        errors: [
          {
            message: "Your staff role does not allow this action.",
            extensions: { code: "FORBIDDEN", status: 403 },
          },
        ],
      },
      403,
    );
  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.query !== "string" ||
    body.query.length > 16000 ||
    Array.isArray(body)
  )
    return c.json({ errors: [{ message: "Invalid GraphQL request." }] }, 400);
  try {
    validateCatalogQuery(body.query, body.variables);
    const { schema, resolvedPreset } = await pgl.getSchemaResult();
    const result = await grafast({
      schema,
      resolvedPreset,
      requestContext: {},
      contextValue: { staff: { actor: identity.sub, role } },
      source: body.query,
      variableValues: body.variables,
      operationName: body.operationName,
    });
    if (Symbol.asyncIterator in result)
      throw Error("Streaming is not enabled.");
    // Never return database details to the browser.
    return c.json(
      {
        ...result,
        errors: result.errors?.map((error) => ({
          message: error.extensions?.code
            ? error.message
            : "The GraphQL request could not be completed.",
          extensions: {
            code: error.extensions?.code ?? "GRAPHQL_ERROR",
            status: error.extensions?.status ?? 400,
          },
        })),
      },
      result.errors ? 400 : 200,
    );
  } catch {
    return c.json(
      { errors: [{ message: "Invalid or unsupported GraphQL request." }] },
      400,
    );
  }
}

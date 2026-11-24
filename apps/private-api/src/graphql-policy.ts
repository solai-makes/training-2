import { parse, visit, Kind } from "postgraphile/graphql";
export function validateCatalogQuery(
  query: string,
  variables: Record<string, unknown> = {},
) {
  if (query.length > 16000) throw Error("Query too large.");
  const ast = parse(query);
  let fields = 0,
    depth = 0,
    maxDepth = 0,
    operations = 0;
  visit(ast, {
    OperationDefinition(node) {
      operations++;
      if (node.operation === "subscription")
        throw Error("Subscriptions are not enabled.");
      if (
        node.operation === "mutation" &&
        node.selectionSet.selections.length !== 1
      )
        throw Error("Submit one mutation at a time.");
    },
    FragmentDefinition() {
      throw Error("Fragments are not enabled.");
    },
    Field: {
      enter(node) {
        fields++;
        depth++;
        maxDepth = Math.max(depth, maxDepth);
        if (
          node.name.value === "allInventoryProducts" &&
          !node.arguments?.some((arg) => arg.name.value === "first")
        )
          throw Error("Choose a page size.");
        for (const arg of node.arguments ?? []) {
          if (
            ["first", "last", "offset", "page", "pageSize"].includes(
              arg.name.value,
            )
          ) {
            const value =
              arg.value.kind === Kind.VARIABLE
                ? variables[arg.value.name.value]
                : arg.value.kind === Kind.INT
                  ? Number(arg.value.value)
                  : null;
            const maximum = ["first", "last", "pageSize"].includes(
              arg.name.value,
            )
              ? 100
              : Number.MAX_SAFE_INTEGER;
            if (
              typeof value !== "number" ||
              !Number.isSafeInteger(value) ||
              value < (arg.name.value === "offset" ? 0 : 1) ||
              value > maximum
            )
              throw Error("Invalid pagination.");
          }
        }
      },
      leave() {
        depth--;
      },
    },
  });
  if (operations !== 1 || fields > 100 || maxDepth > 12)
    throw Error("Query too complex.");
}

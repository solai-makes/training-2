import axios from "axios";
import type { Product } from "../../../packages/ui/src/storefront.ts";
import { GraphQLClient, gql } from "graphql-request";
import { staffQueryClient, staffSession } from "./query-client.ts";
import { pricedProduct } from "../../../packages/api-contracts/src/scheduled-price.ts";
import {
  matchStaffOperation,
  staffDocument,
} from "../../../packages/api-contracts/src/staff-graphql.ts";
const catalog = gql`query StaffInventory($first:Int!,$offset:Int!){allInventoryProducts(first:$first,offset:$offset,orderBy:[PRODUCT_NUMBER_ASC,ROW_ID_ASC]){totalCount nodes{id:rowId code name description price stock createdAt updatedAt imageUrl variantParentId variants}}}`;
export async function staffRequest(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers),
    session = staffSession(headers.get("Authorization") ?? "");
  const method = (options.method ?? "GET").toUpperCase(),
    parsed = new URL(url, location.origin),
    read = method === "GET";
  const execute = async () => {
    // Login remains an HTTP authentication endpoint; all staff business traffic uses GraphQL.
    if (parsed.pathname === "/api/auth/login") {
      const response = await axios.request({
        url,
        method,
        headers: Object.fromEntries(headers),
        data: options.body,
        signal: options.signal ?? undefined,
        timeout: 20000,
        validateStatus: () => true,
      });
      return {
        response: {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
        },
        body: response.data,
      };
    }
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000);
    const client = new GraphQLClient(
      new URL("/api/graphql", location.origin).href,
      { headers: Object.fromEntries(headers), signal },
    );
    if (read && parsed.pathname === "/api/products") {
      const first = Number(parsed.searchParams.get("pageSize") ?? 20),
        page = Number(parsed.searchParams.get("page") ?? 1);
      if (
        !Number.isInteger(first) ||
        first < 1 ||
        first > 100 ||
        !Number.isInteger(page) ||
        page < 1
      )
        throw Error("Invalid product page.");
      const { allInventoryProducts: rows } = await client.request<{
        allInventoryProducts: { totalCount: number; nodes: Product[] };
      }>(catalog, { first, offset: (page - 1) * first });
      return {
        response: { ok: true, status: 200 },
        body: {
          items: rows.nodes.map((row) => ({
            ...pricedProduct(row),
            variants: (row.variants ?? []).map((variant) =>
              pricedProduct(variant),
            ),
          })),
          total: rows.totalCount,
          page,
          pageSize: first,
        },
      };
    }
    const matched = matchStaffOperation(
      parsed.pathname.replace(/^\/api/, ""),
      method,
    );
    if (!matched) throw Error("Unsupported staff operation.");
    const variables: Record<string, unknown> = { ...matched.params };
    for (const [key, type] of Object.entries(matched.operation.args)) {
      if (key === "input") {
        variables.input =
          typeof options.body === "string" ? JSON.parse(options.body) : {};
        continue;
      }
      if (key in variables) continue;
      const value = parsed.searchParams.get(key);
      if (value === null) continue;
      variables[key] =
        type.replace("!", "") === "Int"
          ? Number(value)
          : type.replace("!", "") === "Boolean"
            ? value === "true"
            : value;
    }
    const data = await client.request<{ result: unknown }>(
      staffDocument(matched.operation),
      variables,
    );
    return { response: { ok: true, status: 200 }, body: data.result };
  };
  try {
    if (read)
      return await staffQueryClient.fetchQuery({
        queryKey: ["staff", session, url],
        queryFn: execute,
      });
    const mutation = staffQueryClient
      .getMutationCache()
      .build(staffQueryClient, {
        mutationKey: ["staff", session, method, parsed.pathname],
        mutationFn: execute,
        retry: false,
      });
    const result = await mutation.execute(undefined);
    await staffQueryClient.invalidateQueries({ queryKey: ["staff", session] });
    return result;
  } catch (failure) {
    const error = failure as {
      response?: {
        status?: number;
        errors?: Array<{
          message: string;
          extensions?: { code?: string; status?: number };
        }>;
      };
    };
    const graphqlError = error.response?.errors?.[0],
      status = Number(
        graphqlError?.extensions?.status ?? error.response?.status ?? 0,
      );
    if (status >= 400 && status < 500)
      return {
        response: { ok: false, status },
        body: {
          message:
            graphqlError?.message ??
            (status === 401
              ? "Your session expired. Please sign in again."
              : "Check the supplied fields."),
        },
      };
    throw Error(
      read
        ? "The workspace request failed. Please try again."
        : "The save could not be confirmed. Check the current data before retrying.",
    );
  }
}

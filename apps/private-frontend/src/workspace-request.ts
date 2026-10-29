/** Bound both the connection and response body. Never automatically retry writes. */
export async function workspaceRequest(url: string, options: RequestInit = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const writing = !["GET", "HEAD"].includes((options.method ?? "GET").toUpperCase());
  try {
    const response = await fetch(url, { ...options, signal });
    const content = await response.text();
    const body = (() => { try { return content ? JSON.parse(content) : null; } catch { return null; } })();
    if (response.ok && !body) throw new Error("The workspace returned an invalid response. Check Inventory before trying again.");
    return { response, body };
  } catch (failure) {
    if (timedOut) throw new Error(writing
      ? "The server did not confirm the save within 20 seconds. Your form is still here. Check Inventory before retrying to avoid adding the product twice."
      : "The workspace server took too long to respond. Please try again.");
    if (failure instanceof Error && failure.message.startsWith("The workspace returned")) throw failure;
    throw new Error(writing
      ? "The connection was interrupted and the save could not be confirmed. Your form is still here. Check Inventory before retrying."
      : "The workspace server is unavailable. Check your connection.");
  } finally { clearTimeout(timer); }
}

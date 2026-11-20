import type { ChatMessage, RestaurantsPayload } from "@/types";

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (payload: {
    answer: string;
    sources: string[];
    mentioned_restaurants: string[];
    is_fallback: boolean;
  }) => void;
  onError: (message: string) => void;
}

export async function fetchClientConfig(): Promise<{ google_maps_api_key: string | null }> {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) return { google_maps_api_key: null };
    return res.json();
  } catch {
    return { google_maps_api_key: null };
  }
}

export async function fetchRestaurants(): Promise<RestaurantsPayload> {
  const res = await fetch("/api/restaurants");
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export async function rebuildIndex(): Promise<{ status: string; restaurants_count: number }> {
  const res = await fetch("/api/index/rebuild", { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function streamChatMessage(
  message: string,
  history: ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const cleanHistory = history
    .filter((m) => !m.isError && m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history: cleanHistory }),
    signal,
  });

  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || `Error HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const block of events) {
      const line = block.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;

      const payload = JSON.parse(line.slice(6));
      if (payload.type === "token") {
        callbacks.onToken(payload.text);
      } else if (payload.type === "done") {
        callbacks.onDone(payload);
      } else if (payload.type === "error") {
        callbacks.onError(payload.message);
      }
    }
  }
}

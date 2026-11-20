import { createContext, useContext, useMemo } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import {
  AlertTriangle,
  FileText,
  Leaf,
  Loader2,
  Send,
  Sparkles,
  Square,
  User,
  UtensilsCrossed,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { RestaurantCard } from "@/components/RestaurantCard";
import { getCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ChatMessage, Language, Restaurant } from "@/types";

interface ChatPanelProps {
  messages: ChatMessage[];
  isRunning: boolean;
  language: Language;
  restaurantsById: Map<string, Restaurant>;
  favoriteIds: Set<string>;
  compareIds: string[];
  highlightedRestaurantId: string | null;
  onSendMessage: (text: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onToggleFavorite: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onSelectRestaurant: (restaurant: Restaurant) => void;
  onLocateRestaurant: (restaurant: Restaurant) => void;
  onHoverRestaurant: (id: string | null) => void;
}

interface ChatViewContextValue {
  messageMap: Map<string, ChatMessage>;
  latestMessageId: string | undefined;
  isRunning: boolean;
  language: Language;
  restaurantsById: Map<string, Restaurant>;
  favoriteIds: Set<string>;
  compareIds: string[];
  highlightedRestaurantId: string | null;
  onToggleFavorite: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onSelectRestaurant: (restaurant: Restaurant) => void;
  onLocateRestaurant: (restaurant: Restaurant) => void;
  onHoverRestaurant: (id: string | null) => void;
}

const ChatViewContext = createContext<ChatViewContextValue | null>(null);

function extractText(msg: AppendMessage): string {
  return msg.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function UserMessageView() {
  const ctx = useContext(ChatViewContext);
  const msgId = useAuiState((s) => s.message.id);
  const content = ctx?.messageMap.get(msgId)?.content ?? "";

  return (
    <MessagePrimitive.Root className="mb-4 flex items-start justify-end gap-2.5">
      <div className="max-w-[84%] rounded-2xl rounded-tr-sm bg-[var(--bg-user-bubble)] px-4 py-2.5 text-sm font-medium leading-relaxed text-[var(--fg)] shadow-2xs">
        {content}
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--fg-muted)]">
        <User className="h-4 w-4" />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessageView() {
  const ctx = useContext(ChatViewContext);
  const msgId = useAuiState((s) => s.message.id);

  if (!ctx) return null;

  const t = getCopy(ctx.language);
  const meta = ctx.messageMap.get(msgId);
  const content = meta?.content ?? "";
  const isLatestStreaming = ctx.isRunning && msgId === ctx.latestMessageId;

  const citedRestaurants = (meta?.mentionedRestaurants ?? [])
    .map((id) => ctx.restaurantsById.get(id))
    .filter((r): r is Restaurant => Boolean(r));

  const useCompactGrid = citedRestaurants.length >= 2;
  const compareFull = ctx.compareIds.length >= 3;

  return (
    <MessagePrimitive.Root className="mb-6 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-brand)] text-white shadow-xs">
          <UtensilsCrossed className="h-4 w-4" />
        </div>

        <div
          className={cn(
            "min-w-0 flex-1 rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed shadow-2xs",
            meta?.isError
              ? "border-amber-400/60 bg-amber-950/20 text-[var(--fg)]"
              : "border-[var(--border)] bg-[var(--bg-bot-bubble)] text-[var(--fg)]",
          )}
        >
          {!meta?.isFallback && citedRestaurants.length > 0 ? (
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--accent-sage-text)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent-coral)]" />
              <span>
                {ctx.language === "es"
                  ? citedRestaurants.length === 1
                    ? "1 recomendación encontrada en tus guías"
                    : `${citedRestaurants.length} recomendaciones encontradas en tus guías`
                  : citedRestaurants.length === 1
                    ? "1 recommendation found in your guides"
                    : `${citedRestaurants.length} recommendations found in your guides`}
              </span>
            </div>
          ) : null}

          {meta?.isError ? (
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-coral)]" />
              <span>{content}</span>
            </div>
          ) : content ? (
            <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-[var(--fg)] text-[var(--fg)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : isLatestStreaming ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--fg-muted)]">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-sage)]" />
              <span>{t.chat.thinking}</span>
            </div>
          ) : null}

          {!meta?.isFallback && meta?.sources && meta.sources.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[var(--border-soft)] pt-2">
              <span className="text-xs font-semibold text-[var(--fg-muted)]">
                {t.chat.basedOn}:
              </span>
              {meta.sources.map((src) => (
                <span
                  key={src}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-sage-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--accent-sage-text)]"
                >
                  <FileText className="h-3 w-3" />
                  {src}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {citedRestaurants.length > 0 ? (
        <div
          className={cn(
            "pl-0 sm:pl-12",
            useCompactGrid ? "grid grid-cols-1 gap-3 xl:grid-cols-2" : "space-y-3",
          )}
        >
          {citedRestaurants.slice(0, 6).map((restaurant, idx) => (
            <RestaurantCard
              key={restaurant.id}
              restaurant={restaurant}
              language={ctx.language}
              compact={useCompactGrid}
              indexBadge={idx + 1}
              isFavorite={ctx.favoriteIds.has(restaurant.id)}
              isCompared={ctx.compareIds.includes(restaurant.id)}
              compareDisabled={compareFull}
              isHighlighted={ctx.highlightedRestaurantId === restaurant.id}
              onToggleFavorite={ctx.onToggleFavorite}
              onToggleCompare={ctx.onToggleCompare}
              onSelect={ctx.onSelectRestaurant}
              onLocate={ctx.onLocateRestaurant}
              onHover={ctx.onHoverRestaurant}
            />
          ))}
        </div>
      ) : null}
    </MessagePrimitive.Root>
  );
}

const MESSAGE_COMPONENTS = {
  UserMessage: UserMessageView,
  AssistantMessage: AssistantMessageView,
};

export function ChatPanel({
  messages,
  isRunning,
  language,
  restaurantsById,
  favoriteIds,
  compareIds,
  highlightedRestaurantId,
  onSendMessage,
  onCancel,
  onToggleFavorite,
  onToggleCompare,
  onSelectRestaurant,
  onLocateRestaurant,
  onHoverRestaurant,
}: ChatPanelProps) {
  const t = getCopy(language);
  const latestMessageId = messages[messages.length - 1]?.id;

  const messageMap = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const contextValue = useMemo<ChatViewContextValue>(
    () => ({
      messageMap,
      latestMessageId,
      isRunning,
      language,
      restaurantsById,
      favoriteIds,
      compareIds,
      highlightedRestaurantId,
      onToggleFavorite,
      onToggleCompare,
      onSelectRestaurant,
      onLocateRestaurant,
      onHoverRestaurant,
    }),
    [
      messageMap,
      latestMessageId,
      isRunning,
      language,
      restaurantsById,
      favoriteIds,
      compareIds,
      highlightedRestaurantId,
      onToggleFavorite,
      onToggleCompare,
      onSelectRestaurant,
      onLocateRestaurant,
      onHoverRestaurant,
    ],
  );

  const convertMessage = (msg: ChatMessage): ThreadMessageLike => {
    if (msg.role === "assistant") {
      return {
        id: msg.id,
        role: "assistant",
        content: [{ type: "text", text: msg.content }],
        status:
          isRunning && msg.id === latestMessageId
            ? { type: "running" }
            : { type: "complete", reason: "stop" },
      };
    }
    return {
      id: msg.id,
      role: "user",
      content: [{ type: "text", text: msg.content }],
    };
  };

  const runtime = useExternalStoreRuntime<ChatMessage>({
    messages,
    isRunning,
    convertMessage,
    onNew: async (appendMsg) => {
      const text = extractText(appendMsg);
      if (text) {
        await onSendMessage(text);
      }
    },
    onCancel,
  });

  return (
    <ChatViewContext.Provider value={contextValue}>
      <AssistantRuntimeProvider runtime={runtime}>
        <section className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xs transition-colors lg:h-[calc(100vh-92px)]">
          {/* Editorial Header */}
          <div className="border-b border-[var(--border-soft)] bg-[var(--bg-card)] px-5 pt-4 pb-3.5">
            <div className="flex items-start gap-2.5">
              <Leaf className="mt-1 h-5 w-5 shrink-0 text-[var(--accent-sage)]" />
              <div>
                <h2 className="font-editorial text-xl font-bold tracking-tight text-[var(--fg)] sm:text-2xl">
                  {t.chat.heading}
                </h2>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--fg-muted)]">
                  {t.chat.subheading}
                </p>
              </div>
            </div>
          </div>

          {/* assistant-ui Thread */}
          <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
            <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-5 py-4">
              <ThreadPrimitive.Empty>
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-soft)] px-6 py-8 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-sage-soft)] text-[var(--accent-sage-text)]">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <p className="font-editorial text-base font-bold text-[var(--fg)]">
                    {language === "es"
                      ? "100 % basado en los 20 PDFs gastronómicos"
                      : "100% grounded in the 20 restaurant PDFs"}
                  </p>
                  <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--fg-muted)]">
                    {language === "es"
                      ? "Prueba una pregunta sugerida abajo o escribe sobre platos, precios, zonas o restaurantes concretos. También puedes seleccionar 2 o 3 locales para compararlos."
                      : "Try a suggested question below or ask about dishes, prices, areas, or specific restaurants. You can also select 2 or 3 venues to compare them side by side."}
                  </p>
                </div>
              </ThreadPrimitive.Empty>

              <ThreadPrimitive.Messages components={MESSAGE_COMPONENTS} />
            </ThreadPrimitive.Viewport>

            {/* Suggested prompts + Composer */}
            <div className="border-t border-[var(--border-soft)] bg-[var(--bg-soft)] px-4 py-3">
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {t.chat.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={isRunning}
                    onClick={() => void onSendMessage(suggestion)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--fg)] transition-colors hover:border-[var(--accent-sage)] hover:bg-[var(--accent-sage-soft)] disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className="h-3 w-3 text-[var(--accent-coral)]" />
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>

              <ComposerPrimitive.Root className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 shadow-2xs focus-within:border-[var(--accent-sage)] focus-within:ring-2 focus-within:ring-[var(--accent-sage)]/20">
                <ComposerPrimitive.Input
                  placeholder={t.chat.placeholder}
                  rows={1}
                  className="max-h-28 flex-1 resize-none bg-transparent text-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] focus:outline-none"
                />
                {isRunning ? (
                  <ComposerPrimitive.Cancel asChild>
                    <button
                      type="button"
                      aria-label="Stop"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-brand)] text-white hover:opacity-90 cursor-pointer"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                    </button>
                  </ComposerPrimitive.Cancel>
                ) : (
                  <ComposerPrimitive.Send asChild>
                    <button
                      type="submit"
                      aria-label="Send"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] transition-colors hover:bg-[var(--accent-sage-hover)] disabled:opacity-40 cursor-pointer"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </ComposerPrimitive.Send>
                )}
              </ComposerPrimitive.Root>
            </div>
          </ThreadPrimitive.Root>
        </section>
      </AssistantRuntimeProvider>
    </ChatViewContext.Provider>
  );
}

/**
 * The grammy bot: command wiring, callback wiring, and the one send path the
 * poller uses.
 *
 * Slash commands live in `src/commands/`, one self-contained module per
 * command: each declares its own name, visibility, authorization and handler,
 * and registers itself through `defineCommand`. This file only builds the bot,
 * walks the registry, and owns the notifier the poller sends through — so
 * adding a command no longer means editing this file.
 *
 * The bot half is deliberately thin. It answers public status and contract
 * commands plus operator pause/resume controls. Operator controls only change
 * when the next polling cycle starts; they never edit cursors or touch chain
 * state. All chain logic lives in `src/poller.ts` and `src/stellar/`.
 */

import { Bot, type Context, type CommandContext } from "grammy";

import {
  safeErrorMessage,
  splitTelegramMessage,
  type ExplorerKeyboard,
} from "./notifications/format.js";
export { previewMessage } from "./notifications/format.js";
import { type BotConfig } from "./config.js";
import type { ContractSource } from "./stellar/decode.js";

// Importing the catalogue registers every command module as a side effect.
import {
  CALLBACK_PAUSE_CANCEL,
  CALLBACK_PAUSE_CONFIRM,
  chatAllowed,
  commandMetadata,
  operatorAllowed,
  registeredCommands,
  visibleCommandMetadata,
  type CommandDeps,
  type CommandModule,
} from "./commands/index.js";
import { handlePauseConfirmCallback, registerCallbackHandlers } from "./callbacks.js";

// ── Public surface ───────────────────────────────────────────────────────────
// bot.ts stays the stable entry point for index.ts and the tests; the
// implementations live with the commands.

export { helpDetailMessage, COMMAND_DETAILS, type CommandDetail } from "./commands/help-detail.js";
export {
  CALLBACK_PAUSE_CANCEL,
  CALLBACK_PAUSE_CONFIRM,
  contractsKeyboard,
  operatorKeyboard,
  pauseConfirmKeyboard,
  statusKeyboard,
} from "./commands/keyboards.js";
export { TELEGRAM_OPTIONS, isChatAllowed, isOperator } from "./commands/runtime.js";
export {
  aboutMessage,
  helpMessage,
  contractsMessage,
  healthMessage,
  lastEventMessage,
  pauseMessage,
  resumeMessage,
  statusMessage,
} from "./commands/index.js";
export {
  CALLBACK_FALLBACK_FEEDBACK,
  CALLBACK_FALLBACK_PAYLOAD,
  CALLBACK_UNAUTHORIZED_FEEDBACK,
  CALLBACK_UNAUTHORIZED_PAYLOAD,
  PAUSE_CONFIRM_TTL_MS,
  TELEGRAM_CALLBACK_DATA_MAX_BYTES,
  handleCallbackQuery,
  handlePauseConfirmCallback,
  registerCallbackHandlers,
  updateOrReplyMessage,
  validateCallbackData,
  validatePauseConfirmData,
  type CallbackActionType,
  type CallbackValidationResult,
  type ValidCallbackAction,
} from "./callbacks.js";
import { registerBroadcastHandlers } from "./commands/broadcast.js";
export {
  handleBroadcastCallback,
  registerBroadcastHandlers,
  handleBroadcastCommand,
  getConfiguredBroadcastChats,
  BroadcastStore,
  sendBroadcast,
} from "./commands/broadcast.js";

/**
 * Telegram bot tokens have the shape `<digits>:<35+ url-safe chars>`.
 * Values pasted from dashboards frequently arrive wrapped in quotes or with
 * trailing whitespace/newlines, which only surface as a `getMe` failure at
 * startup. Validate the shape up front and name the problem without ever
 * echoing the token (or any part of it) into a message or log.
 */
export type BotTokenShapeProblem =
  | "empty"
  | "surrounding-quotes"
  | "whitespace"
  | "missing-colon"
  | "bad-prefix"
  | "bad-suffix"
  | "wrong-shape";

export interface BotTokenShapeResult {
  ok: boolean;
  problem?: BotTokenShapeProblem;
  message?: string;
}

const BOT_TOKEN_SHAPE = /^\d+:[A-Za-z0-9_-]{35,}$/;

/**
 * Validate a `BOT_TOKEN` value without ever including the token (or any
 * substring of it) in the returned message. The messages are intentionally
 * generic so they are safe to log and to surface in a startup error.
 *
 * Exported for embedders and for callers that build a bot from their own
 * configuration; `loadConfig` applies the same rules at startup, so
 * `createBot` does not reject placeholder tokens.
 */
export function validateBotTokenShape(raw: unknown): BotTokenShapeResult {
  if (typeof raw !== "string" || raw.length === 0) {
    return {
      ok: false,
      problem: "empty",
      message: "BOT_TOKEN is empty; expected <digits>:<35+ url-safe chars>.",
    };
  }

  // Surrounding quotes are the most common paste artefact.
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return {
      ok: false,
      problem: "surrounding-quotes",
      message:
        "BOT_TOKEN is wrapped in quotes; remove the surrounding quotes and retry.",
    };
  }

  // Any whitespace anywhere (leading, trailing, or embedded) is rejected.
  if (/\s/.test(raw)) {
    return {
      ok: false,
      problem: "whitespace",
      message:
        "BOT_TOKEN contains whitespace (leading, trailing, or embedded); trim it and retry.",
    };
  }

  if (!raw.includes(":")) {
    return {
      ok: false,
      problem: "missing-colon",
      message: "BOT_TOKEN is missing the ':' separator; expected <digits>:<35+ url-safe chars>.",
    };
  }

  if (!BOT_TOKEN_SHAPE.test(raw)) {
    return {
      ok: false,
      problem: "wrong-shape",
      message:
        "BOT_TOKEN has the wrong shape; expected <digits>:<35+ url-safe chars>.",
    };
  }

  return { ok: true };
}

/**
 * Shared metadata for handlers, help, and Telegram's command menu.
 *
 * Derived from the registry: a command module is the single place that decides
 * whether a command exists, so this list cannot drift from what is registered.
 */
export const COMMANDS = commandMetadata();

/** Everything a command handler may need. Kept as an alias for callers/tests. */
export type BotDeps = CommandDeps;

/** Register command handlers on a grammy-compatible bot (also useful in tests). */
export function registerCommandHandlers(
  bot: Bot | {
    command: (name: string, handler: (ctx: CommandContext<Context>) => Promise<void>) => unknown;
    callbackQuery?: (filter: string | string[], handler: (ctx: Context) => Promise<void>) => unknown;
  },
  deps: BotDeps,
): void {
  const registrar = bot as {
    command: (name: string, handler: (ctx: CommandContext<Context>) => Promise<void>) => unknown;
    callbackQuery?: (filter: string | string[], handler: (ctx: Context) => Promise<void>) => unknown;
  };

  for (const module of registeredCommands()) {
    registrar.command(module.command, (ctx) => dispatch(module, ctx, deps));
  }

  // The pause confirmation prompt is produced by /pause, so its buttons are
  // registered alongside it rather than with the generic action callbacks.
  registrar.callbackQuery?.(
    [CALLBACK_PAUSE_CONFIRM, CALLBACK_PAUSE_CANCEL],
    async (ctx: Context) =>
      handlePauseConfirmCallback(ctx, {
        config: deps.config,
        pause: deps.pause ?? (() => "stopped"),
      }),
  );
}

/**
 * Run one command module: apply the authorization its metadata declares, then
 * the handler. Gating here — instead of inside each handler — means a new
 * operator-only or allowlisted command cannot forget its check.
 */
function dispatch(
  module: CommandModule,
  ctx: CommandContext<Context>,
  deps: BotDeps,
): Promise<void> {
  if (module.operatorOnly === true && !operatorAllowed(ctx, deps.config, module.command)) {
    return Promise.resolve();
  }
  if (module.chatAllowlist === true && !chatAllowed(ctx, deps.config, module.command)) {
    return Promise.resolve();
  }
  return module.handler(ctx, deps);
}

export function createBot(deps: BotDeps): Bot {
  const clientOptions =
    deps.config.telegramApiRoot !== undefined && deps.config.telegramApiRoot !== null
      ? { client: { apiRoot: deps.config.telegramApiRoot } }
      : undefined;
  // Token shape is validated by `loadConfig` at startup, where the operator
  // can act on the message (`BOT_TOKEN is not a valid Telegram bot token: …`).
  // It is deliberately not re-litigated here: `createBot` is also the entry
  // point for tests and embedders that never speak to Telegram, and a
  // placeholder token must not stop them building a bot.
  const bot = new Bot(
    deps.config.botToken,
    deps.botInfo !== undefined
      ? { botInfo: deps.botInfo, ...clientOptions }
      : clientOptions,
  );
  registerCommandHandlers(bot, deps);
  registerCallbackHandlers(bot, deps);
  registerBroadcastHandlers(bot, deps);

  // grammy rethrows handler errors by default, which would take the process
  // with it. Keep Telegram/RPC error text bounded and redact known secrets.
  bot.catch((err) => {
    console.error(
      `[bot] handler error on update ${err.ctx.update.update_id}: ` +
        safeErrorMessage(err.error, [deps.config.botToken]),
    );
  });

  return bot;
}

/** Extra Telegram send options the poller may attach to a notification. */
export interface SendExtra {
  reply_markup?: ExplorerKeyboard | undefined;
  /**
   * Plain-text rendering of the same notification, sent without a `parse_mode`
   * when Telegram rejects the MarkdownV2 version for entity/parse reasons.
   * Optional: without it the notifier behaves exactly as before (parse errors
   * propagate, no second send). Empty or whitespace-only values count as absent.
   */
  plainText?: string | undefined;
  /**
   * Bounded identifiers for fallback logging only. Optional; never sent.
   */
  eventRef?: { eventId?: string | undefined; ledger?: number | undefined; source?: string | undefined } | undefined;
  /**
   * Post the notification as a reply to this message, for chats that thread
   * their notifications. Optional: omitted from the payload entirely when
   * absent, so the send is byte-identical to the unthreaded one.
   */
  replyToMessageId?: number | undefined;
}

/**
 * True when a Telegram send failed because the message text could not be
 * parsed as MarkdownV2 entities.
 *
 * grammy (1.x) surfaces Bot API failures as `GrammyError` with `error_code`
 * and `description` straight from Telegram, e.g. error 400 with
 * `"Bad Request: can't parse entities: …"` or `"… can't find end of the
 * entity …"`. The classifier matches that shape — error 400 plus the
 * entity-parse phrasing — so rate limits (429), auth failures (401), chat
 * errors, and network `HttpError`s never qualify. Duck-typed errors carrying
 * the same Telegram description (mocks, wrapped rejections) match on the
 * phrasing alone when no numeric `error_code` is present.
 */
export function isMarkdownParseError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const record = err as { error_code?: unknown; description?: unknown; message?: unknown };
  const text = [record.description, record.message]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" ");
  if (!/can't parse entities|can't find end of the entity/i.test(text)) return false;
  if (typeof record.error_code === "number") return record.error_code === 400;
  return true;
}

/** Bounded log fragment identifying which event a fallback send belongs to. */
function eventRefLabel(eventRef: SendExtra["eventRef"]): string {
  if (!eventRef) return "";
  const parts: string[] = [];
  if (typeof eventRef.source === "string" && eventRef.source) parts.push(eventRef.source);
  if (typeof eventRef.ledger === "number" && Number.isFinite(eventRef.ledger)) {
    parts.push(`ledger ${eventRef.ledger}`);
  }
  if (typeof eventRef.eventId === "string" && eventRef.eventId) parts.push(eventRef.eventId);
  return parts.length > 0 ? ` (${parts.join(" ")})` : "";
}

/**
 * Sends suppressed by the empty-message guard, counted so callers (and the
 * empty-text tests) can prove a blank render never reached the Telegram API.
 */
export const notifierSkips = { emptyText: 0 };

/**
 * The poller's send path: route each contract's messages to its named chat,
 * with the event's explorer button when `extra.reply_markup` is set.
 *
 * MarkdownV2 first; exactly one plain-text retry when Telegram rejects the
 * entities *and* the caller supplied a non-blank `extra.plainText`. The retry
 * carries no `parse_mode`, so it cannot fail the same way. Every other failure —
 * network, rate limit, auth, unknown chats, or a failed plain-text retry —
 * propagates unchanged, preserving the poller's existing error/cursor
 * accounting. An oversized payload is split into chunks and an
 * unspecified one into a single call, so the MarkdownV2-to-plain-text
 * retry happens at most once per chunk, never in a loop.
 *
 * A rendering that is empty, whitespace-only, or not a string at all is
 * skipped before any API call: Telegram rejects blank message text with a
 * 400, and a formatters' `null` must never turn into a doomed send. The skip
 * is counted in {@link notifierSkips} and logged with bounded metadata.
 */
export function createNotifier(
  bot: Pick<Bot, "api">,
  config: Pick<BotConfig, "chatId" | "marketChatId" | "squadChatId" | "botToken"> &
    Partial<Pick<BotConfig, "chatIds" | "linkPreviewMarket" | "linkPreviewSquad">>,
) {
  return async (
    text: string | null,
    source?: ContractSource,
    extra?: SendExtra,
  ): Promise<void> => {
    if (typeof text !== "string" || text.trim() === "") {
      notifierSkips.emptyText += 1;
      // Only bounded metadata: which chat path and how short the render was —
      // never the payload itself.
      console.warn(
        `[notifier] skipped empty message${eventRefLabel(extra?.eventRef)} ` +
          `(source=${typeof source === "string" && source ? source.slice(0, 32) : "default"}, ` +
          `chars=${typeof text === "string" ? text.length : -1})`,
      );
      return;
    }

    const defaultChat = config.chatId ?? config.chatIds?.[0] ?? "";
    const chatId = source === "market"
      ? config.marketChatId || defaultChat
      : source === "squad"
        ? config.squadChatId || defaultChat
        : defaultChat;

    // Select link preview settings based on the contract source.
    // Commands (where source is undefined) always use TELEGRAM_OPTIONS (disabled).
    const linkPreviewDisabled = source === "market"
      ? !config.linkPreviewMarket
      : source === "squad"
        ? !config.linkPreviewSquad
        : true;

    const notificationOptions = {
      parse_mode: "MarkdownV2" as const,
      link_preview_options: { is_disabled: linkPreviewDisabled },
    };

    // Oversized payloads go out as ordered chunks under Telegram's limit. The
    // thread reply rides on the first chunk and the explorer button on the
    // last, so the message reads exactly like the unsplit one.
    const parts = splitTelegramMessage(text);
    if (parts.length > 1) {
      for (const [index, part] of parts.entries()) {
        await bot.api.sendMessage(chatId, part, {
          ...notificationOptions,
          ...(index === parts.length - 1 && extra?.reply_markup
            ? { reply_markup: extra.reply_markup }
            : {}),
          ...(index === 0 && extra?.replyToMessageId !== undefined
            ? { reply_parameters: { chat_id: chatId, message_id: extra.replyToMessageId } }
            : {}),
        });
      }
      return;
    }

    try {
      await bot.api.sendMessage(chatId, text, {
        ...notificationOptions,
        ...(extra?.reply_markup ? { reply_markup: extra.reply_markup } : {}),
        ...(extra?.replyToMessageId !== undefined
          ? { reply_parameters: { chat_id: chatId, message_id: extra.replyToMessageId } }
          : {}),
      });
      return;
    } catch (err) {
      // A blank fallback is no fallback: sending whitespace-only text would
      // just draw the same 400, so the original parse error propagates.
      const fallback = extra?.plainText;
      if (typeof fallback !== "string" || fallback.trim() === "" || !isMarkdownParseError(err)) {
        throw err;
      }
      // Only bounded metadata is logged: the fallback outcome, the safe error
      // category, and the caller-supplied event reference — never message
      // text, tokens, or remote payloads.
      console.warn(
        `[notifier] MarkdownV2 rejected${eventRefLabel(extra?.eventRef)}, ` +
          `retrying as plain text: ${safeErrorMessage(
            err,
            typeof config.botToken === "string" ? [config.botToken] : [],
          )}`,
      );
      // Plain text (no parse mode), same per-source link preview setting.
      await bot.api.sendMessage(chatId, fallback, {
        link_preview_options: notificationOptions.link_preview_options,
        ...(extra?.reply_markup ? { reply_markup: extra.reply_markup } : {}),
        ...(extra?.replyToMessageId !== undefined
          ? { reply_parameters: { chat_id: chatId, message_id: extra.replyToMessageId } }
          : {}),
      });
    }
  };
}

/** Registers the command list so Telegram's UI offers autocompletion. */
export async function registerCommands(bot: Bot, config?: BotConfig): Promise<void> {
  try {
    await bot.api.setMyCommands(
      visibleCommandMetadata(config).map(({ command, description }) => ({ command, description })),
    );
  } catch (err) {
    // Cosmetic. Never worth failing a boot over, and never log an unbounded API error.
    console.warn(`[bot] setMyCommands failed: ${safeErrorMessage(err)}`);
  }
}

/**
 * Localization strings for the Mimir Telegram notifier.
 *
 * All user-facing text lives here. Callers interpolate dynamic values (ledger
 * numbers, addresses, amounts) at the call site — the localization layer
 * provides the template; the caller provides the variables.
 *
 * ── MarkdownV2 notes ────────────────────────────────────────────────────────
 * Static strings that will be sent to Telegram via MarkdownV2 are stored
 * pre-escaped where they contain reserved characters. Dynamic interpolations
 * are the caller's responsibility and must pass through `escapeMd` before
 * being spliced in. Plain-text strings (used without a parse_mode) are stored
 * as-is; they never contain Markdown syntax.
 *
 * ── Adding a string ─────────────────────────────────────────────────────────
 * 1. Add the constant to the appropriate namespace below.
 * 2. Replace the inline literal in the source file with a reference.
 * 3. Add a test in tests/i18n.test.mjs that imports the key and asserts both
 *    the value and that the caller substitutes dynamic parts correctly.
 * 4. Add the key to `Messages` below (the base bundle's shape) and either
 *    translate it in every locale bundle or let it fall back to English.
 *
 * ── Choosing a language ─────────────────────────────────────────────────────
 * The exported constants below are the English base bundle, kept as named
 * exports so existing callers and tests keep importing them directly. Runtimes
 * that render for a configured audience instead read the active bundle through
 * {@link messages}, which {@link setLocale} points at one of the locale bundles
 * ({@link getMessages}). `BOT_LOCALE` selects it at boot (see src/config.ts).
 * A bundle may translate only part of the base: omitted keys fall back to
 * English, so a translation can land incrementally without breaking a build.
 */

// ── Bot: help and lifecycle ──────────────────────────────────────────────────

/** Help title (MarkdownV2). */
export const HELP_TITLE = "*Mimir notifier*";

/**
 * Help intro (plain text). The caller escapes it with `escapeMd`; the command
 * lines are generated from the command registry and COMMAND_DESCRIPTIONS.
 */
export const HELP_INTRO =
  "I watch Mimir's two Soroban contracts on Stellar and post every new on-chain event here: claims opened, challenges staked, oracle resolutions, settlements and payouts.";

// ── Bot: operator controls (MarkdownV2) ─────────────────────────────────────

export const PAUSE_MESSAGES = {
  paused:
    "*Polling paused*\nThe current scan may finish, but no new cycle will start\\. Cursors were not changed\\.",
  alreadyPaused: "*Polling is already paused*",
  stopped: "*Polling cannot pause* — the process is stopping\\.",
} as const;

export const RESUME_MESSAGES = {
  resumed: "*Polling resumed*\nThe next scan starts now\\. Cursors were not changed\\.",
  alreadyRunning: "*Polling is already running*",
  stopped: "*Polling cannot resume* — the process is stopping\\.",
} as const;

// ── Bot: audit command ───────────────────────────────────────────────────────

/**
 * Hint displayed after the audit report, pointing operators to the standalone
 * CLI. Plain text (the audit reply has no parse_mode).
 */
export const AUDIT_CLI_HINT =
  "See `npm run audit -- --help` for the standalone report tool.";

// ── Telegram command descriptions (shown in the UI autocomplete) ─────────────

/** Descriptions registered with `setMyCommands`. */
export const COMMAND_DESCRIPTIONS = {
  start: "What this bot does",
  help: "Show help",
  about: "About this bot",
  status: "Last-seen ledger and watched contracts",
  audit: "Operator only: audit report (redacted, bounded)",
  contracts: "Contract ids and explorer links",
  health: "Health assessment and operational readiness",
  preview: "Preview channel notification formatting",
  pause: "Operator only: pause new scans",
  resume: "Operator only: resume polling now",
} as const;

// ── Notifications: event headlines (MarkdownV2) ──────────────────────────────
// Template functions. Every dynamic value is supplied by the caller and must
// already be escapeMd-escaped before being passed in. Static reserved chars
// inside the template strings are pre-escaped here.

export const NOTIFICATION_MD = {
  // ── mimir-market ────────────────────────────────────────────────────────
  /** @param claimId already-escaped string, e.g. "7" */
  claimCreated: (claimId: string, category: string, creator: string): string =>
    `🆕 *New claim* \\#${claimId}\nCategory: ${category}\nCreator: ${creator}`,

  claimChallenged: (claimId: string, stake: string, challenger: string): string =>
    `⚔️ *Claim \\#${claimId} challenged*\nStake: *${stake}*\nChallenger: ${challenger}`,

  claimResolved: (
    claimId: string,
    winnerSide: string,
    confidence: string,
    summary: string | null,
  ): string =>
    (
      `⚖️ *Claim \\#${claimId} resolved* — winner: *${winnerSide}*\n` +
      `Confidence: ${confidence}\n` +
      (summary ? `_${summary}_` : "")
    ).trimEnd(),

  claimCancelled: (claimId: string): string =>
    `🚫 *Claim \\#${claimId} cancelled* — stakes returned`,

  marketSettled: (
    claimId: string,
    totalPaid: string,
    totalFees: string,
    owedToChallengers: string,
    ...rest: (readonly string[] | string | undefined)[]
  ): string => {
    const lines = rest[0];
    const linesPart = Array.isArray(lines)
      ? `\n${lines.join("\n")}`
      : typeof lines === "string" && lines.length > 0
        ? `\n${lines}`
        : "";
    if (linesPart) {
      return `💰 *Claim \\#${claimId} settled*\nPaid out: *${totalPaid}* · fees ${totalFees}${linesPart}`;
    }
    return `💰 *Claim \\#${claimId} settled*\nPaid out: *${totalPaid}* · fees ${totalFees}\nOwed to challengers: ${owedToChallengers}`;
  },

  challengerPaid: (
    claimId: string,
    challenger: string,
    stake: string,
    net: string,
    gross: string,
    fee: string,
  ): string =>
    `🏆 *Challenger paid* on claim \\#${claimId}\n${challenger} staked ${stake} → net *${net}*\nGross ${gross} · fee ${fee}`,

  feeClaimed: (amount: string, recipient: string): string =>
    `🧾 *Fees claimed* — ${amount} to ${recipient}`,

  withdrawal: (amount: string, to: string): string =>
    `📤 *Withdrawal* — ${amount} to ${to}`,

  withdrawalPending: (amount: string, to: string): string =>
    `⏳ *Withdrawal parked* — ${amount} claimable by ${to}`,

  // ── mimir-squad ─────────────────────────────────────────────────────────
  marketCreated: (
    marketId: string,
    question: string,
    captain: string,
    feeBps: string,
    deadline: string,
    category?: string | null,
  ): string =>
    (
      `🆕 *New squad market* \\#${marketId}\n${question}\nCaptain: ${captain} · fee ${feeBps} bps · deadline ${deadline}` +
      (category ? `\nCategory: ${category}` : "")
    ),

  deposited: (marketId: string, amount: string, side: string, participant: string): string =>
    `➕ *Squad \\#${marketId}* — ${amount} on *${side}*\nParticipant: ${participant}`,

  withdrawn: (marketId: string, participant: string, amount: string, side: string): string =>
    `➖ *Squad \\#${marketId}* — ${participant} pulled ${amount} from ${side}`,

  resolved: (marketId: string, result: string, poolA: string, poolB: string): string =>
    `🏁 *Squad \\#${marketId} resolved* — *${result}*\nPools: A ${poolA} · B ${poolB}`,

  claimed: (
    marketId: string,
    participant: string,
    net: string,
    gross: string,
    fee: string,
  ): string =>
    `💸 *Squad payout* on \\#${marketId}\n${participant} → net *${net}* \\(gross ${gross}, fee ${fee}\\)`,

  feesClaimedSquad: (amount: string, recipient: string): string =>
    `🧾 *Squad fees claimed* — ${amount} to ${recipient}`,

  // ── Fallback ─────────────────────────────────────────────────────────────
  /**
   * Sent when an event payload is malformed or the formatter throws.
   * All parameters must already be escapeMd-escaped.
   */
  fallbackEvent: (
    source: string,
    contract: string,
    ledger: string,
    reason: string,
    txPart: string,
  ): string =>
    `⚠️ *Event Notification Fallback* \\(${source}\\)\nContract: \`${contract}\` · Ledger: ${ledger}${txPart}\nReason: _${reason}_`,

  // ── Preview mode prefix ──────────────────────────────────────────────────
  previewModePrefix: "🧪 *[PREVIEW MODE]*",

  // ── Channel preview headers ──────────────────────────────────────────────
  channelPreviewMarket: "🧪 *Channel Preview — mimir\\-market*",
  channelPreviewSquad: "🧪 *Channel Preview — mimir\\-squad*",
} as const;

// ── Notifications: event headlines (plain text) ──────────────────────────────
// Mirror of NOTIFICATION_MD for use without a parse_mode. No Markdown at all.

export const NOTIFICATION_PLAIN = {
  // ── mimir-market ────────────────────────────────────────────────────────
  claimCreated: (claimId: string | number, category: string, creator: string): string =>
    `New claim #${claimId}\nCategory: ${category}\nCreator: ${creator}`,

  claimChallenged: (
    claimId: string | number,
    stake: string,
    challenger: string,
  ): string =>
    `Claim #${claimId} challenged\nStake: ${stake}\nChallenger: ${challenger}`,

  claimResolved: (
    claimId: string | number,
    winnerSide: string,
    confidence: string,
    summary: string | null,
  ): string =>
    `Claim #${claimId} resolved — winner: ${winnerSide}\nConfidence: ${confidence}` +
    (summary ? `\n${summary}` : ""),

  claimCancelled: (claimId: string | number): string =>
    `Claim #${claimId} cancelled — stakes returned`,

  marketSettled: (
    claimId: string | number,
    totalPaid: string,
    totalFees: string,
    owedToChallengers: string,
    ...rest: (readonly string[] | string | undefined)[]
  ): string => {
    const lines = rest[0];
    const linesPart = Array.isArray(lines)
      ? `\n${lines.join("\n")}`
      : typeof lines === "string" && lines.length > 0
        ? `\n${lines}`
        : "";
    if (linesPart) {
      return `Claim #${claimId} settled\nPaid out: ${totalPaid} · fees ${totalFees}${linesPart}`;
    }
    return `Claim #${claimId} settled\nPaid out: ${totalPaid} · fees ${totalFees}\nOwed to challengers: ${owedToChallengers}`;
  },

  challengerPaid: (
    claimId: string | number,
    challenger: string,
    stake: string,
    net: string,
    gross: string,
    fee: string,
  ): string =>
    `Challenger paid on claim #${claimId}\n${challenger} staked ${stake} → net ${net}\nGross ${gross} · fee ${fee}`,

  feeClaimed: (amount: string, recipient: string): string =>
    `Fees claimed — ${amount} to ${recipient}`,

  withdrawal: (amount: string, to: string): string =>
    `Withdrawal — ${amount} to ${to}`,

  withdrawalPending: (amount: string, to: string): string =>
    `Withdrawal parked — ${amount} claimable by ${to}`,

  // ── mimir-squad ─────────────────────────────────────────────────────────
  marketCreated: (
    marketId: string | number,
    question: string,
    captain: string,
    feeBps: string,
    deadline: string,
    category?: string | null,
  ): string =>
    (
      `New squad market #${marketId}\n${question}\nCaptain: ${captain} · fee ${feeBps} bps · deadline ${deadline}` +
      (category ? `\nCategory: ${category}` : "")
    ),

  deposited: (
    marketId: string | number,
    amount: string,
    side: string,
    participant: string,
  ): string =>
    `Squad #${marketId} — ${amount} on ${side}\nParticipant: ${participant}`,

  withdrawn: (
    marketId: string | number,
    participant: string,
    amount: string,
    side: string,
  ): string =>
    `Squad #${marketId} — ${participant} pulled ${amount} from ${side}`,

  resolved: (
    marketId: string | number,
    result: string,
    poolA: string,
    poolB: string,
  ): string =>
    `Squad #${marketId} resolved — ${result}\nPools: A ${poolA} · B ${poolB}`,

  claimed: (
    marketId: string | number,
    participant: string,
    net: string,
    gross: string,
    fee: string,
  ): string =>
    `Squad payout on #${marketId}\n${participant} → net ${net} (gross ${gross}, fee ${fee})`,

  feesClaimedSquad: (amount: string, recipient: string): string =>
    `Squad fees claimed — ${amount} to ${recipient}`,

  /**
   * Last-resort one-liner when even the plain-text formatter cannot render.
   * Never returns an empty string.
   */
  minimal: (source: string, ledger: string, eventId: string): string => {
    const idPart = eventId ? ` (${eventId})` : "";
    return `Mimir event (${source}) — ${ledger}${idPart}`;
  },
} as const;

// ── Explorer button ──────────────────────────────────────────────────────────

/** Text shown on the Telegram inline keyboard button for explorer links. */
export const EXPLORER_BUTTON_TEXT = "View on Explorer";

/**
 * Text shown on the Telegram inline keyboard button that opens the Mimir web
 * app (see `MIMIR_APP_URL`). Absent from a keyboard when no URL is configured.
 */
export const MIMIR_APP_BUTTON_TEXT = "Open in Mimir";

// ── Settlement breakdown labels ─────────────────────────────────────────────

/**
 * Row labels for the settlement accounting lines (`src/notifications/
 * settlement.ts`). Plain text: the lines are escaped by the caller when the
 * message is MarkdownV2.
 */
export const SETTLEMENT_LABELS = {
  owedToChallengers: "Owed to challengers",
  totalFees: "Total fees",
  dust: "Dust",
} as const;

// ── Locale registry ─────────────────────────────────────────────────────────

/**
 * String shape a locale must provide: the base bundle with literal string types
 * widened, so a translation is typed like the English original instead of
 * having to reproduce its exact text.
 */
export type DeepWiden<T> = T extends string
  ? string
  : T extends (...args: infer A) => string
    ? (...args: A) => string
    : T extends object
      ? { -readonly [K in keyof T]: DeepWiden<T[K]> }
      : T;

/** Every user-facing string the bot can render, in one bundle. */
export interface Messages {
  HELP_TITLE: string;
  HELP_INTRO: string;
  PAUSE_MESSAGES: DeepWiden<typeof PAUSE_MESSAGES>;
  RESUME_MESSAGES: DeepWiden<typeof RESUME_MESSAGES>;
  AUDIT_CLI_HINT: string;
  COMMAND_DESCRIPTIONS: DeepWiden<typeof COMMAND_DESCRIPTIONS>;
  NOTIFICATION_MD: DeepWiden<typeof NOTIFICATION_MD>;
  NOTIFICATION_PLAIN: DeepWiden<typeof NOTIFICATION_PLAIN>;
  EXPLORER_BUTTON_TEXT: string;
  MIMIR_APP_BUTTON_TEXT: string;
  SETTLEMENT_LABELS: DeepWiden<typeof SETTLEMENT_LABELS>;
}

/**
 * A translation bundle. Every key is optional at both levels — a table is
 * merged key-by-key over English, and a nested table may translate any subset
 * of its entries.
 */
export type MessageOverrides = {
  [K in keyof Messages]?: Messages[K] extends (...args: never[]) => string
    ? Messages[K]
    : Messages[K] extends object
      ? { [P in keyof Messages[K]]?: Messages[K][P] }
      : Messages[K];
};

/** Languages the bot ships with. `en` is the base and the fallback. */
export const SUPPORTED_LOCALES = ["en", "es"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Used when nothing selects a language, and whenever a key is untranslated. */
export const DEFAULT_LOCALE: Locale = "en";

const EN_MESSAGES: Messages = {
  HELP_TITLE,
  HELP_INTRO,
  PAUSE_MESSAGES,
  RESUME_MESSAGES,
  AUDIT_CLI_HINT,
  COMMAND_DESCRIPTIONS,
  NOTIFICATION_MD,
  NOTIFICATION_PLAIN,
  EXPLORER_BUTTON_TEXT,
  MIMIR_APP_BUTTON_TEXT,
  SETTLEMENT_LABELS,
};

function isMessageTable(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Merge a (possibly partial) translation over the English base. */
function mergeOverrides(base: Messages, overrides: MessageOverrides): Messages {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const current = merged[key];
    merged[key] =
      isMessageTable(current) && isMessageTable(value) ? { ...current, ...value } : value;
  }
  return merged as unknown as Messages;
}

// ── Spanish (es) ────────────────────────────────────────────────────────────
// MarkdownV2 strings are pre-escaped exactly like the English originals; the
// caller still escapes every dynamic interpolation.

const ES_OVERRIDES: MessageOverrides = {
  HELP_TITLE: "*Notificador de Mimir*",
  HELP_INTRO:
    "Vigilo los dos contratos Soroban de Mimir en Stellar y publico aquí cada evento nuevo on-chain: reclamaciones abiertas, desafíos con stake, resoluciones del oráculo, liquidaciones y pagos.",

  PAUSE_MESSAGES: {
    paused:
      "*Sondeo pausado*\nEl escaneo actual puede terminar, pero no se iniciará un ciclo nuevo\\. Los cursores no se modificaron\\.",
    alreadyPaused: "*El sondeo ya está pausado*",
    stopped: "*No se puede pausar* — el proceso se está deteniendo\\.",
  },
  RESUME_MESSAGES: {
    resumed:
      "*Sondeo reanudado*\nEl próximo escaneo comienza ahora\\. Los cursores no se modificaron\\.",
    alreadyRunning: "*El sondeo ya está en marcha*",
    stopped: "*No se puede reanudar* — el proceso se está deteniendo\\.",
  },

  AUDIT_CLI_HINT:
    "Consulta `npm run audit -- --help` para la herramienta de informes independiente.",

  COMMAND_DESCRIPTIONS: {
    start: "Qué hace este bot",
    help: "Mostrar ayuda",
    about: "Acerca de este bot",
    status: "Último ledger visto y contratos vigilados",
    audit: "Solo operadores: informe de auditoría (redactado y acotado)",
    contracts: "IDs de contrato y enlaces al explorador",
    health: "Evaluación de salud y preparación operativa",
    preview: "Previsualizar el formato de las notificaciones del canal",
    pause: "Solo operadores: pausar escaneos nuevos",
    resume: "Solo operadores: reanudar el sondeo ahora",
  },

  NOTIFICATION_MD: {
    claimCreated: (claimId: string, category: string, creator: string): string =>
      `🆕 *Nueva reclamación* \\#${claimId}\nCategoría: ${category}\nCreador: ${creator}`,

    claimChallenged: (claimId: string, stake: string, challenger: string): string =>
      `⚔️ *Reclamación \\#${claimId} desafiada*\nStake: *${stake}*\nDesafiante: ${challenger}`,

    claimResolved: (
      claimId: string,
      winnerSide: string,
      confidence: string,
      summary: string | null,
    ): string =>
      (
        `⚖️ *Reclamación \\#${claimId} resuelta* — ganador: *${winnerSide}*\n` +
        `Confianza: ${confidence}\n` +
        (summary ? `_${summary}_` : "")
      ).trimEnd(),

    claimCancelled: (claimId: string): string =>
      `🚫 *Reclamación \\#${claimId} cancelada* — stakes devueltos`,

    marketSettled: (
      claimId: string,
      totalPaid: string,
      totalFees: string,
      owedToChallengers: string,
      ...rest: (readonly string[] | string | undefined)[]
    ): string => {
      const lines = rest[0];
      const linesPart = Array.isArray(lines)
        ? `\n${lines.join("\n")}`
        : typeof lines === "string" && lines.length > 0
          ? `\n${lines}`
          : "";
      if (linesPart) {
        return `💰 *Reclamación \\#${claimId} liquidada*\nPagado: *${totalPaid}* · comisiones ${totalFees}${linesPart}`;
      }
      return `💰 *Reclamación \\#${claimId} liquidada*\nPagado: *${totalPaid}* · comisiones ${totalFees}\nAdeudado a desafiantes: ${owedToChallengers}`;
    },

    challengerPaid: (
      claimId: string,
      challenger: string,
      stake: string,
      net: string,
      gross: string,
      fee: string,
    ): string =>
      `🏆 *Desafiante pagado* en la reclamación \\#${claimId}\n${challenger} apostó ${stake} → neto *${net}*\nBruto ${gross} · comisión ${fee}`,

    feeClaimed: (amount: string, recipient: string): string =>
      `🧾 *Comisiones cobradas* — ${amount} para ${recipient}`,

    withdrawal: (amount: string, to: string): string =>
      `📤 *Retiro* — ${amount} para ${to}`,

    withdrawalPending: (amount: string, to: string): string =>
      `⏳ *Retiro en espera* — ${amount} reclamable por ${to}`,

    marketCreated: (
      marketId: string,
      question: string,
      captain: string,
      feeBps: string,
      deadline: string,
    ): string =>
      `🆕 *Nuevo mercado de escuadrón* \\#${marketId}\n${question}\nCapitán: ${captain} · comisión ${feeBps} bps · fecha límite ${deadline}`,

    deposited: (marketId: string, amount: string, side: string, participant: string): string =>
      `➕ *Escuadrón \\#${marketId}* — ${amount} en *${side}*\nParticipante: ${participant}`,

    withdrawn: (marketId: string, participant: string, amount: string, side: string): string =>
      `➖ *Escuadrón \\#${marketId}* — ${participant} retiró ${amount} de ${side}`,

    resolved: (marketId: string, result: string, poolA: string, poolB: string): string =>
      `🏁 *Escuadrón \\#${marketId} resuelto* — *${result}*\nPozos: A ${poolA} · B ${poolB}`,

    claimed: (
      marketId: string,
      participant: string,
      net: string,
      gross: string,
      fee: string,
    ): string =>
      `💸 *Pago del escuadrón* en \\#${marketId}\n${participant} → neto *${net}* \\(bruto ${gross}, comisión ${fee}\\)`,

    feesClaimedSquad: (amount: string, recipient: string): string =>
      `🧾 *Comisiones del escuadrón cobradas* — ${amount} para ${recipient}`,

    fallbackEvent: (
      source: string,
      contract: string,
      ledger: string,
      reason: string,
      txPart: string,
    ): string =>
      `⚠️ *Notificación de evento alternativa* \\(${source}\\)\nContrato: \`${contract}\` · Ledger: ${ledger}${txPart}\nMotivo: _${reason}_`,

    previewModePrefix: "🧪 *[MODO PREVISUALIZACIÓN]*",

    channelPreviewMarket: "🧪 *Vista previa del canal — mimir\\-market*",
    channelPreviewSquad: "🧪 *Vista previa del canal — mimir\\-squad*",
  },

  NOTIFICATION_PLAIN: {
    claimCreated: (claimId: string | number, category: string, creator: string): string =>
      `Nueva reclamación #${claimId}\nCategoría: ${category}\nCreador: ${creator}`,

    claimChallenged: (
      claimId: string | number,
      stake: string,
      challenger: string,
    ): string =>
      `Reclamación #${claimId} desafiada\nStake: ${stake}\nDesafiante: ${challenger}`,

    claimResolved: (
      claimId: string | number,
      winnerSide: string,
      confidence: string,
      summary: string | null,
    ): string =>
      `Reclamación #${claimId} resuelta — ganador: ${winnerSide}\nConfianza: ${confidence}` +
      (summary ? `\n${summary}` : ""),

    claimCancelled: (claimId: string | number): string =>
      `Reclamación #${claimId} cancelada — stakes devueltos`,

    marketSettled: (
      claimId: string | number,
      totalPaid: string,
      totalFees: string,
      owedToChallengers: string,
      ...rest: (readonly string[] | string | undefined)[]
    ): string => {
      const lines = rest[0];
      const linesPart = Array.isArray(lines)
        ? `\n${lines.join("\n")}`
        : typeof lines === "string" && lines.length > 0
          ? `\n${lines}`
          : "";
      if (linesPart) {
        return `Reclamación #${claimId} liquidada\nPagado: ${totalPaid} · comisiones ${totalFees}${linesPart}`;
      }
      return `Reclamación #${claimId} liquidada\nPagado: ${totalPaid} · comisiones ${totalFees}\nAdeudado a desafiantes: ${owedToChallengers}`;
    },

    challengerPaid: (
      claimId: string | number,
      challenger: string,
      stake: string,
      net: string,
      gross: string,
      fee: string,
    ): string =>
      `Desafiante pagado en la reclamación #${claimId}\n${challenger} apostó ${stake} → neto ${net}\nBruto ${gross} · comisión ${fee}`,

    feeClaimed: (amount: string, recipient: string): string =>
      `Comisiones cobradas — ${amount} para ${recipient}`,

    withdrawal: (amount: string, to: string): string =>
      `Retiro — ${amount} para ${to}`,

    withdrawalPending: (amount: string, to: string): string =>
      `Retiro en espera — ${amount} reclamable por ${to}`,

    marketCreated: (
      marketId: string | number,
      question: string,
      captain: string,
      feeBps: string,
      deadline: string,
    ): string =>
      `Nuevo mercado de escuadrón #${marketId}\n${question}\nCapitán: ${captain} · comisión ${feeBps} bps · fecha límite ${deadline}`,

    deposited: (
      marketId: string | number,
      amount: string,
      side: string,
      participant: string,
    ): string =>
      `Escuadrón #${marketId} — ${amount} en ${side}\nParticipante: ${participant}`,

    withdrawn: (
      marketId: string | number,
      participant: string,
      amount: string,
      side: string,
    ): string =>
      `Escuadrón #${marketId} — ${participant} retiró ${amount} de ${side}`,

    resolved: (
      marketId: string | number,
      result: string,
      poolA: string,
      poolB: string,
    ): string =>
      `Escuadrón #${marketId} resuelto — ${result}\nPozos: A ${poolA} · B ${poolB}`,

    claimed: (
      marketId: string | number,
      participant: string,
      net: string,
      gross: string,
      fee: string,
    ): string =>
      `Pago del escuadrón en #${marketId}\n${participant} → neto ${net} (bruto ${gross}, comisión ${fee})`,

    feesClaimedSquad: (amount: string, recipient: string): string =>
      `Comisiones del escuadrón cobradas — ${amount} para ${recipient}`,

    minimal: (source: string, ledger: string, eventId: string): string => {
      const idPart = eventId ? ` (${eventId})` : "";
      return `Evento de Mimir (${source}) — ${ledger}${idPart}`;
    },
  },

  EXPLORER_BUTTON_TEXT: "Ver en el explorador",
  MIMIR_APP_BUTTON_TEXT: "Abrir en Mimir",

  SETTLEMENT_LABELS: {
    owedToChallengers: "Adeudado a desafiantes",
    totalFees: "Comisiones totales",
    dust: "Polvo",
  },
};

const BUNDLES: Record<Locale, Messages> = {
  en: EN_MESSAGES,
  es: mergeOverrides(EN_MESSAGES, ES_OVERRIDES),
};

let activeLocale: Locale = DEFAULT_LOCALE;

/** True when `value` is a language this build ships. */
export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Map a configured value (e.g. `BOT_LOCALE`) to a supported language. Accepts
 * case and a region suffix (`es-MX`, `es_419`) so a deploy can pass the value
 * its platform already knows; returns null for anything unrecognized.
 */
export function normalizeLocale(raw: string | null | undefined): Locale | null {
  if (typeof raw !== "string") return null;
  const base = raw.trim().toLowerCase().replace(/_/g, "-").split("-")[0] ?? "";
  return isLocale(base) ? base : null;
}

/** The full bundle for `locale`; untranslated keys read as English. */
export function getMessages(locale: Locale): Messages {
  return BUNDLES[locale];
}

/** Choose the language every `messages()` caller renders from. */
export function setLocale(locale: Locale): void {
  activeLocale = locale;
}

/** The language currently rendered; `en` until {@link setLocale} runs. */
export function getLocale(): Locale {
  return activeLocale;
}

/** The active bundle. Call at render time, never capture at import time. */
export function messages(): Messages {
  return BUNDLES[activeLocale];
}

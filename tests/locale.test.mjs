/**
 * Locale-selection tests.
 *
 * The i18n layer ships one English base bundle and any number of translation
 * bundles. These tests pin the selection mechanism itself:
 *  - the registry (supported locales, normalization, default);
 *  - every bundle resolving the full English key set, so a partial translation
 *    still renders every message;
 *  - `setLocale` changing what the bot and the formatters actually emit;
 *  - `BOT_LOCALE` selecting the language at config load, and failing fast on a
 *    language this build does not ship.
 *
 * The English named exports are also asserted to stay English: tests and
 * tooling that import them directly must not depend on the active locale.
 */

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  DEFAULT_LOCALE,
  EXPLORER_BUTTON_TEXT,
  HELP_TITLE,
  NOTIFICATION_PLAIN,
  SUPPORTED_LOCALES,
  getLocale,
  getMessages,
  messages,
  normalizeLocale,
  setLocale,
} from "../dist/i18n.js";
import { ConfigError, configProvenance, loadConfig } from "../dist/config.js";
import { helpMessage, pauseMessage, resumeMessage } from "../dist/bot.js";
import { explorerKeyboard, formatEvent } from "../dist/notifications/format.js";

afterEach(() => setLocale(DEFAULT_LOCALE));

const VALID_TX = "0123456789abcdef".repeat(4);
const VALID_CONTRACT_A = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const VALID_CONTRACT_B = "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBQMF4";

function testnetConfig(overrides = {}) {
  return {
    marketContractId: "market",
    squadContractId: "squad",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    explorerBaseUrl: "https://stellar.expert/explorer",
    chatId: "-1001234567890",
    ...overrides,
  };
}

function marketEvent(payloadOverrides = {}, eventOverrides = {}) {
  return {
    source: "market",
    contractId: "market",
    ledger: 42,
    txHash: "",
    at: 0,
    eventId: "42-0",
    eventType: "contract",
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    payload: {
      name: "claim_created",
      claimId: 7,
      category: "crypto",
      creator: "GABCD",
      ...payloadOverrides,
    },
    ...eventOverrides,
  };
}

function withEnv(vars, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function validBotEnv(overrides = {}) {
  return {
    BOT_TOKEN: "123456789:" + "A".repeat(40),
    TELEGRAM_CHAT_ID: "-1001234567890",
    MARKET_CONTRACT_ID: VALID_CONTRACT_A,
    SQUAD_CONTRACT_ID: VALID_CONTRACT_B,
    BOT_LOCALE: undefined,
    ...overrides,
  };
}

// ── Registry ────────────────────────────────────────────────────────────────

test("registry: English is the default and every shipped locale is advertised", () => {
  assert.equal(DEFAULT_LOCALE, "en");
  assert.ok(SUPPORTED_LOCALES.includes("en"));
  assert.ok(SUPPORTED_LOCALES.length >= 2, "at least one translation must ship");
  assert.equal(getLocale(), "en");
});

test("normalizeLocale: accepts case and region suffixes, rejects unknown languages", () => {
  assert.equal(normalizeLocale("es"), "es");
  assert.equal(normalizeLocale("ES"), "es");
  assert.equal(normalizeLocale(" es-MX "), "es");
  assert.equal(normalizeLocale("es_419"), "es");
  assert.equal(normalizeLocale("en-GB"), "en");
  assert.equal(normalizeLocale("fr"), null);
  assert.equal(normalizeLocale(""), null);
  assert.equal(normalizeLocale(undefined), null);
});

test("every bundle resolves the full English key set", () => {
  const english = getMessages("en");
  for (const locale of SUPPORTED_LOCALES) {
    const bundle = getMessages(locale);
    assert.deepEqual(
      Object.keys(bundle).sort(),
      Object.keys(english).sort(),
      `${locale} is missing top-level keys`,
    );
    for (const table of ["PAUSE_MESSAGES", "RESUME_MESSAGES", "COMMAND_DESCRIPTIONS"]) {
      assert.deepEqual(
        Object.keys(bundle[table]).sort(),
        Object.keys(english[table]).sort(),
        `${locale}.${table} does not resolve every key`,
      );
    }
    for (const table of ["NOTIFICATION_MD", "NOTIFICATION_PLAIN"]) {
      assert.deepEqual(
        Object.keys(bundle[table]).sort(),
        Object.keys(english[table]).sort(),
        `${locale}.${table} does not resolve every template`,
      );
    }
  }
});

test("all bundled strings are non-empty and every template renders", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const bundle = getMessages(locale);
    for (const key of ["HELP_TITLE", "HELP_INTRO", "AUDIT_CLI_HINT", "EXPLORER_BUTTON_TEXT", "MIMIR_APP_BUTTON_TEXT"]) {
      assert.equal(typeof bundle[key], "string", `${locale}.${key} must be a string`);
      assert.ok(bundle[key].trim().length > 0, `${locale}.${key} is empty`);
    }
    for (const table of ["PAUSE_MESSAGES", "RESUME_MESSAGES", "COMMAND_DESCRIPTIONS"]) {
      for (const [key, value] of Object.entries(bundle[table])) {
        assert.equal(typeof value, "string", `${locale}.${table}.${key} must be a string`);
        assert.ok(value.trim().length > 0, `${locale}.${table}.${key} is empty`);
      }
    }
    for (const table of ["NOTIFICATION_MD", "NOTIFICATION_PLAIN"]) {
      for (const [key, value] of Object.entries(bundle[table])) {
        if (typeof value === "string") {
          assert.ok(value.trim().length > 0, `${locale}.${table}.${key} is empty`);
          continue;
        }
        const args = Array.from({ length: value.length }, (_, index) => `arg${index}`);
        const rendered = value(...args);
        assert.equal(typeof rendered, "string", `${locale}.${table}.${key} must render a string`);
        assert.ok(rendered.trim().length > 0, `${locale}.${table}.${key} rendered empty`);
      }
    }
  }
});

test("plain-text templates stay free of Markdown formatting characters", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const plain = getMessages(locale).NOTIFICATION_PLAIN;
    for (const [key, value] of Object.entries(plain)) {
      const rendered =
        typeof value === "string"
          ? value
          : value(...Array.from({ length: value.length }, (_, index) => `arg${index}`));
      assert.equal(
        /[*_`[\]\\]/.test(rendered),
        false,
        `${locale}.NOTIFICATION_PLAIN.${key} contains Markdown syntax: ${rendered}`,
      );
    }
  }
});

// ── Selection reaches every renderer ────────────────────────────────────────

test("English named exports stay English regardless of the active locale", () => {
  setLocale("es");
  assert.equal(HELP_TITLE, "*Mimir notifier*");
  assert.equal(EXPLORER_BUTTON_TEXT, "View on Explorer");
  assert.equal(NOTIFICATION_PLAIN.claimCancelled(7), "Claim #7 cancelled — stakes returned");
});

test("setLocale switches the active bundle and reports the selection", () => {
  setLocale("es");
  assert.equal(getLocale(), "es");
  assert.equal(messages().HELP_TITLE, "*Notificador de Mimir*");
  setLocale("en");
  assert.equal(getLocale(), "en");
  assert.equal(messages().HELP_TITLE, "*Mimir notifier*");
});

test("setLocale changes help, operator replies and notifications", () => {
  setLocale("es");

  const help = helpMessage();
  assert.match(help, /^\*Notificador de Mimir\*/);
  assert.ok(help.includes("Qué hace este bot"), "command descriptions follow the locale");

  assert.equal(
    pauseMessage("paused"),
    "*Sondeo pausado*\nEl escaneo actual puede terminar, pero no se iniciará un ciclo nuevo\\. Los cursores no se modificaron\\.",
  );
  assert.equal(resumeMessage("already-running"), "*El sondeo ya está en marcha*");

  const notification = formatEvent(
    testnetConfig(),
    marketEvent({ name: "claim_created", claimId: 7, category: "crypto", creator: "GABCD" }),
  );
  assert.equal(
    notification,
    "🆕 *Nueva reclamación* \\#7\nCategoría: crypto\nCreador: `GABCD`\n_ledger 42_",
  );

  const keyboard = explorerKeyboard(
    testnetConfig(),
    marketEvent({}, { txHash: VALID_TX }),
  );
  assert.equal(keyboard?.inline_keyboard[0][0].text, "Ver en el explorador");

  setLocale("en");
  assert.match(helpMessage(), /^\*Mimir notifier\*/);
  assert.match(formatEvent(testnetConfig(), marketEvent()), /🆕 \*New claim\*/);
});

// ── Config wiring (BOT_LOCALE) ──────────────────────────────────────────────

test("loadConfig: BOT_LOCALE selects the configured language", () => {
  withEnv(validBotEnv({ BOT_LOCALE: "es" }), () => {
    assert.equal(loadConfig().locale, "es");
  });
});

test("loadConfig: BOT_LOCALE accepts a region suffix", () => {
  withEnv(validBotEnv({ BOT_LOCALE: "es-MX" }), () => {
    assert.equal(loadConfig().locale, "es");
  });
});

test("loadConfig: BOT_LOCALE defaults to English when unset", () => {
  withEnv(validBotEnv(), () => {
    assert.equal(loadConfig().locale, "en");
  });
});

test("loadConfig: an unsupported BOT_LOCALE fails fast with the supported set", () => {
  withEnv(validBotEnv({ BOT_LOCALE: "fr" }), () => {
    assert.throws(() => loadConfig(), (err) => {
      assert.ok(err instanceof ConfigError);
      assert.ok(
        err.problems.some(
          (problem) => problem.includes("BOT_LOCALE") && problem.includes("es"),
        ),
        `problems should name BOT_LOCALE and the supported locales: ${err.problems.join(" | ")}`,
      );
      return true;
    });
  });
});

test("configProvenance: BOT_LOCALE is reported as an environment setting", () => {
  withEnv(validBotEnv({ BOT_LOCALE: "es" }), () => {
    const entry = configProvenance().entries.find((item) => item.key === "BOT_LOCALE");
    assert.ok(entry, "BOT_LOCALE must appear in the provenance report");
    assert.equal(entry.source, "process-env");
    assert.equal(entry.secret, false);
  });
});

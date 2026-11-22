import "../index.css";

import {
  DEFAULT_SERVER_SETTINGS_VIEW,
  type ServerProviderUsageSnapshot,
  type ServerSettingsView,
} from "@synara/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { page, userEvent } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

const settings = vi.hoisted(() => ({
  codexHomePath: "",
  disabledProviders: [] as string[],
  railUsageProviders: ["codex"],
  railUsageInstanceIds: null as string[] | null,
  railUsageWindow: "both",
}));
const updateSettings = vi.hoisted(() => vi.fn());

vi.mock("~/appSettings", () => ({ useAppSettings: () => ({ settings, updateSettings }) }));

import { serverQueryKeys } from "~/lib/serverReactQuery";

import { TopNavUsage } from "./TopNavUsage";
import { ProviderUsageSettingsPanel } from "./settings/ProviderUsageSettingsPanel";

async function renderAccounts(
  snapshots: readonly ServerProviderUsageSnapshot[],
  serverSettings: ServerSettingsView = DEFAULT_SERVER_SETTINGS_VIEW,
  showSettings = false,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  client.setQueryData(serverQueryKeys.allProviderUsage(), snapshots);
  client.setQueryData(serverQueryKeys.settings(), serverSettings);
  const onOpenUsageSettings = vi.fn();
  const content = () => (
    <QueryClientProvider client={client}>
      {showSettings ? (
        <div className="flex items-start gap-6 p-6">
          <div
            data-testid="usage-rail"
            className="flex shrink-0 items-center gap-1 rounded-lg bg-sidebar p-2"
          >
            <TopNavUsage onOpenUsageSettings={onOpenUsageSettings} />
          </div>
          <div className="w-[520px] space-y-6">
            <ProviderUsageSettingsPanel />
          </div>
        </div>
      ) : (
        <TopNavUsage onOpenUsageSettings={onOpenUsageSettings} />
      )}
    </QueryClientProvider>
  );
  const view = await render(content());
  return { client, onOpenUsageSettings, rerender: () => view.rerender(content()) };
}

async function renderUsage(
  limits: ServerProviderUsageSnapshot["limits"],
  status: ServerProviderUsageSnapshot["status"] = "ok",
) {
  const { onOpenUsageSettings } = await renderAccounts([
    {
      provider: "codex",
      updatedAt: "2026-10-02T12:00:00.000Z",
      status,
      source: "test",
      limits,
      usageLines: [],
    } satisfies ServerProviderUsageSnapshot,
  ]);
  return onOpenUsageSettings;
}

const claudeSettings: ServerSettingsView = {
  ...DEFAULT_SERVER_SETTINGS_VIEW,
  providerInstances: {
    claude_work: { driver: "claudeAgent", displayName: "Work", accentColor: "#2563eb" },
  },
};
const claudeSnapshots: readonly ServerProviderUsageSnapshot[] = [
  {
    provider: "claudeAgent",
    instanceId: "claude_work",
    updatedAt: "2026-10-02T12:00:00.000Z",
    status: "ok",
    source: "test",
    limits: [{ window: "Weekly", usedPercent: 80 }],
    usageLines: [],
  },
  {
    provider: "claudeAgent",
    instanceId: "claudeAgent",
    updatedAt: "2026-10-02T12:00:00.000Z",
    status: "ok",
    source: "test",
    limits: [{ window: "Weekly", usedPercent: 25 }],
    usageLines: [],
  },
];

describe("TopNavUsage", () => {
  beforeEach(() => {
    settings.railUsageWindow = "both";
    settings.disabledProviders = [];
    settings.railUsageProviders = ["codex"];
    settings.railUsageInstanceIds = null;
    updateSettings.mockReset().mockImplementation((patch) => Object.assign(settings, patch));
  });

  it("hides globally disabled selected accounts without erasing their saved selection", async () => {
    settings.disabledProviders = ["codex"];
    await renderUsage([{ window: "Weekly", usedPercent: 35 }]);
    expect(page.getByRole("button", { name: /^Codex usage:/ }).elements()).toHaveLength(0);
    expect(settings.railUsageProviders).toEqual(["codex"]);
  });

  it("selects two Claude accounts in Settings and shows each account's percentage and hover card", async () => {
    settings.railUsageInstanceIds = [];
    const { rerender } = await renderAccounts(claudeSnapshots, claudeSettings, true);
    const personalSwitch = page.getByRole("switch", {
      name: "Show Claude · Default account usage in the top bar",
    });
    const workSwitch = page.getByRole("switch", {
      name: "Show Claude · Work usage in the top bar",
    });
    await personalSwitch.click();
    await rerender();
    await workSwitch.click();
    await rerender();
    expect(updateSettings).toHaveBeenLastCalledWith({
      railUsageInstanceIds: ["claudeAgent", "claude_work"],
    });
    await expect.element(personalSwitch).toBeChecked();
    await expect.element(workSwitch).toBeChecked();
    await expect
      .element(
        page.getByRole("switch", {
          name: "Show Codex usage in the top bar",
        }),
      )
      .toBeDisabled();

    const personal = page.getByRole("button", { name: /^Claude · Default account usage:/ });
    const work = page.getByRole("button", { name: /^Claude · Work usage:/ });
    await expect.element(personal).toBeVisible();
    await expect.element(work).toBeVisible();
    await expect.element(personal).toHaveTextContent("—");
    await expect.element(work).toHaveTextContent("—");
    expect(work.element().querySelector('[data-accent="#2563eb"]')).not.toBeNull();
    await userEvent.hover(work);
    await expect.element(page.getByText("Claude · Work", { exact: true }).last()).toBeVisible();
    await expect.element(page.getByText("20% left", { exact: true }).last()).toBeVisible();

    await workSwitch.click();
    await rerender();
    await expect.element(work).not.toBeInTheDocument();
    await expect
      .element(
        page.getByRole("switch", {
          name: "Show Codex usage in the top bar",
        }),
      )
      .toBeEnabled();
  });

  it("never borrows a sibling's usage when the selected account has no matching snapshot", async () => {
    settings.railUsageInstanceIds = ["claudeAgent"];
    await renderAccounts(
      claudeSnapshots.filter((snapshot) => snapshot.instanceId === "claude_work"),
      claudeSettings,
    );
    await expect
      .element(page.getByRole("button", { name: /Claude.*usage:/ }))
      .not.toBeInTheDocument();
  });

  it("keeps the model picker's neutral marker for an additional account without an accent", async () => {
    settings.railUsageInstanceIds = ["claudeAgent", "claude_work"];
    await renderAccounts(claudeSnapshots, {
      ...claudeSettings,
      providerInstances: { claude_work: { driver: "claudeAgent", displayName: "Work" } },
    });
    const personal = page.getByRole("button", { name: /^Claude · Default account usage:/ });
    const work = page.getByRole("button", { name: /^Claude · Work usage:/ });
    expect(personal.element().querySelector('span[aria-hidden="true"]')).toBeNull();
    expect(work.element().querySelector('span[aria-hidden="true"]')).not.toBeNull();
  });

  it("preserves a disabled account selection when another account is changed", async () => {
    settings.railUsageInstanceIds = ["claude_work", "codex"];
    const { client, rerender } = await renderAccounts(
      claudeSnapshots,
      {
        ...claudeSettings,
        providerInstances: {
          claude_work: { driver: "claudeAgent", displayName: "Work", enabled: false },
        },
      },
      true,
    );
    await page.getByRole("switch", { name: "Show Codex usage in the top bar" }).click();
    await rerender();
    expect(settings.railUsageInstanceIds).toEqual(["claude_work"]);
    await page.getByRole("switch", { name: "Show Claude usage in the top bar" }).click();
    await rerender();
    await page.getByRole("switch", { name: "Show Codex usage in the top bar" }).click();
    await rerender();
    expect(settings.railUsageInstanceIds).toEqual(["claude_work", "claudeAgent", "codex"]);
    client.setQueryData(serverQueryKeys.settings(), claudeSettings);
    await rerender();
    await expect
      .element(page.getByRole("switch", { name: "Show Claude · Work usage in the top bar" }))
      .toBeChecked();
    await expect.element(page.getByRole("button", { name: /^Claude · Work usage:/ })).toBeVisible();
    await expect
      .element(page.getByRole("switch", { name: "Show Codex usage in the top bar" }))
      .not.toBeChecked();
    expect(settings.railUsageInstanceIds).toEqual(["claude_work", "claudeAgent", "codex"]);
  });

  it("hides disabled and removed accounts even when their usage remains cached", async () => {
    settings.railUsageInstanceIds = ["claude_work", "claude_removed"];
    await renderAccounts(
      [...claudeSnapshots, { ...claudeSnapshots[0]!, instanceId: "claude_removed" }],
      {
        ...claudeSettings,
        providerInstances: { claude_work: { driver: "claudeAgent", enabled: false } },
      },
    );
    await expect
      .element(page.getByRole("button", { name: /Claude.*usage:/ }))
      .not.toBeInTheDocument();
  });

  it("shows only five-hour remaining percentage beside the icon, with the full hover details", async () => {
    const onOpenUsageSettings = await renderUsage([
      { window: "seven_day", usedPercent: 57, windowDurationMins: 10_080 },
      { window: "five_hour", usedPercent: 22, windowDurationMins: 300 },
      { window: "seven_day_sonnet", usedPercent: 96, windowDurationMins: 10_080 },
    ]);
    const button = page.getByRole("button", {
      name: "Codex usage: 5h 78% remaining. Open usage settings",
      exact: true,
    });
    await expect.element(button).toBeVisible();
    await expect.element(button).toHaveTextContent("78%");
    expect(button.element().querySelectorAll('[role="progressbar"]')).toHaveLength(0);
    await userEvent.hover(button);
    await expect.element(page.getByText("43% left", { exact: true })).toBeVisible();
    await expect.element(page.getByText("78% left", { exact: true })).toBeVisible();
    await button.click();
    expect(onOpenUsageSettings).toHaveBeenCalledOnce();
  });

  it.each(["both", "fiveHour", "weekly"])(
    "uses five-hour usage despite the old %s window setting",
    async (window) => {
      settings.railUsageWindow = window;
      await renderUsage([
        { window: "Weekly", usedPercent: 92 },
        { window: "5h", usedPercent: 15 },
      ]);
      await expect
        .element(page.getByRole("button", { name: /^Codex usage:/ }))
        .toHaveTextContent("85%");
    },
  );

  it.each([0, 100])("shows the remainder when %s%% is used", async (usedPercent) => {
    await renderUsage([{ window: "5h", usedPercent }]);
    await expect
      .element(page.getByRole("button", { name: /^Codex usage:/ }))
      .toHaveTextContent(`${100 - usedPercent}%`);
  });

  it.each(["Weekly", "Monthly"])(
    "shows an unknown five-hour value when only %s is reported",
    async (window) => {
      await renderUsage([{ window, usedPercent: 35 }]);
      const button = page.getByRole("button", {
        name: "Codex usage: 5h unavailable. Open usage settings",
        exact: true,
      });
      await expect.element(button).toHaveTextContent("—");
    },
  );

  it("keeps the unavailable account visible without inventing a percentage", async () => {
    await renderUsage([], "error");
    await expect
      .element(
        page.getByRole("button", {
          name: "Codex usage: 5h unavailable. Open usage settings",
          exact: true,
        }),
      )
      .toHaveTextContent("—");
  });
});

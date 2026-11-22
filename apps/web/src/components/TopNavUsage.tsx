// FILE: TopNavUsage.tsx
// Purpose: Provider usage at the top bar: a glyph beside five-hour remaining percentage,
//          a hover card with every limit, and click to open Settings → Usage.
// Layer: App shell component
// Depends on: the shared provider-usage menu model and panel content, so the header reads the
//             same numbers as the Environment panel and Settings.

import { DEFAULT_SERVER_SETTINGS_VIEW, type ServerProviderUsageSnapshot } from "@synara/contracts";
import { deriveProviderInstances } from "@synara/shared/providerInstances";
import { useQuery } from "@tanstack/react-query";

import { useAppSettings } from "~/appSettings";
import {
  serverAllProviderUsageQueryOptions,
  serverSettingsQueryOptions,
} from "~/lib/serverReactQuery";
import { cn } from "~/lib/utils";

import { Button } from "./ui/button";
import {
  getRailUsageAccounts,
  resolveRailUsageAccounts,
  type RailUsageAccount,
} from "./AppRailUsage.logic";
import { ProviderAccountDot } from "./ProviderAccountMark";
import { ProviderIcon } from "./ProviderIcon";
import { useProviderUsageMenuModel } from "./ProviderUsageMenuControl";
import { ProviderUsagePanelContent } from "./ProviderUsagePanelContent";
import {
  SIDEBAR_HOVER_CARD_POPUP_PROPS,
  SIDEBAR_HOVER_CARD_SURFACE_CLASS_NAME,
  SIDEBAR_HOVER_CARD_TRIGGER_PROPS,
} from "./sidebarHoverCardStyles";
import { PreviewCard, PreviewCardPopup, PreviewCardTrigger } from "./ui/preview-card";
import { useTranslation } from "~/i18n";

function TopNavUsageAccount({
  account,
  snapshot,
  onOpenUsageSettings,
}: {
  account: RailUsageAccount;
  snapshot: ServerProviderUsageSnapshot | undefined;
  onOpenUsageSettings: () => void;
}) {
  const { t } = useTranslation();

  const { instance, label } = account;
  const provider = instance.driver;
  const model = useProviderUsageMenuModel(provider, {
    instanceId: instance.instanceId,
    providerSnapshot: snapshot ?? null,
  });

  // A failed fetch keeps an unavailable indicator (its card says why) so a chosen provider does
  // not vanish on a network blip. Otherwise nothing displayable (still loading, signed out,
  // or no usage source) means no indicator.
  const unavailable = snapshot?.status === "error";
  if (!unavailable && model.rows.length === 0 && model.usageLines.length === 0) {
    return null;
  }

  const fiveHour = model.rows.find((row) => row.label === "5h");
  const remainingPercent = !unavailable && fiveHour ? Math.round(fiveHour.remainingPercent) : null;
  const ariaLabel =
    remainingPercent === null
      ? t("settings:topBarFiveHourUsageUnavailable", { provider: label })
      : t("settings:topBarFiveHourUsage", { provider: label, usage: `${remainingPercent}%` });

  return (
    <PreviewCard>
      <PreviewCardTrigger
        {...SIDEBAR_HOVER_CARD_TRIGGER_PROPS}
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("common:openUsageSettings", { value0: ariaLabel })}
            className="h-7 shrink-0 gap-1.5 px-1.5 text-ui-sm tabular-nums [-webkit-app-region:no-drag]"
            onClick={onOpenUsageSettings}
          />
        }
      >
        <span className="relative flex size-4">
          <ProviderIcon
            provider={provider}
            className={cn("size-full", unavailable && "opacity-50")}
          />
          <ProviderAccountDot
            accentColor={instance.raw.accentColor}
            always={account.dotted}
            className="absolute -top-0.5 -right-1 size-1.5 ring-0"
          />
        </span>
        <span>{remainingPercent === null ? "—" : `${remainingPercent}%`}</span>
      </PreviewCardTrigger>
      <PreviewCardPopup
        {...SIDEBAR_HOVER_CARD_POPUP_PROPS}
        // Keep the detailed usage card below the top-bar controls.
        side="bottom"
        align="end"
        sideOffset={6}
        className={SIDEBAR_HOVER_CARD_SURFACE_CLASS_NAME}
      >
        <div className="space-y-2 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-ui font-medium text-foreground">{label}</span>
            {snapshot?.planName ? (
              <span className="shrink-0 text-ui-sm text-muted-foreground">{snapshot.planName}</span>
            ) : null}
          </div>
          <ProviderUsagePanelContent
            provider={provider}
            rateLimits={model.rateLimits}
            usageLines={model.usageLines}
            notice={model.notice}
            emptyMessage={model.emptyMessage}
            isLoading={model.isLoading}
            resetCredits={model.resetCredits}
            resetCreditsSurface="popover"
            showTitle={false}
          />
        </div>
      </PreviewCardPopup>
    </PreviewCard>
  );
}

/** Selected accounts keep their existing Settings → Usage selection. */
export function TopNavUsage({ onOpenUsageSettings }: { onOpenUsageSettings: () => void }) {
  const { t } = useTranslation();
  const { settings } = useAppSettings();
  const settingsQuery = useQuery(serverSettingsQueryOptions());
  const accounts = resolveRailUsageAccounts(
    settings.railUsageInstanceIds ?? settings.railUsageProviders,
    getRailUsageAccounts(
      deriveProviderInstances(settingsQuery.data ?? DEFAULT_SERVER_SETTINGS_VIEW),
      settings.disabledProviders,
      t,
    ),
  );
  const usageQuery = useQuery(serverAllProviderUsageQueryOptions({ enabled: accounts.length > 0 }));

  if (accounts.length === 0) {
    return null;
  }

  return (
    <>
      {accounts.map((account) => (
        <TopNavUsageAccount
          key={account.instance.instanceId}
          account={account}
          snapshot={(usageQuery.data ?? []).find(
            (entry) =>
              entry.provider === account.instance.driver &&
              (entry.instanceId ?? entry.provider) === account.instance.instanceId,
          )}
          onOpenUsageSettings={onOpenUsageSettings}
        />
      ))}
    </>
  );
}

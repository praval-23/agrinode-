import { useLocationSelection } from "@/context/LocationContext";
import { useMarketPrices } from "@/hooks/use-market-prices";
import { useI18n } from "@/i18n";
import { rankMarkets } from "@/services/marketRanking";
import { formatKgPrice, getCropPrice, getMarketHistory } from "@/services/pricingService";
import { colors } from "@/theme/colors";
import type { MarketPrice } from "@/types/market";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppIcon, BottomNavigation, Card, CropVisual, StatusBadge } from "./ui";

const up = {
  ios: "arrowtriangle.up.fill",
  android: "arrow_drop_up",
  web: "arrow_drop_up",
};
const down = {
  ios: "arrowtriangle.down.fill",
  android: "arrow_drop_down",
  web: "arrow_drop_down",
};
const formatChange = (value: number | null) =>
  value === null ? "—" : Math.abs(value).toFixed(1);
function LineChart({
  data,
  positive,
  large = false,
}: {
  data: number[];
  positive: boolean;
  large?: boolean;
}) {
  if (data.length < 2) {
    return <Text style={large ? s.historyUnavailableLarge : s.historyUnavailable}>Not enough historical data</Text>;
  }
  const chartData = data.length ? data : [0];
  const width = large ? 310 : 50;
  const height = large ? 132 : 22;
  const min = Math.min(...chartData);
  const range = Math.max(...chartData) - min || 1;
  const points = chartData.map((value, index) => ({
    x: 2 + index * ((width - 4) / Math.max(chartData.length - 1, 1)),
    y: height - 3 - ((value - min) / range) * (height - 8),
  }));
  const color = positive ? colors.greenBright : colors.red;
  return (
    <View style={[s.lineChart, large ? s.lineChartLarge : s.lineChartSmall]}>
      {large && (
        <View style={s.chartGrid}>
          <View />
          <View />
          <View />
        </View>
      )}
      {points.slice(0, -1).map((point, index) => {
        const next = points[index + 1];
        const length = Math.hypot(next.x - point.x, next.y - point.y);
        const angle =
          (Math.atan2(next.y - point.y, next.x - point.x) * 180) / Math.PI;
        return (
          <View
            key={`segment-${index}`}
            style={[
              s.segment,
              {
                width: length,
                left: point.x,
                top: point.y,
                backgroundColor: color,
                transform: [{ rotate: `${angle}deg` }],
              },
            ]}
          />
        );
      })}
      {points.map((point, index) => (
        <View
          key={`point-${index}`}
          style={[
            s.point,
            { left: point.x - 1.5, top: point.y - 1.5, backgroundColor: color },
          ]}
        />
      ))}
      <View
        style={[
          s.latest,
          {
            left: points.at(-1)!.x - 3.5,
            top: points.at(-1)!.y - 3.5,
            borderColor: color,
          },
        ]}
      />
    </View>
  );
}
function Change({ value }: { value: number | null }) {
  const positive = (value ?? 0) >= 0;
  const unavailable = value === null;
  return (
    <View
      style={[
        s.change,
        {
          backgroundColor: unavailable
            ? "#EEF3F0"
            : positive
              ? "#E5F5E9"
              : "#FCEAE8",
        },
      ]}
    >
      <AppIcon
        name={positive ? up : down}
        size={13}
        color={
          unavailable
            ? colors.muted
            : positive
              ? colors.greenBright
              : colors.red
        }
      />
      <Text
        style={{
          color: unavailable
            ? colors.muted
            : positive
              ? colors.greenBright
              : colors.red,
          fontWeight: "900",
          fontSize: 11,
        }}
      >
        {formatChange(value)}%
      </Text>
    </View>
  );
}
function DemandCard({ demand }: { demand: MarketPrice["demand"] }) {
  const { t } = useI18n();
  const tone =
    demand === "High"
      ? {
          color: colors.greenBright,
          bg: "#E5F5E9",
          copy: t("strongBuyerActivity"),
        }
      : demand === "Medium"
        ? {
            color: colors.amber,
            bg: "#FFF4D9",
            copy: t("moderateBuyerActivity"),
          }
        : demand === "Low"
          ? {
              color: colors.red,
              bg: "#FCEAE8",
              copy: t("limitedBuyerActivity"),
            }
          : { color: colors.muted, bg: "#EEF3F0", copy: "Demand unavailable" };
  return (
    <Card style={s.demandCard}>
      <View>
        <Text style={s.overline}>{t("demand")}</Text>
        {demand !== null ? <Text style={s.demoDemand}>{t("demoDemand")}</Text> : null}
        <Text style={[s.demandLevel, { color: tone.color }]}>
          {demand ?? "Unavailable"}
        </Text>
        <Text style={s.demandCopy}>{tone.copy}</Text>
      </View>
      <View style={[s.demandIndicator, { backgroundColor: tone.bg }]}>
        <AppIcon
          name={{ ios: "person.2.fill", android: "groups", web: "groups" }}
          size={25}
          color={tone.color}
        />
      </View>
    </Card>
  );
}

export function FarmerMarket() {
  const { prices: items, source, locationScope, error, isFallback, loading, refreshing, refresh, retry } = useMarketPrices();
  const { location } = useLocationSelection();
  const { t } = useI18n();
  const scopeNote = locationScope === "district" && location.district
    ? `within ${location.district} district`
    : locationScope === "state"
      ? `within ${location.state} state`
      : "";
  const marketStatus = loading
    ? "Loading market prices..."
    : isFallback
      ? `Demo fallback prices · ${error ?? "backend unavailable"}`
      : source === "government"
        ? `Government market prices${scopeNote ? ` · ${scopeNote}` : ""}`
        : "Demo market prices";
  return (
    <View style={s.root}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={s.page}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.green} colors={[colors.green]} />}
      >
        <View>
          <Text style={s.title}>{t("marketWatchlist")}</Text>
          <Text style={s.location}>{location.city}, {location.state}</Text>
          <Text style={s.sub}>{marketStatus}</Text>
        </View>
        {loading ? <Text style={s.empty}>Loading government market records...</Text> : error && items.length === 0 ? <View style={s.empty}><Text style={s.emptyText}>{error}</Text><Pressable onPress={retry} style={s.retry}><Text style={s.retryText}>Retry</Text></Pressable></View> : items.length === 0 ? <View style={s.empty}><Text style={s.emptyText}>No government market has a verified location match for this area.</Text><Pressable onPress={retry} style={s.retry}><Text style={s.retryText}>Retry</Text></Pressable></View> : items.map((item) => {
          if (__DEV__) console.info('[market] displayed market/location', { market: item.market, district: item.district, state: item.state, latitude: item.latitude, longitude: item.longitude, distanceKm: item.distanceKm, userLocation: location });
          const positive = (item.changePercent ?? 0) >= 0;
          return (
            <Pressable
              key={item.id}
              onPress={() => router.push(`/farmer/market/${item.id}` as any)}
            >
              <Card style={s.rowCard}>
                <CropVisual crop={item.name} size={50} />
                <View style={s.flex}>
                  <View style={s.rowTitle}>
                    <Text style={s.crop}>{item.name}</Text>
                    <Change value={item.changePercent} />
                  </View>
                  <Text numberOfLines={1} style={s.meta}>
                    {item.market} APMC · {item.locationScope === "state" ? `${item.state} market · ` : ""}{item.demand ?? "Demand unavailable"}
                    {item.distanceKm !== undefined
                      ? ` · ${item.distanceKm} km`
                      : ""}
                    {item.locationScope === "state" && item.district ? ` · ${item.district}` : ""}
                  </Text>
                  <View style={s.rowBottom}>
                    <Text style={s.price}>
                      {formatKgPrice(item.normalizedPricePerKg)}
                    </Text>
                    <LineChart data={item.trend} positive={positive} />
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        })}
      </ScrollView>
      <BottomNavigation mode="farmer" active="Market" navigate={router.push} />
    </View>
  );
}

export function MarketDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<MarketPrice>();
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getMarketHistory>>>();
  const { location } = useLocationSelection();
  const { t } = useI18n();
  useEffect(() => {
    let active = true;
    setHistory(undefined);
    if (id) {
      void getCropPrice(id, location).then((value) => {
        if (!active) return;
        const ranked = value ? rankMarkets([value], location)[0] : undefined;
        setItem(ranked);
        if (ranked) {
          void getMarketHistory({ commodity: ranked.commodity, market: ranked.market, district: ranked.district, state: ranked.state, days: 7 })
            .then((result) => { if (active) setHistory(result); })
            .catch(() => { if (active) setHistory(undefined); });
        }
      });
    }
    return () => { active = false; };
  }, [id, location]);
  const sevenDay = useMemo(
    () => history?.history.map((point) => point.price) ?? [],
    [history],
  );
  if (!item)
    return (
      <View style={s.loading}>
        <Text>Loading market price...</Text>
      </View>
    );
  const currentPrice = history?.currentPrice ?? item.normalizedPricePerKg;
  const previousPrice = history?.previousPrice ?? item.previousPricePerKg;
  const changePercent = history?.changePercent ?? item.changePercent;
  const hasHistory = (history?.history.length ?? 0) >= 2;
  const positive = (changePercent ?? 0) >= 0;
  return (
    <View style={s.root}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={s.page}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} style={s.back}>
          <AppIcon
            name={{
              ios: "chevron.left",
              android: "arrow_back",
              web: "arrow_back",
            }}
            size={17}
          />
          <Text style={s.backText}>{t("marketWatchlist")}</Text>
        </Pressable>
        <View style={s.detailHero}>
          <CropVisual crop={item.name} size={68} />
          <View style={s.flex}>
            <Text style={s.title}>{item.name}</Text>
            <Text style={s.sub}>{item.market} APMC · {item.source === "Mock" ? "Demo data" : "Government data"}</Text>
          </View>
        </View>
        <Card style={s.priceCard}>
          <View>
            <Text style={s.overline}>{t("currentMandiPrice")}</Text>
            <Text style={s.bigPrice}>
              {formatKgPrice(currentPrice)}
            </Text>
            <Text style={s.meta}>
              {t("previousPrice")}: {formatKgPrice(previousPrice)}
            </Text>
          </View>
          <Change value={changePercent} />
        </Card>
        <Card style={s.trendCard}>
          <View style={s.cardHead}>
            <View>
              <Text style={s.cardTitle}>{t("sevenDayTrend")}</Text>
              <Text style={s.meta}>{item.source === "Mock" ? "Demo price movement per kg" : hasHistory ? "Real government modal prices per kg" : "Not enough historical data"}</Text>
            </View>
            <StatusBadge text={hasHistory ? (positive ? "UPWARD TREND" : "DOWNWARD TREND") : "HISTORY UNAVAILABLE"} />
          </View>
          <LineChart data={sevenDay} positive={positive} large />
          <View style={s.days}>
            {history?.history.map((point) => <Text key={point.date}>{point.date}</Text>)}
            {!history?.history.length ? <Text>History unavailable</Text> : null}
          </View>
          {history && history.change !== null && history.changePercent !== null ? <Text style={s.meta}>Change: {history.change >= 0 ? "+" : ""}{formatKgPrice(history.change).replace("/kg", "")} ({history.changePercent >= 0 ? "+" : ""}{history.changePercent.toFixed(2)}%)</Text> : null}
        </Card>
        <DemandCard demand={item.demand} />
        <Card>
          <Text style={s.cardTitle}>{t("marketSnapshot")}</Text>
          <View style={s.stats}>
            <Metric
              label={t("previousPrice")}
              value={formatKgPrice(previousPrice)}
            />
            <Metric
              label="7-day high"
              value={sevenDay.length ? formatKgPrice(Math.max(...sevenDay)) : "Unavailable"}
            />
            <Metric
              label="7-day low"
              value={sevenDay.length ? formatKgPrice(Math.min(...sevenDay)) : "Unavailable"}
            />
            <Metric label={t("demand")} value={item.demand ?? "Unavailable"} />
          </View>
        </Card>
        <Card>
          <Text style={s.cardTitle}>{t("sourceDetails")}</Text>
          <View style={s.details}>
            <Detail label="Market" value={`${item.market} APMC`} />
            <Detail
              label="Distance"
              value={
                item.distanceKm !== undefined
                  ? `${item.distanceKm} km`
                  : "Unavailable"
              }
            />
            <Detail label="District" value={item.district} />
            <Detail label="State" value={item.state} />
            <Detail label="Source" value={`${item.source} market data`} />
            <Detail label="Last updated" value={item.lastUpdated} />
          </View>
          {item.source === "Mock" ? <View style={s.demoNote}>
            <AppIcon
              name={{ ios: "info.circle.fill", android: "info", web: "info" }}
              size={15}
              color={colors.blue}
            />
            <Text style={s.demoText}>
              This is demo data for the current app experience. Live source
              integration is not enabled.
            </Text>
          </View> : null}
        </Card>
      </ScrollView>
      <BottomNavigation mode="farmer" active="Market" navigate={router.push} />
    </View>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metric}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={s.metricValue}>
        {value}
      </Text>
    </View>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detail}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  page: { padding: 18, gap: 14, paddingBottom: 28 },
  title: {
    fontSize: 27,
    fontWeight: "900",
    color: colors.ink,
    letterSpacing: -0.5,
  },
  sub: { fontSize: 12, color: colors.muted, marginTop: 3 },
  rowCard: { padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  flex: { flex: 1, minWidth: 0 },
  rowTitle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  crop: { fontSize: 16, fontWeight: "900", color: colors.ink, flexShrink: 1 },
  meta: { fontSize: 11, color: colors.muted, marginTop: 3 },
  price: { fontSize: 15, fontWeight: "900", color: colors.green },
  rowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 6,
  },
  change: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  lineChart: { position: "relative", overflow: "hidden" },
  lineChartSmall: { width: 50, height: 22 },
  lineChartLarge: { height: 132, width: "100%", marginTop: 14 },
  historyUnavailable: { color: colors.muted, fontSize: 11, minWidth: 92, textAlign: "right" },
  historyUnavailableLarge: { color: colors.muted, fontSize: 13, height: 132, textAlign: "center", paddingTop: 54 },
  segment: {
    position: "absolute",
    height: 2,
    borderRadius: 2,
    transformOrigin: "left center",
  },
  point: { position: "absolute", width: 3, height: 3, borderRadius: 2 },
  latest: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    backgroundColor: colors.card,
  },
  chartGrid: {
    position: "absolute",
    inset: 0,
    justifyContent: "space-between",
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    alignSelf: "flex-start",
  },
  backText: { fontSize: 13, fontWeight: "800", color: colors.green },
  detailHero: { flexDirection: "row", alignItems: "center", gap: 12 },
  priceCard: {
    padding: 17,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderLeftWidth: 4,
    borderLeftColor: colors.greenBright,
  },
  overline: {
    fontSize: 10,
    fontWeight: "900",
    color: colors.muted,
    letterSpacing: 0.8,
  },
  bigPrice: {
    fontSize: 31,
    fontWeight: "900",
    color: colors.green,
    marginTop: 4,
  },
  trendCard: { padding: 16 },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: "900", color: colors.ink },
  days: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  demandCard: {
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  demoDemand: { fontSize: 10, color: colors.muted, marginTop: 3 },
  demandLevel: { fontSize: 25, fontWeight: "900", marginTop: 5 },
  demandCopy: { fontSize: 12, color: colors.muted, marginTop: 2 },
  demandIndicator: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 },
  metric: { width: "46%", gap: 3 },
  metricLabel: { fontSize: 11, color: colors.muted },
  metricValue: { fontSize: 14, fontWeight: "900", color: colors.ink },
  details: { gap: 9, marginTop: 10 },
  detail: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  detailLabel: { fontSize: 12, color: colors.muted },
  detailValue: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.ink,
    textAlign: "right",
    flexShrink: 1,
  },
  demoNote: {
    flexDirection: "row",
    gap: 7,
    backgroundColor: "#EEF5FF",
    borderRadius: 10,
    padding: 10,
    marginTop: 13,
  },
  demoText: { flex: 1, fontSize: 11, color: "#426081", lineHeight: 15 },
  empty: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    paddingVertical: 24,
  },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  location: { color: colors.green, fontSize: 12, fontWeight: "800" },
  retry: { alignSelf: "center", backgroundColor: colors.green, borderRadius: 8, marginTop: 12, paddingHorizontal: 18, paddingVertical: 9 },
  retryText: { color: "white", fontSize: 13, fontWeight: "800" },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cream,
  },
});

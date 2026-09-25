import { FEATURES } from "@/config/features";
import { farmer, orders } from "@/data/mockData";
import { useMarketPrices } from "@/hooks/use-market-prices";
import { useI18n } from "@/i18n";
import { formatINR, formatKgPrice } from "@/services/pricingService";
import { colors } from "@/theme/colors";
import type { MarketPrice } from "@/types/market";
import { router } from "expo-router";
import { type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppIcon, BottomNavigation, Card, CropVisual, StatusBadge } from "./ui";
import { LocationSelector } from "./location-selector";

const icons: Record<string, any> = {
  "Sell Produce": {
    ios: "plus.circle.fill",
    android: "add_circle",
    web: "add_circle",
  },
  Market: {
    ios: "chart.line.uptrend.xyaxis",
    android: "show_chart",
    web: "show_chart",
  },
  "AI Scanner": {
    ios: "viewfinder",
    android: "center_focus_strong",
    web: "center_focus_strong",
  },
  Orders: {
    ios: "shippingbox.fill",
    android: "inventory_2",
    web: "inventory_2",
  },
  Logistics: {
    ios: "truck.box.fill",
    android: "local_shipping",
    web: "local_shipping",
  },
  "Load Pooling": { ios: "person.3.fill", android: "groups", web: "groups" },
  Payments: {
    ios: "indianrupeesign.circle.fill",
    android: "currency_rupee",
    web: "currency_rupee",
  },
  Alerts: { ios: "bell.fill", android: "notifications", web: "notifications" },
};
const actions = [
  ["Sell Produce", "/farmer/listing", true],
  ["Market", "/farmer/marketplace", true],
  ["AI Scanner", "/farmer/scanner", FEATURES.qualityScanner],
  ["Orders", "/farmer/orders", true],
  ["Logistics", "/farmer/logistics", FEATURES.logistics],
  ["Load Pooling", "/farmer/logistics", FEATURES.logistics],
  ["Payments", "/farmer/payments", FEATURES.paymentSimulation],
  ["Alerts", "/farmer/notifications", FEATURES.notifications],
] as const;
const arrowUp = {
  ios: "arrowtriangle.up.fill",
  android: "arrow_drop_up",
  web: "arrow_drop_up",
};
const arrowDown = {
  ios: "arrowtriangle.down.fill",
  android: "arrow_drop_down",
  web: "arrow_drop_down",
};
const formatChange = (value: number | null) =>
  value === null ? "—" : Math.abs(value).toFixed(1);

const cropArt: Record<string, { skin: string; leaf: string; kind: string }> = {
  Tomato: { skin: "#D94B42", leaf: "#387A45", kind: "round" },
  Onion: { skin: "#B173AF", leaf: "#5D864D", kind: "onion" },
  Potato: { skin: "#C78B4F", leaf: "#80572F", kind: "potato" },
  Wheat: { skin: "#D8A83D", leaf: "#A67B22", kind: "wheat" },
  Maize: { skin: "#F0C94A", leaf: "#4D8B4B", kind: "maize" },
  Cotton: { skin: "#F8F8EE", leaf: "#6B9D56", kind: "cotton" },
  Chilli: { skin: "#D8473F", leaf: "#467D45", kind: "chilli" },
  Turmeric: { skin: "#E9AB2E", leaf: "#B5771B", kind: "turmeric" },
  Groundnut: { skin: "#C4915D", leaf: "#6D914A", kind: "groundnut" },
  Paddy: { skin: "#DAB54A", leaf: "#78944B", kind: "paddy" },
  Soybean: { skin: "#83A84F", leaf: "#527B43", kind: "soybean" },
  Sugarcane: { skin: "#79A850", leaf: "#417A43", kind: "sugarcane" },
  Cabbage: { skin: "#7EAF62", leaf: "#4D864A", kind: "cabbage" },
  Cauliflower: { skin: "#F5F0DA", leaf: "#66A15B", kind: "cotton" },
  Carrot: { skin: "#E87A36", leaf: "#4D934C", kind: "carrot" },
  Okra: { skin: "#6DAB55", leaf: "#407A42", kind: "okra" },
};
function WatchCropVisual({ crop }: { crop: string }) {
  const art = cropArt[crop] ?? {
    skin: "#7EAF62",
    leaf: "#4D864A",
    kind: "round",
  };
  const node = (style: object, key: string) => <View key={key} style={style} />;
  let pieces: ReactNode[] = [];
  if (art.kind === "wheat" || art.kind === "paddy")
    pieces = [
      node([s.artStem, { backgroundColor: art.leaf }], "stem"),
      ...[0, 1, 2, 3].map((i) =>
        node(
          [
            s.artGrain,
            {
              backgroundColor: art.skin,
              top: 8 + i * 6,
              left: i % 2 ? 20 : 11,
            },
          ],
          `grain-${i}`,
        ),
      ),
    ];
  else if (art.kind === "maize" || art.kind === "sugarcane")
    pieces = [
      node([s.artCob, { backgroundColor: art.skin }], "cob"),
      node([s.artHuskLeft, { borderBottomColor: art.leaf }], "left"),
      node([s.artHuskRight, { borderBottomColor: art.leaf }], "right"),
    ];
  else if (art.kind === "cotton")
    pieces = [
      node([s.artPuff, { backgroundColor: art.skin, left: 8 }], "p1"),
      node([s.artPuff, { backgroundColor: art.skin, left: 16, top: 10 }], "p2"),
      node([s.artPuff, { backgroundColor: art.skin, left: 23 }], "p3"),
      node([s.artLeaf, { backgroundColor: art.leaf }], "leaf"),
    ];
  else if (
    art.kind === "carrot" ||
    art.kind === "chilli" ||
    art.kind === "okra"
  )
    pieces = [
      node(
        [
          s.artLong,
          {
            backgroundColor: art.skin,
            transform: [{ rotate: art.kind === "chilli" ? "-35deg" : "24deg" }],
          },
        ],
        "body",
      ),
      node([s.artLeaf, { backgroundColor: art.leaf }], "leaf"),
    ];
  else if (
    art.kind === "turmeric" ||
    art.kind === "groundnut" ||
    art.kind === "soybean"
  )
    pieces = [
      node([s.artRoot, { backgroundColor: art.skin }], "root"),
      node([s.artRootSmall, { backgroundColor: art.skin }], "root2"),
      node([s.artLeaf, { backgroundColor: art.leaf }], "leaf"),
    ];
  else if (art.kind === "cabbage")
    pieces = [
      node([s.artRound, { backgroundColor: art.skin }], "body"),
      node([s.artRing, { borderColor: art.leaf }], "ring"),
      node([s.artLeaf, { backgroundColor: art.leaf }], "leaf"),
    ];
  else
    pieces = [
      node([s.artRound, { backgroundColor: art.skin }], "body"),
      node([s.artLeaf, { backgroundColor: art.leaf }], "leaf"),
    ];
  return (
    <View accessibilityLabel={`${crop} crop visual`} style={s.cropArt}>
      {pieces}
    </View>
  );
}
function Sparkline({
  trend,
  positive,
}: {
  trend: number[];
  positive: boolean;
}) {
  const chartData = trend.length ? trend : [0];
  const width = 118;
  const height = 27;
  const min = Math.min(...chartData);
  const range = Math.max(...chartData) - min || 1;
  const points = chartData.map((value, index) => ({
    x: 2 + index * ((width - 4) / Math.max(chartData.length - 1, 1)),
    y: height - 3 - ((value - min) / range) * (height - 8),
  }));
  const color = positive ? colors.greenBright : colors.red;
  return (
    <View style={s.sparkline}>
      {points.slice(0, -1).map((point, index) => {
        const next = points[index + 1];
        const lineWidth = Math.hypot(next.x - point.x, next.y - point.y);
        const angle =
          (Math.atan2(next.y - point.y, next.x - point.x) * 180) / Math.PI;
        return (
          <View
            key={`line-${index}`}
            style={[
              s.sparkSegment,
              {
                width: lineWidth,
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
            s.sparkPoint,
            { left: point.x - 1.5, top: point.y - 1.5, backgroundColor: color },
          ]}
        />
      ))}
      <View
        style={[
          s.sparkLatest,
          {
            left: points.at(-1)!.x - 3,
            top: points.at(-1)!.y - 3,
            borderColor: color,
          },
        ]}
      />
    </View>
  );
}
function WatchCard({ item }: { item: MarketPrice }) {
  const positive = (item.changePercent ?? 0) >= 0;
  return (
    <Pressable
      onPress={() => router.push(`/farmer/market/${item.id}` as any)}
      style={s.watch}
    >
      <View style={s.watchTop}>
        <WatchCropVisual crop={item.name} />
        <View
          style={[
            s.changePill,
            {
              backgroundColor:
                item.changePercent === null
                  ? "#EEF3F0"
                  : positive
                    ? "#E5F5E9"
                    : "#FCEAE8",
            },
          ]}
        >
          <AppIcon
            name={positive ? arrowUp : arrowDown}
            size={12}
            color={
              item.changePercent === null
                ? colors.muted
                : positive
                  ? colors.greenBright
                  : colors.red
            }
          />
          <Text
            style={[
              s.change,
              {
                color:
                  item.changePercent === null
                    ? colors.muted
                    : positive
                      ? colors.greenBright
                      : colors.red,
              },
            ]}
          >
            {formatChange(item.changePercent)}%
          </Text>
        </View>
      </View>
      <Text numberOfLines={1} style={s.cropName}>
        {item.name}
      </Text>
      <Text style={s.price}>{formatKgPrice(item.normalizedPricePerKg)}</Text>
      <Sparkline trend={item.trend} positive={positive} />
      <Text numberOfLines={1} style={s.marketName}>
        {item.market} APMC
        {item.distanceKm !== undefined ? ` · ${item.distanceKm} km` : ""}
      </Text>
    </Pressable>
  );
}
function Summary({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <Card style={s.summary}>
      <View style={[s.summaryAccent, { backgroundColor: accent }]} />
      <Text style={s.summaryLabel}>{label}</Text>
      <Text numberOfLines={1} style={s.summaryValue}>
        {value}
      </Text>
      <Text style={s.summarySub}>{sub}</Text>
    </Card>
  );
}

export function FarmerDashboard() {
  const { prices: commodities, source, error, isFallback, loading } = useMarketPrices();
  const { t } = useI18n();
  const marketStatus = loading
    ? "Loading market prices..."
    : isFallback
      ? `Demo fallback prices · ${error ?? "backend unavailable"}`
      : source === "government"
        ? "Government market prices"
        : "Demo market prices";
  return (
    <View style={s.root}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={s.page}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <View style={s.headerTop}>
            <View style={s.brandRow}>
              <View style={s.logo}>
                <AppIcon
                  name={{ ios: "leaf.fill", android: "eco", web: "eco" }}
                  size={21}
                  color={colors.green}
                />
              </View>
              <View>
                <Text style={s.brand}>AgriNode</Text>
                <Text style={s.tagline}>SMART FARM COMMERCE</Text>
              </View>
            </View>
            <View style={s.headerActions}>
              <Pressable
                onPress={() => router.push("/farmer/notifications")}
                style={s.bell}
              >
                <AppIcon name={icons.Alerts} size={20} color="white" />
                <View style={s.notificationDot} />
              </Pressable>
              <Pressable
                onPress={() => router.push("/farmer/profile")}
                style={s.avatar}
              >
                <Text>
                  {farmer.name
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)}
                </Text>
              </Pressable>
            </View>
          </View>
          <LocationSelector />
        </View>
        <Card style={s.greeting}>
          <View style={s.greetingCopy}>
            <Text style={s.good}>GOOD MORNING</Text>
            <Text numberOfLines={1} style={s.name}>
              {farmer.name}
            </Text>
            <View style={s.verifiedRow}>
              <AppIcon
                name={{
                  ios: "checkmark.seal.fill",
                  android: "verified",
                  web: "verified",
                }}
                size={13}
                color={colors.greenBright}
              />
              <Text style={s.verified}>Verified farmer</Text>
            </View>
          </View>
          <View style={s.weather}>
            <AppIcon
              name={{
                ios: "sun.max.fill",
                android: "wb_sunny",
                web: "wb_sunny",
              }}
              size={23}
              color={colors.amber}
            />
            <Text style={s.weatherTemp}>{farmer.weather.temperature}</Text>
            <Text style={s.weatherCopy}>{farmer.weather.condition}</Text>
          </View>
        </Card>
        {FEATURES.marketPrices && (
          <>
            <View style={s.sectionHead}>
              <View>
                <Text style={s.sectionTitle}>{t("marketWatchlist")}</Text>
                <Text style={s.sectionSub}>{marketStatus}</Text>
              </View>
              <Pressable
                onPress={() => router.push("/farmer/marketplace")}
                style={s.viewAll}
              >
                <Text style={s.viewAllText}>{t("viewAll")}</Text>
                <AppIcon
                  name={{
                    ios: "arrow.right",
                    android: "arrow_forward",
                    web: "arrow_forward",
                  }}
                  size={14}
                />
              </Pressable>
            </View>
            <ScrollView
              horizontal
              decelerationRate="fast"
              snapToInterval={168}
              snapToAlignment="start"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.watchList}
            >
              {commodities.map((item) => (
                <WatchCard key={item.id} item={item} />
              ))}
            </ScrollView>
          </>
        )}
        <View style={s.summaryGrid}>
          <Summary
            label="Total earnings"
            value="₹42,500"
            sub="↑ 12% this month"
            accent={colors.greenBright}
          />
          <Summary
            label="Active orders"
            value="3"
            sub="2 need attention"
            accent={colors.amber}
          />
          <Summary
            label="Produce listed"
            value="5 lots"
            sub="2.4 tonnes live"
            accent={colors.blue}
          />
          <Summary
            label="This week"
            value="₹18,600"
            sub="↑ 8% vs last week"
            accent="#8C55A8"
          />
        </View>
        <Text style={s.sectionTitle}>{t("quickActions")}</Text>
        <View style={s.actions}>
          {actions
            .filter(([, , enabled]) => enabled)
            .map(([label, path]) => (
              <Pressable
                key={label}
                onPress={() => router.push(path as any)}
                style={s.action}
              >
                <View style={s.actionMark}>
                  <AppIcon name={icons[label]} size={21} />
                </View>
                <Text numberOfLines={2} style={s.actionText}>
                  {label === "Sell Produce"
                    ? t("sellProduce")
                    : label === "AI Scanner"
                      ? t("aiScanner")
                      : label === "Logistics"
                        ? t("logistics")
                        : label === "Load Pooling"
                          ? t("loadPooling")
                          : label === "Payments"
                            ? t("payments")
                            : label === "Alerts"
                              ? t("alerts")
                              : label === "Market"
                                ? t("market")
                                : t("orders")}
                </Text>
              </Pressable>
            ))}
        </View>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Recent orders</Text>
          <Pressable
            onPress={() => router.push("/farmer/orders")}
            style={s.viewAll}
          >
            <Text style={s.viewAllText}>See all</Text>
            <AppIcon
              name={{
                ios: "arrow.right",
                android: "arrow_forward",
                web: "arrow_forward",
              }}
              size={14}
            />
          </Pressable>
        </View>
        <View style={s.orders}>
          {orders.map((order) => (
            <Pressable
              key={order.id}
              onPress={() => router.push("/farmer/order-details")}
            >
              <Card style={s.order}>
                <CropVisual crop={order.crop} size={42} />
                <View style={s.orderCopy}>
                  <Text style={s.orderCrop}>{order.crop}</Text>
                  <Text style={s.orderMeta}>
                    {order.quantity} · {order.grade} · {order.id}
                  </Text>
                </View>
                <View style={s.orderRight}>
                  <Text style={s.orderAmount}>{formatINR(order.amount)}</Text>
                  <StatusBadge text={order.status} />
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
        <Text style={s.sectionTitle}>Today's highlights</Text>
        <Card style={s.highlights}>
          {[
            ["Market prices up", "Most crops are up 5–10%", icons.Market],
            [
              "Vehicle assigned",
              "TN 38 AB 1234 is ready for pickup",
              icons.Logistics,
            ],
            ["Payment released", "₹42,500 is on its way", icons.Payments],
          ].map(([title, copy, icon]) => (
            <View key={title} style={s.highlight}>
              <View style={s.highlightIcon}>
                <AppIcon name={icon} size={17} color={colors.greenBright} />
              </View>
              <View style={s.highlightCopyWrap}>
                <Text style={s.highlightTitle}>{title}</Text>
                <Text style={s.highlightCopy}>{copy}</Text>
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>
      <BottomNavigation mode="farmer" active="Home" navigate={router.push} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  page: { paddingBottom: 28, gap: 18 },
  header: {
    backgroundColor: colors.green,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 22,
    gap: 13,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#DDF2D8",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    color: "white",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  tagline: {
    color: "#BFE5C7",
    fontSize: 9,
    marginTop: 2,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  bell: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#24714A",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationDot: {
    position: "absolute",
    right: 7,
    top: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#F7C95C",
    borderWidth: 1,
    borderColor: colors.green,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#DFF1D9",
    alignItems: "center",
    justifyContent: "center",
  },
  location: { flexDirection: "row", alignItems: "center", gap: 5 },
  locationText: {
    color: "#D6EFDC",
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  greeting: {
    marginHorizontal: 18,
    marginTop: -14,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    elevation: 5,
  },
  greetingCopy: { flex: 1, minWidth: 0 },
  good: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  name: { fontSize: 21, fontWeight: "900", color: colors.ink, marginTop: 4 },
  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  verified: { fontSize: 11, color: colors.greenBright, fontWeight: "800" },
  weather: {
    backgroundColor: "#FFF8DE",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 11,
    alignItems: "center",
    marginLeft: 8,
  },
  weatherTemp: {
    fontWeight: "900",
    color: colors.ink,
    fontSize: 13,
    marginTop: 2,
  },
  weatherCopy: { fontSize: 10, color: colors.muted, marginTop: 1 },
  sectionHead: {
    paddingHorizontal: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.ink,
    paddingHorizontal: 18,
    letterSpacing: -0.2,
  },
  sectionSub: { fontSize: 11, color: colors.muted, marginTop: 3 },
  viewAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 3,
  },
  viewAllText: { fontSize: 12, fontWeight: "800", color: colors.green },
  watchList: { paddingLeft: 18, paddingRight: 42, gap: 12 },
  watch: {
    width: 156,
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 12,
    gap: 5,
    elevation: 3,
    boxShadow: "0 4px 14px rgba(17,57,32,.09)",
  },
  watchTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cropArt: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#EDF4E8",
    overflow: "hidden",
    position: "relative",
  },
  artRound: {
    position: "absolute",
    width: 25,
    height: 25,
    borderRadius: 13,
    left: 9,
    top: 11,
  },
  artLeaf: {
    position: "absolute",
    width: 13,
    height: 7,
    borderRadius: 8,
    left: 15,
    top: 5,
    transform: [{ rotate: "-18deg" }],
  },
  artStem: {
    position: "absolute",
    width: 3,
    height: 30,
    left: 19,
    top: 7,
    borderRadius: 2,
  },
  artGrain: {
    position: "absolute",
    width: 8,
    height: 5,
    borderRadius: 5,
    transform: [{ rotate: "-28deg" }],
  },
  artCob: {
    position: "absolute",
    width: 14,
    height: 29,
    borderRadius: 8,
    left: 14,
    top: 7,
  },
  artHuskLeft: {
    position: "absolute",
    left: 4,
    top: 19,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 17,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    transform: [{ rotate: "-24deg" }],
  },
  artHuskRight: {
    position: "absolute",
    right: 4,
    top: 19,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 17,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    transform: [{ rotate: "24deg" }],
  },
  artPuff: {
    position: "absolute",
    top: 8,
    width: 17,
    height: 17,
    borderRadius: 9,
  },
  artLong: {
    position: "absolute",
    width: 13,
    height: 29,
    borderRadius: 10,
    left: 15,
    top: 9,
  },
  artRoot: {
    position: "absolute",
    width: 21,
    height: 16,
    borderRadius: 10,
    left: 8,
    top: 15,
    transform: [{ rotate: "-20deg" }],
  },
  artRootSmall: {
    position: "absolute",
    width: 13,
    height: 11,
    borderRadius: 8,
    left: 20,
    top: 21,
  },
  artRing: {
    position: "absolute",
    width: 17,
    height: 17,
    borderRadius: 9,
    left: 12,
    top: 15,
    borderWidth: 2,
  },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 5,
  },
  change: { fontSize: 10, fontWeight: "900" },
  cropName: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.ink,
    marginTop: 3,
  },
  price: { fontSize: 15, fontWeight: "900", color: colors.green },
  sparkline: { height: 27, width: 118, position: "relative", marginTop: 1 },
  sparkSegment: {
    position: "absolute",
    height: 2,
    borderRadius: 2,
    transformOrigin: "left center",
  },
  sparkPoint: { position: "absolute", width: 3, height: 3, borderRadius: 2 },
  sparkLatest: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 2,
    backgroundColor: colors.card,
  },
  marketName: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: "600",
    marginTop: 2,
  },
  summaryGrid: {
    paddingHorizontal: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summary: { width: "48%", padding: 12, gap: 4, overflow: "hidden" },
  summaryAccent: { width: 25, height: 3, borderRadius: 2, marginBottom: 2 },
  summaryLabel: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  summaryValue: { fontSize: 18, fontWeight: "900", color: colors.ink },
  summarySub: { fontSize: 10, fontWeight: "800", color: colors.greenBright },
  actions: {
    marginHorizontal: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  action: { width: "21%", minWidth: 64, alignItems: "center", gap: 6 },
  actionMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    fontSize: 10,
    textAlign: "center",
    fontWeight: "800",
    color: colors.ink,
    lineHeight: 13,
  },
  orders: { marginHorizontal: 18, gap: 9 },
  order: { padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  orderCopy: { flex: 1, minWidth: 0 },
  orderCrop: { fontSize: 15, fontWeight: "900", color: colors.ink },
  orderMeta: { fontSize: 10, color: colors.muted, marginTop: 3 },
  orderRight: { alignItems: "flex-end", gap: 5 },
  orderAmount: { fontSize: 13, fontWeight: "900", color: colors.ink },
  highlights: { marginHorizontal: 18, gap: 14 },
  highlight: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  highlightIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  highlightCopyWrap: { flex: 1 },
  highlightTitle: { fontSize: 13, fontWeight: "800", color: colors.ink },
  highlightCopy: { fontSize: 11, color: colors.muted, marginTop: 2 },
});

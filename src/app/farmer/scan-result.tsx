import { Card, PrimaryButton, SecondaryButton, StatusBadge } from '@/components/agri/ui';
import { useMarketPrices } from '@/hooks/use-market-prices';
import type { ScanOutcome } from '@/services/aiService';
import { calculateRecommendedPrice } from '@/services/dynamicPricingService';
import { formatKgPrice } from '@/services/pricingService';
import { colors } from '@/theme/colors';
import type { ScanIssue, ScanSeverity } from '@/types/app';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const severityColors: Record<ScanSeverity, { text: string; bg: string }> = {
  low: { text: colors.amber, bg: '#FFF4D9' },
  medium: { text: '#B8641F', bg: '#FFE9D6' },
  high: { text: colors.red, bg: '#FCEAE8' },
};

function IssueCard({ issue }: { issue: ScanIssue }) {
  const tone = severityColors[issue.severity];
  return (
    <View style={[s.issue, { backgroundColor: tone.bg }]}>
      <View style={s.issueHead}>
        <Text style={s.issueName}>{issue.name}</Text>
        <Text style={[s.issueSeverity, { color: tone.text }]}>{issue.severity.toUpperCase()}</Text>
      </View>
      <Text style={s.issueType}>{issue.type.replace('_', ' ')} · {issue.confidence}% confidence</Text>
      {issue.description ? <Text style={s.issueBody}>{issue.description}</Text> : null}
      {issue.treatment ? <Text style={s.issueTreatment}>Guidance: {issue.treatment}</Text> : null}
    </View>
  );
}

export default function ScanResult() {
  const { payload } = useLocalSearchParams<{ payload?: string }>();
  const { prices } = useMarketPrices();
  const outcome = useMemo<ScanOutcome | undefined>(() => {
    if (!payload) return undefined;
    try { return JSON.parse(payload) as ScanOutcome; } catch { return undefined; }
  }, [payload]);

  if (!outcome?.result) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
        <Text style={s.title}>Quality result</Text>
        <Card>
          <Text style={s.muted}>
            {outcome?.error ?? 'No scan result found. Start a scan from the Scanner tab.'}
          </Text>
        </Card>
        <PrimaryButton label="Scan again" onPress={() => router.replace('/farmer/scanner')} />
      </ScrollView>
    );
  }

  const result = outcome.result;

  if (!result.isCropPhoto) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
        <Text style={s.title}>Not a produce photo</Text>
        <Card>
          <Text style={s.muted}>
            {result.notCropReason ?? outcome.error ?? 'The image does not clearly show a crop or produce. Try capturing the produce filling the frame in daylight.'}
          </Text>
        </Card>
        <PrimaryButton label="Try again" onPress={() => router.replace('/farmer/scanner')} />
        <SecondaryButton label="Back to dashboard" onPress={() => router.replace('/farmer/dashboard')} />
      </ScrollView>
    );
  }

  const gradeToBadge = result.quality.grade === 'A' ? 'Grade A' : result.quality.grade === 'B' ? 'Grade B' : 'Grade C';
  const isMock = outcome.source === 'mock' || outcome.fallback === true;

  // Market price integration: match the detected crop against the live watchlist.
  const normalizedCrop = result.crop.name.trim().toLowerCase();
  const marketMatch = prices.find((item) => item.commodity.trim().toLowerCase() === normalizedCrop)
    ?? prices.find((item) => {
      const commodity = item.commodity.trim().toLowerCase();
      // Partial match only when it is unambiguous (both names substantial).
      return commodity.length >= 5 && normalizedCrop.length >= 5
        && (commodity.includes(normalizedCrop) || normalizedCrop.includes(commodity));
    });
  const marketPricePerKg = marketMatch?.normalizedPricePerKg ?? null;
  const demand: 'High' | 'Medium' | 'Low' = marketMatch?.demand ?? 'Medium';
  const quantityKg = 500;

  const pricing = marketPricePerKg !== null
    ? calculateRecommendedPrice(marketPricePerKg, result.quality.grade, result.quality.score, demand, quantityKg)
    : null;
  const multiplier = result.recommendedPriceMultiplier ?? 1;
  const aiIndexRate = marketPricePerKg !== null ? marketPricePerKg * multiplier : null;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
      <Text style={s.title}>Quality result</Text>
      <Text style={s.sub}>
        {isMock
          ? `AI Demo Analysis${outcome.error ? ` · ${outcome.error}` : ' — no live AI scan was performed'}`
          : `AI analysis via ${result.model}`}
      </Text>

      <Card>
        <StatusBadge text={gradeToBadge} />
        <Text style={s.crop}>{result.crop.name}</Text>
        {result.crop.scientificName ? <Text style={s.harvest}>{result.crop.scientificName}</Text> : null}
        <Text style={s.score}>{result.quality.score}<Text style={s.unit}>/100 quality score</Text></Text>
        <Text style={s.muted}>{result.quality.confidence}% confidence</Text>
        {marketMatch ? (
          <Text style={s.muted}>
            Live market price: {formatKgPrice(marketMatch.normalizedPricePerKg)} · {marketMatch.market} APMC, {marketMatch.district}
          </Text>
        ) : null}
      </Card>

      {outcome.error && !isMock ? <Text style={s.warnText}>{outcome.error}</Text> : null}

      <Card>
        <Text style={s.heading}>Observations</Text>
        {result.observations.length > 0
          ? result.observations.map((entry) => <Text key={entry} style={s.muted}>- {entry}</Text>)
          : <Text style={s.muted}>- No specific observations returned</Text>}
      </Card>

      <Card>
        <Text style={s.heading}>Detected issues</Text>
        {result.issues.length === 0
          ? <Text style={s.muted}>- No visible diseases, pests, or quality defects detected</Text>
          : result.issues.map((issue, index) => <IssueCard key={`${issue.name}-${index}`} issue={issue} />)}
      </Card>

      <Card>
        <Text style={s.muted}>AI Index Rate</Text>
        <Text style={s.price}>{aiIndexRate !== null ? `INR ${aiIndexRate.toFixed(2)}/kg` : 'Unavailable — no live market price for this crop'}</Text>
        <Text style={s.muted}>Recommended Floor Price</Text>
        <Text style={s.price}>{pricing ? `INR ${pricing.floorPricePerKg.toFixed(2)}/kg` : 'Unavailable — no live market price for this crop'}</Text>
        <Text style={s.muted}>
          {pricing
            ? `Suggested price: INR ${pricing.suggestedPricePerKg.toFixed(2)}/kg · ${demand} demand + Grade ${result.quality.grade} premium`
            : `No current government price found for ${result.crop.name}; prices are not invented.`}
        </Text>
      </Card>

      <PrimaryButton
        label="List this produce"
        onPress={() => router.push({ pathname: '/farmer/listing', params: {
          crop: result.crop.name,
          grade: gradeToBadge,
          qualityScore: String(result.quality.score),
          qualityConfidence: String(result.quality.confidence),
          scanSource: outcome.source,
          ...(aiIndexRate !== null ? { price: aiIndexRate.toFixed(2) } : {}),
        } })}
      />
      <SecondaryButton label="Scan again" onPress={() => router.replace('/farmer/scanner')} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page:{padding:22,gap:16,backgroundColor:colors.cream},
  title:{fontSize:28,fontWeight:'900',color:colors.ink},
  sub:{color:colors.muted},
  crop:{fontSize:23,fontWeight:'900',color:colors.ink},
  harvest:{fontSize:13,fontWeight:'800',color:colors.green},
  score:{fontSize:42,fontWeight:'900',color:colors.green},
  unit:{fontSize:14,color:colors.muted},
  muted:{color:colors.muted,lineHeight:23},
  heading:{fontWeight:'800',fontSize:18,color:colors.ink},
  price:{fontWeight:'900',fontSize:22,color:colors.green},
  issue:{borderRadius:12,padding:12,gap:4,marginTop:8},
  issueHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},
  issueName:{fontWeight:'900',fontSize:15,color:colors.ink,flexShrink:1},
  issueSeverity:{fontSize:11,fontWeight:'800'},
  issueType:{fontSize:11,color:colors.muted,fontWeight:'700'},
  issueBody:{fontSize:12,color:colors.ink,lineHeight:18},
  issueTreatment:{fontSize:12,color:'#426081',lineHeight:18},
  warnText:{color:'#8A5A00',fontSize:12,lineHeight:18},
});

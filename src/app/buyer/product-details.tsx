import { Card, PrimaryButton, SecondaryButton, StatusBadge } from '@/components/agri/ui';
import { useApp } from '@/context/AppContext';
import { formatINR, formatKgPrice } from '@/services/pricingService';
import { colors } from '@/theme/colors';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

export default function ProductDetails() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { listings, placeOrder } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const item = listings.find((listing) => listing.id === id);

  if (!item) return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}><Text style={s.title}>Listing unavailable</Text><Card><Text style={s.copy}>This listing is no longer available in the current marketplace.</Text></Card><SecondaryButton label="Back to marketplace" onPress={() => router.back()} /></ScrollView>;

  const buy = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const placed = await placeOrder(item);
    setBusy(false);
    if (placed) router.replace('/buyer/orders');
    else setError('The order was not placed. Check the backend connection and listing availability.');
  };
  const availableQuantity = item.availableQuantityKg ?? item.quantityKg;

  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}><Text style={s.title}>{item.crop}</Text><Text style={s.sub}>{item.verified ? 'Verified farmer listing' : 'Marketplace listing pending review'}</Text><Card><StatusBadge text={item.grade} /><Text style={s.price}>{formatKgPrice(item.pricePerKg)}</Text><Text style={s.copy}>{availableQuantity} kg available | Total {formatINR(availableQuantity * item.pricePerKg)}</Text><Text style={s.copy}>Farmer location: {item.location}</Text><Text style={s.copy}>Harvested: {item.harvestDate}</Text>{item.qualityScore !== undefined ? <Text style={s.copy}>Quality score: {item.qualityScore}/100{item.qualityConfidence !== undefined ? ` | ${item.qualityConfidence}% confidence` : ''}</Text> : null}<Text style={s.copy}>{item.description}</Text></Card>{error ? <Text style={s.error}>{error}</Text> : null}<PrimaryButton label={busy ? 'Placing order...' : 'Place order'} onPress={buy} /><SecondaryButton label="Back to marketplace" onPress={() => router.back()} /><Text style={s.note}>Settlement is a demo calculation; no payment is collected.</Text></ScrollView>;
}
const s = StyleSheet.create({ page: { padding: 20, gap: 15, backgroundColor: colors.cream }, title: { fontSize: 29, fontWeight: '900', color: colors.ink }, sub: { color: colors.muted, marginTop: -9 }, price: { fontSize: 27, fontWeight: '900', color: colors.green }, copy: { color: colors.muted, lineHeight: 21 }, error: { color: colors.red, lineHeight: 21 }, note: { fontSize: 11, textAlign: 'center', color: colors.muted } });

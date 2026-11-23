import { Card, PrimaryButton, SecondaryButton, StatusBadge } from '@/components/agri/ui';
import { useApp } from '@/context/AppContext';
import { selectOndcListing } from '@/services/ondcCommerceService';
import { formatINR, formatKgPrice } from '@/services/pricingService';
import { colors } from '@/theme/colors';
import type { OndcQuote } from '@/types/ondc';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';

export default function ProductDetails() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const listingId = typeof id === 'string' ? id : '';
  const { listings, buyerSelectedListing } = useApp();
  const [quantity, setQuantity] = useState('1');
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string>();
  const selectingRequest = useRef(false);
  const [quote, setQuote] = useState<OndcQuote>();
  const item = buyerSelectedListing?.id === listingId
    ? buyerSelectedListing
    : listings.find((listing) => listing.id === listingId && listing.dataSource === 'backend');

  if (!item) return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}><Text style={s.title}>Listing unavailable</Text><Card><Text style={s.copy}>This listing is no longer available in the current marketplace.</Text></Card><SecondaryButton label="Back to marketplace" onPress={() => router.back()} /></ScrollView>;

  const availableQuantity = item.availableQuantityKg ?? item.quantityKg;
  const select = async () => {
    if (selectingRequest.current) return;
    const requestedQuantity = Number(quantity);
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      setError('Enter a quantity greater than 0 kg.');
      setQuote(undefined);
      return;
    }
    if (requestedQuantity > availableQuantity) {
      setError(`Quantity cannot exceed ${availableQuantity} kg available.`);
      setQuote(undefined);
      return;
    }

    selectingRequest.current = true;
    setSelecting(true);
    setError(undefined);
    try {
      const response = await selectOndcListing({ listingId: item.id, quantityKg: requestedQuantity });
      setQuote(response.quote);
    } catch (reason) {
      setQuote(undefined);
      setError(reason instanceof Error ? reason.message : 'The listing could not be selected. Please try again.');
    } finally {
      selectingRequest.current = false;
      setSelecting(false);
    }
  };

  const continueToCheckout = () => {
    if (!quote) {
      void select();
      return;
    }
    router.push({
      pathname: '/buyer/checkout',
      params: {
        id: item.id,
        quantityKg: String(quote.quantityKg),
        pricePerKg: String(quote.pricePerKg),
        totalAmount: String(quote.totalAmount),
      },
    });
  };

  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}><Text style={s.title}>{item.crop}</Text><Text style={s.sub}>{item.verified ? 'Verified farmer listing' : 'Marketplace listing'}</Text><Card>{item.grade ? <StatusBadge text={item.grade} /> : null}<Text style={s.price}>{formatKgPrice(item.pricePerKg)}</Text><Text style={s.copy}>{availableQuantity} kg available</Text><Text style={s.copy}>Pickup location: {item.location || 'Not available'}</Text><Text style={s.copy}>Harvested: {item.harvestDate}</Text>{item.qualityScore !== undefined ? <Text style={s.copy}>Quality score: {item.qualityScore}/100{item.qualityConfidence !== undefined ? ` | ${item.qualityConfidence}% confidence` : ''}</Text> : null}{item.description ? <Text style={s.copy}>{item.description}</Text> : null}</Card><Text style={s.label}>Quantity (kg)</Text><TextInput value={quantity} onChangeText={(value) => { setQuantity(value); setQuote(undefined); setError(undefined); }} keyboardType="decimal-pad" accessibilityLabel="Quantity in kilograms" style={s.input} /><Card><Text style={s.copy}>Quote total</Text><Text style={s.price}>{quote ? formatINR(quote.totalAmount) : 'Select a quantity to get a quote'}</Text>{quote ? <Text style={s.copy}>{quote.quantityKg} kg at {formatKgPrice(quote.pricePerKg)}</Text> : null}</Card>{error ? <Text style={s.error}>{error}</Text> : null}<PrimaryButton label={selecting ? 'Checking availability...' : quote ? 'Continue to checkout' : 'Get price and availability'} onPress={continueToCheckout} /><SecondaryButton label="Back to marketplace" onPress={() => router.back()} /><Text style={s.note}>Settlement is a demo calculation; no payment is collected.</Text></ScrollView>;
}
const s = StyleSheet.create({ page: { padding: 20, gap: 15, backgroundColor: colors.cream }, title: { fontSize: 29, fontWeight: '900', color: colors.ink }, sub: { color: colors.muted, marginTop: -9 }, price: { fontSize: 27, fontWeight: '900', color: colors.green }, copy: { color: colors.muted, lineHeight: 21 }, error: { color: colors.red, lineHeight: 21 }, note: { fontSize: 11, textAlign: 'center', color: colors.muted }, label: { fontSize: 13, fontWeight: '700', color: colors.ink }, input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, color: colors.ink } });

import { Card, PrimaryButton, SecondaryButton } from '@/components/agri/ui';
import { DEMO_USER_IDS } from '@/constants/demoUsers';
import { useApp } from '@/context/AppContext';
import { formatINR } from '@/services/pricingService';
import { colors } from '@/theme/colors';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export default function Listing() {
  const { createListing } = useApp();
  const { crop: scanCrop, grade: scanGrade, price: scanPrice, qualityScore, qualityConfidence, scanSource, location: scanLocation } = useLocalSearchParams<{ crop?: string; grade?: string; price?: string; qualityScore?: string; qualityConfidence?: string; scanSource?: 'gemini' | 'mock'; location?: string }>();
  const prefilled = Boolean(scanCrop || scanGrade || scanPrice);
  const [crop, setCrop] = useState(scanCrop ?? '');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState(scanPrice ?? '');
  const [grade, setGrade] = useState(scanGrade ?? '');
  const [location, setLocation] = useState(scanLocation ?? '');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const value = (Number(quantity) || 0) * (Number(price) || 0);

  const publish = async () => {
    if (busy) return;
    const quantityKg = Number(quantity);
    const pricePerKg = Number(price);
    if (!crop.trim() || !grade.trim() || !location.trim() || !Number.isFinite(quantityKg) || quantityKg <= 0 || !Number.isFinite(pricePerKg) || pricePerKg <= 0) {
      setError('Enter crop, grade, location, and positive quantity and price values.');
      return;
    }
    setBusy(true);
    setError(undefined);
    const published = await createListing({
      farmerId: DEMO_USER_IDS.farmer,
      crop: crop.trim(),
      grade: grade.trim(),
      quantityKg,
      pricePerKg,
      harvestDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      location: location.trim(),
      description: 'Freshly harvested, quality sorted produce',
      qualityScore: qualityScore ? Number(qualityScore) : undefined,
      qualityConfidence: qualityConfidence ? Number(qualityConfidence) : undefined,
      scanSource,
    });
    setBusy(false);
    if (published) setDone(true);
    else setError('Listing was not published. Check the backend connection and try again.');
  };

  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>{done ? <Card><Text style={s.title}>Listing published</Text><Text style={s.muted}>{crop} is now available in the Buyer marketplace.</Text><PrimaryButton label="Back to dashboard" onPress={() => router.replace('/farmer/dashboard')} /></Card> : <><Text style={s.title}>List produce</Text><Text style={s.muted}>Create a local demo listing for verified buyers.{prefilled ? ' Prefilled from your latest scan.' : ''}</Text><Field label="Crop" value={crop} set={setCrop} /><Field label="Quantity (kg)" value={quantity} set={setQuantity} numeric /><Field label="Quality grade" value={grade} set={setGrade} /><Field label="Price (INR / kg)" value={price} set={setPrice} numeric /><Field label="Harvest date" value={new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} editable={false} /><Field label="Location" value={location} set={setLocation} />{qualityScore ? <Text style={s.muted}>Scan quality: {qualityScore}/100 ({qualityConfidence ?? 'unknown'}% confidence){scanSource === 'mock' ? ' · demo analysis' : ''}</Text> : null}{error ? <Text style={s.error}>{error}</Text> : null}<Card><Text style={s.muted}>Estimated listing value</Text><Text style={s.value}>{formatINR(value)}</Text></Card><PrimaryButton label={busy ? 'Publishing...' : 'Publish listing'} onPress={publish} /><SecondaryButton label="Cancel" onPress={() => router.back()} /></>}</ScrollView>;
}
function Field({ label, value, set, editable = true, numeric = false }: { label: string; value: string; set?: (value: string) => void; editable?: boolean; numeric?: boolean }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={set} editable={editable} keyboardType={numeric ? 'decimal-pad' : 'default'} style={s.input} /></View>;
}

const s = StyleSheet.create({ page: { padding: 20, gap: 15, backgroundColor: colors.cream }, title: { fontSize: 28, fontWeight: '900', color: colors.ink }, muted: { color: colors.muted, lineHeight: 21 }, error: { color: colors.red, lineHeight: 21 }, field: { gap: 6 }, label: { fontSize: 12, fontWeight: '800', color: colors.ink }, input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, padding: 13, borderRadius: 12, color: colors.ink }, value: { fontSize: 27, fontWeight: '900', color: colors.green } });

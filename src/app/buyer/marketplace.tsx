import { BottomNavigation, Card, StatusBadge } from '@/components/agri/ui';
import { useApp } from '@/context/AppContext';
import { formatKgPrice } from '@/services/pricingService';
import { colors } from '@/theme/colors';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export default function BuyerMarketplace() {
  const { listings, listingsLoading, listingsError } = useApp();
  const [query, setQuery] = useState('');
  const [grade, setGrade] = useState('All');
  const [sort, setSort] = useState<'none' | 'low' | 'high'>('none');
  const results = useMemo(() => listings
    .filter((item) => item.status === 'ACTIVE' && item.crop.toLowerCase().includes(query.toLowerCase()) && (grade === 'All' || item.grade === grade))
    .sort((a, b) => sort === 'low' ? a.pricePerKg - b.pricePerKg : sort === 'high' ? b.pricePerKg - a.pricePerKg : 0), [listings, query, grade, sort]);

  return <View style={s.root}><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
    <Text style={s.title}>Marketplace</Text>
    {listingsError ? <Text style={s.muted}>Backend unavailable. Showing local demo listings.</Text> : null}
    <TextInput value={query} onChangeText={setQuery} placeholder="Search produce" style={s.search} />
    <View style={s.filters}>{['All', 'Grade A'].map((item) => <Pressable key={item} onPress={() => setGrade(item)}><StatusBadge text={grade === item ? `${item} selected` : item} /></Pressable>)}<Pressable onPress={() => setSort(sort === 'low' ? 'high' : 'low')}><StatusBadge text={sort === 'high' ? 'Price high-low' : 'Price low-high'} /></Pressable></View>
    {listingsLoading ? <Text style={s.muted}>Loading available produce...</Text> : results.length === 0 ? <Card><Text style={s.muted}>No active listings match these filters.</Text></Card> : results.map((item) => <Pressable key={item.id} onPress={() => router.push({ pathname: '/buyer/product-details', params: { id: item.id } } as any)}><Card><View style={s.row}><View><Text style={s.crop}>{item.crop}</Text><Text style={s.muted}>{item.grade} | {item.availableQuantityKg ?? item.quantityKg} kg available</Text></View><StatusBadge text={item.verified ? 'Verified' : 'Pending review'} /></View><Text style={s.price}>{formatKgPrice(item.pricePerKg)}</Text>{item.qualityScore !== undefined ? <Text style={s.muted}>Quality score: {item.qualityScore}/100</Text> : null}<Text style={s.muted}>{item.location}{item.distanceKm > 0 ? ` | ${item.distanceKm} km away` : ''}</Text><Text style={s.view}>View details -&gt;</Text></Card></Pressable>)}
  </ScrollView><BottomNavigation mode="buyer" active="Market" navigate={router.push} /></View>;
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.cream }, page: { padding: 18, gap: 14, paddingBottom: 28 }, title: { fontSize: 28, fontWeight: '900', color: colors.ink }, search: { backgroundColor: colors.card, borderRadius: 12, padding: 13, color: colors.ink }, filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, crop: { fontSize: 19, fontWeight: '900', color: colors.ink }, price: { fontSize: 22, fontWeight: '900', color: colors.green }, view: { fontSize: 12, fontWeight: '800', color: colors.green }, muted: { color: colors.muted, lineHeight: 20 } });

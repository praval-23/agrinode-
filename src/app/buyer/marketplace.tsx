import { BottomNavigation, Card, StatusBadge } from '@/components/agri/ui';
import { useApp } from '@/context/AppContext';
import { mapBackendListing } from '@/services/listingApi';
import { searchOndcListings } from '@/services/ondcCommerceService';
import { formatKgPrice } from '@/services/pricingService';
import { colors } from '@/theme/colors';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export default function BuyerMarketplace() {
  const { setBuyerSelectedListing } = useApp();
  const [query, setQuery] = useState('');
  const [grade, setGrade] = useState('All');
  const [sort, setSort] = useState<'none' | 'low' | 'high'>('none');
  const [listings, setListings] = useState<ReturnType<typeof mapBackendListing>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(undefined);
      setListings([]);
      void searchOndcListings({ crop: query.trim() || undefined, grade: grade === 'All' ? undefined : grade })
        .then((response) => {
          if (active) setListings(response.listings.map(mapBackendListing));
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : 'Marketplace search failed. Please try again.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query, grade]);

  const results = useMemo(() => [...listings]
    .sort((a, b) => sort === 'low' ? a.pricePerKg - b.pricePerKg : sort === 'high' ? b.pricePerKg - a.pricePerKg : 0), [listings, sort]);

  return <View style={s.root}><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
    <Text style={s.title}>Marketplace</Text>
    <TextInput value={query} onChangeText={setQuery} placeholder="Search produce" placeholderTextColor={colors.muted} style={s.search} />
    <View style={s.filters}>{['All', 'Grade A'].map((item) => <Pressable key={item} onPress={() => setGrade(item)}><StatusBadge text={grade === item ? `${item} selected` : item} /></Pressable>)}<Pressable onPress={() => setSort(sort === 'low' ? 'high' : 'low')}><StatusBadge text={sort === 'high' ? 'Price high-low' : 'Price low-high'} /></Pressable></View>
    {loading ? <Text style={s.muted}>Searching available listings...</Text> : error ? <Card><Text style={s.error}>{error}</Text></Card> : results.length === 0 ? <Card><Text style={s.muted}>No active listings match these filters.</Text></Card> : results.map((item) => <Pressable key={item.id} onPress={() => { setBuyerSelectedListing(item); router.push({ pathname: '/buyer/product-details', params: { id: item.id } }); }}><Card><View style={s.row}><View><Text style={s.crop}>{item.crop}</Text>{item.grade ? <Text style={s.muted}>{item.grade}</Text> : null}<Text style={s.muted}>{item.availableQuantityKg ?? item.quantityKg} kg available</Text></View><StatusBadge text={item.verified ? 'Verified' : 'Pending review'} /></View><Text style={s.price}>{formatKgPrice(item.pricePerKg)}</Text>{item.qualityScore !== undefined ? <Text style={s.muted}>Quality score: {item.qualityScore}/100</Text> : null}<Text style={s.muted}>{item.location || 'Pickup location unavailable'}</Text><Text style={s.view}>View details -&gt;</Text></Card></Pressable>)}
  </ScrollView><BottomNavigation mode="buyer" active="Market" navigate={router.push} /></View>;
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.cream }, page: { padding: 18, gap: 14, paddingBottom: 28 }, title: { fontSize: 28, fontWeight: '900', color: colors.ink }, search: { backgroundColor: colors.card, borderRadius: 12, padding: 13, color: colors.ink }, filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, crop: { fontSize: 19, fontWeight: '900', color: colors.ink }, price: { fontSize: 22, fontWeight: '900', color: colors.green }, view: { fontSize: 12, fontWeight: '800', color: colors.green }, muted: { color: colors.muted, lineHeight: 20 }, error: { color: colors.red, lineHeight: 20 } });

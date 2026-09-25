import { DEMO_USER_IDS } from '@/constants/demoUsers';
import { useApp } from '@/context/AppContext';
import { useI18n } from '@/i18n';
import { formatINR, formatKgPrice } from '@/services/pricingService';
import { colors } from '@/theme/colors';
import type { AppRole } from '@/types/app';
import type { OrderStatus } from '@/types/order';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomNavigation, Card, PrimaryButton, StatusBadge } from './ui';

const next: Partial<Record<OrderStatus, OrderStatus>> = { PLACED: 'ACCEPTED', ACCEPTED: 'PRODUCE_READY', PRODUCE_READY: 'PICKUP_ASSIGNED', PICKUP_ASSIGNED: 'IN_TRANSIT', IN_TRANSIT: 'DELIVERED', DELIVERED: 'COMPLETED' };

export function OrderList({ mode }: { mode: AppRole }) {
  const { orders, advanceOrder } = useApp();
  const { t } = useI18n();
  const mine = orders.filter((item) => mode === 'farmer' ? item.farmerId === DEMO_USER_IDS.farmer : item.buyerId === DEMO_USER_IDS.buyer);
  return <View style={s.root}><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}><Text style={s.title}>{mode === 'farmer' ? t('orders') : 'My orders'}</Text>{mine.length === 0 ? <Card><Text style={s.muted}>No orders yet.</Text></Card> : mine.map((item) => { const nextStatus = next[item.status]; const details = () => router.push(mode === 'farmer' ? '/farmer/order-details' : '/buyer/order-details'); return <Card key={item.id}><View style={s.row}><Text style={s.crop}>{item.crop}</Text><StatusBadge text={item.status.replaceAll('_', ' ')} /></View><Text style={s.muted}>{item.quantityKg} kg | {formatKgPrice(item.pricePerKg)}</Text><Text style={s.amount}>{formatINR(item.totalAmount)}</Text>{mode === 'farmer' && nextStatus ? <PrimaryButton label={nextStatus.replaceAll('_', ' ')} onPress={() => advanceOrder(item.id, nextStatus)} /> : null}<Pressable onPress={details}><Text style={s.view}>View order details -&gt;</Text></Pressable></Card>; })}</ScrollView><BottomNavigation mode={mode} active="Orders" navigate={router.push} /></View>;
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.cream }, page: { padding: 18, gap: 13, paddingBottom: 28 }, title: { fontSize: 28, fontWeight: '900', color: colors.ink }, row: { flexDirection: 'row', justifyContent: 'space-between' }, crop: { fontSize: 17, fontWeight: '900', color: colors.ink }, muted: { fontSize: 12, color: colors.muted }, amount: { fontWeight: '900', fontSize: 18, color: colors.green }, view: { fontSize: 12, color: colors.green, fontWeight: '800' } });

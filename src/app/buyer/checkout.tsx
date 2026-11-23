import { AppHeader, Card, PrimaryButton, SecondaryButton, StatusBadge } from '@/components/agri/ui';
import { DEMO_USER_IDS } from '@/constants/demoUsers';
import { useApp } from '@/context/AppContext';
import { confirmOndcOrder, getOndcOrderStatus, getOndcOrderTracking, initializeOndcOrder } from '@/services/ondcCommerceService';
import { formatINR, formatKgPrice } from '@/services/pricingService';
import { colors } from '@/theme/colors';
import type { OndcOrder, OndcOrderStatusResponse, OndcTrackResponse } from '@/types/ondc';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

function paramValue(value: string | string[] | undefined): string {
	return typeof value === 'string' ? value : '';
}

export default function Checkout() {
	const params = useLocalSearchParams<{ id?: string; quantityKg?: string; pricePerKg?: string; totalAmount?: string }>();
	const listingId = paramValue(params.id);
	const quantityKg = Number(paramValue(params.quantityKg));
	const pricePerKg = Number(paramValue(params.pricePerKg));
	const totalAmount = Number(paramValue(params.totalAmount));
	const { buyerSelectedListing, listings } = useApp();
	const listing = buyerSelectedListing?.id === listingId
		? buyerSelectedListing
		: listings.find((item) => item.id === listingId && item.dataSource === 'backend');
	const [deliveryLocation, setDeliveryLocation] = useState('');
	const [initializing, setInitializing] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [error, setError] = useState<string>();
	const [order, setOrder] = useState<OndcOrder>();
	const [tracking, setTracking] = useState(false);
	const [trackingLoading, setTrackingLoading] = useState(false);
	const [trackingError, setTrackingError] = useState<string>();
	const [status, setStatus] = useState<OndcOrderStatusResponse>();
	const [trackingData, setTrackingData] = useState<OndcTrackResponse>();
	const submitting = useRef(false);

	const canSubmit = Boolean(
		listing && listingId && Number.isFinite(quantityKg) && quantityKg > 0 &&
		quantityKg <= (listing.availableQuantityKg ?? listing.quantityKg) &&
		Number.isFinite(pricePerKg) && pricePerKg > 0 && Number.isFinite(totalAmount) && totalAmount > 0,
	);

	const placeOrder = async () => {
		if (submitting.current || !canSubmit) {
			if (!canSubmit) setError('The selected listing or quote is no longer available. Return to the marketplace and select it again.');
			return;
		}
		if (!deliveryLocation.trim()) {
			setError('Enter a delivery location to continue.');
			return;
		}

		submitting.current = true;
		setError(undefined);
		setInitializing(true);
		let initSucceeded = false;
		try {
			const init = await initializeOndcOrder({
				listingId,
				quantityKg,
				deliveryLocation: deliveryLocation.trim(),
				buyerId: DEMO_USER_IDS.buyer,
			});
			initSucceeded = true;
			if (init.nextAction !== 'confirm') throw new Error('Checkout could not continue to order confirmation.');

			setInitializing(false);
			setConfirming(true);
			const confirmation = await confirmOndcOrder({
				listingId: init.item.itemId,
				quantityKg: init.quote.quantityKg,
				deliveryLocation: init.fulfillment.deliveryLocation,
				buyerId: init.buyer.id,
				transactionId: init.context.transactionId,
			});
			setOrder(confirmation.order);
		} catch (reason) {
			const message = reason instanceof Error ? reason.message : 'Please try again.';
			setError(initSucceeded ? `Order could not be confirmed: ${message}` : `Checkout could not be initialized: ${message}`);
		} finally {
			submitting.current = false;
			setInitializing(false);
			setConfirming(false);
		}
	};

	const loadTracking = async () => {
		if (!order || trackingLoading) return;
		setTracking(true);
		setTrackingLoading(true);
		setTrackingError(undefined);
		setStatus(undefined);
		setTrackingData(undefined);
		try {
			const [orderStatus, orderTracking] = await Promise.all([
				getOndcOrderStatus(order.id),
				getOndcOrderTracking(order.id),
			]);
			setStatus(orderStatus);
			setTrackingData(orderTracking);
		} catch (reason) {
			setTrackingError(reason instanceof Error ? reason.message : 'Order status or tracking could not be loaded. Please try again.');
		} finally {
			setTrackingLoading(false);
		}
	};

	if (order) {
		return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
			<AppHeader title="Order confirmed" subtitle="Your AgriNode order was created successfully." />
			<Card>
				<StatusBadge text={order.status} />
				<Text style={s.title}>Order {order.id}</Text>
				<Text style={s.copy}>Crop: {order.crop}</Text>
				<Text style={s.copy}>Quantity: {order.quantityKg} kg</Text>
				<Text style={s.copy}>Price: {formatKgPrice(order.pricePerKg)}</Text>
				<Text style={s.total}>{formatINR(order.totalAmount)}</Text>
				<Text style={s.copy}>Payment status: {order.paymentStatus}</Text>
				<Text style={s.copy}>Transport status: {order.transportStatus}</Text>
			</Card>
			<PrimaryButton label={trackingLoading ? 'Loading tracking...' : 'Track order'} onPress={loadTracking} />
			{trackingError ? <Text style={s.error}>{trackingError}</Text> : null}
			{tracking && status && trackingData ? <Card>
				<Text style={s.title}>Order tracking</Text>
				<Text style={s.copy}>Order status: {status.status}</Text>
				<Text style={s.copy}>Payment status: {status.paymentStatus}</Text>
				<Text style={s.copy}>Transport status: {status.transportStatus}</Text>
				<Text style={s.copy}>Pickup location: {trackingData.fulfillment.pickupLocation ?? 'Not available'}</Text>
				<Text style={s.copy}>Delivery location: {trackingData.fulfillment.deliveryLocation ?? 'Not available'}</Text>
				<Text style={s.copy}>Transporter: {trackingData.fulfillment.transporterId ?? 'Not assigned'}</Text>
				<Text style={s.copy}>Route status: {trackingData.fulfillment.routeStatus === 'NOT_CALCULATED' ? 'Route not calculated' : trackingData.fulfillment.routeStatus}</Text>
				{trackingData.fulfillment.routeSummary ? <Text style={s.copy}>Route summary: {trackingData.fulfillment.routeSummary}</Text> : null}
			</Card> : null}
			<SecondaryButton label="Back to marketplace" onPress={() => router.replace('/buyer/marketplace')} />
		</ScrollView>;
	}

	return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
		<AppHeader title="Checkout" subtitle="Confirm delivery details before placing your order." />
		{canSubmit && listing ? <Card>
			<Text style={s.title}>Order summary</Text>
			<Text style={s.copy}>{listing.crop}{listing.grade ? ` · ${listing.grade}` : ''}</Text>
			<Text style={s.copy}>{quantityKg} kg at {formatKgPrice(pricePerKg)}</Text>
			<Text style={s.total}>{formatINR(totalAmount)}</Text>
			<Text style={s.copy}>Pickup: {listing.location || 'Not available'}</Text>
		</Card> : <Card><Text style={s.error}>Selected listing or backend quote is unavailable. Return to the marketplace and select a listing again.</Text></Card>}
		<View style={s.field}>
			<Text style={s.label}>Delivery location</Text>
			<TextInput value={deliveryLocation} onChangeText={setDeliveryLocation} placeholder="Enter delivery address or location" placeholderTextColor={colors.muted} accessibilityLabel="Delivery location" style={s.input} />
		</View>
		<Text style={s.note}>Payment is not collected in this demo checkout.</Text>
		{error ? <Text style={s.error}>{error}</Text> : null}
		<PrimaryButton label={initializing ? 'Initializing checkout...' : confirming ? 'Confirming order...' : 'Place order'} onPress={placeOrder} />
		<SecondaryButton label="Back to product" onPress={() => router.back()} />
	</ScrollView>;
}

const s = StyleSheet.create({
	page: { padding: 20, gap: 15, backgroundColor: colors.cream },
	title: { fontSize: 19, fontWeight: '900', color: colors.ink },
	total: { fontSize: 25, fontWeight: '900', color: colors.green },
	copy: { color: colors.muted, lineHeight: 21 },
	label: { fontSize: 13, fontWeight: '700', color: colors.ink },
	field: { gap: 6 },
	input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, color: colors.ink },
	error: { color: colors.red, lineHeight: 21 },
	note: { fontSize: 12, textAlign: 'center', color: colors.muted },
});

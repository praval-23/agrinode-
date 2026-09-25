import { useLocationSelection } from '@/context/LocationContext';
import { marketLocations } from '@/data/marketLocations';
import { colors } from '@/theme/colors';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppIcon } from './ui';

const manualOptions = ['Nizamabad', 'Hyderabad', 'Kolar', 'Bengaluru', 'Mysuru', 'Tumakuru', 'Hassan', 'Mumbai', 'Pune', 'Delhi'];

export function LocationSelector() {
  const { location, loading, error, useCurrentLocation, setManualLocation } = useLocationSelection();
  const [visible, setVisible] = useState(false);
  const [city, setCity] = useState(location.city);
  const [district, setDistrict] = useState(location.district ?? '');
  const [state, setState] = useState(location.state);

  useEffect(() => {
    if (visible) { setCity(location.city); setDistrict(location.district ?? ''); setState(location.state); }
  }, [location, visible]);

  const choosePreset = (nextCity: string) => {
    const next = marketLocations[nextCity];
    setCity(next.city); setDistrict(next.district); setState(next.state);
  };

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose market location" onPress={() => setVisible(true)} style={s.trigger}>
      <AppIcon name={{ ios: 'location.fill', android: 'location_on', web: 'location_on' }} size={14} color="#BFE5C7" />
      <View style={s.triggerCopy}><Text numberOfLines={1} style={s.locationText}>{location.city}, {location.state}</Text><Text style={s.locationSource}>{location.source === 'demo' ? 'Demo Location' : location.source === 'gps' ? 'Current location' : 'Manual location'}</Text></View>
      <AppIcon name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={15} color="#D6EFDC" />
    </Pressable>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
      <View style={s.backdrop}><View style={s.sheet}>
        <View style={s.sheetHead}><View><Text style={s.title}>Market location</Text><Text style={s.sub}>Choose how AgriNode finds nearby markets.</Text></View><Pressable onPress={() => setVisible(false)} style={s.close}><Text style={s.closeText}>×</Text></Pressable></View>
        <Pressable style={s.currentButton} onPress={useCurrentLocation} disabled={loading}><AppIcon name={{ ios: 'location.fill', android: 'my_location', web: 'my_location' }} size={18} color="white" /><Text style={s.currentText}>{loading ? 'Finding current location...' : 'Use current location'}</Text></Pressable>
        {error ? <Text style={s.error}>{error}. Showing Demo Location until you choose another option.</Text> : null}
        <Text style={s.label}>Manual location</Text>
        <TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.muted} style={s.input} />
        <TextInput value={district} onChangeText={setDistrict} placeholder="District" placeholderTextColor={colors.muted} style={s.input} />
        <TextInput value={state} onChangeText={setState} placeholder="State" placeholderTextColor={colors.muted} style={s.input} />
        <Pressable style={s.save} onPress={() => { setManualLocation(city, district, state); setVisible(false); }}><Text style={s.saveText}>Use manual location</Text></Pressable>
        <Text style={s.label}>Quick choices</Text>
        <View style={s.options}>{manualOptions.map(option => <Pressable key={option} onPress={() => choosePreset(option)} style={s.option}><Text style={s.optionText}>{option}, {marketLocations[option].state}</Text></Pressable>)}</View>
      </View></View>
    </Modal>
  </>;
}

const s = StyleSheet.create({ trigger: { flexDirection: 'row', alignItems: 'center', gap: 5 }, triggerCopy: { flex: 1, minWidth: 0 }, locationText: { color: '#D6EFDC', fontSize: 12, fontWeight: '600' }, locationSource: { color: '#A9D4B2', fontSize: 9, marginTop: 2 }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,57,32,.35)' }, sheet: { backgroundColor: colors.cream, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 10 }, sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }, title: { fontSize: 22, fontWeight: '900', color: colors.ink }, sub: { color: colors.muted, fontSize: 12, marginTop: 3 }, close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' }, closeText: { color: colors.green, fontSize: 24, lineHeight: 25 }, currentButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.green, padding: 13, borderRadius: 12 }, currentText: { color: 'white', fontWeight: '800' }, error: { color: colors.red, fontSize: 12, lineHeight: 17 }, label: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 4 }, input: { backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink }, save: { alignItems: 'center', padding: 12, borderWidth: 1, borderColor: colors.green, borderRadius: 12 }, saveText: { color: colors.green, fontWeight: '800' }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, option: { backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }, optionText: { color: colors.ink, fontSize: 12, fontWeight: '700' } });
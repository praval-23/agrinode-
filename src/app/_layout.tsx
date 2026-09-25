import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { AppProvider } from '@/context/AppContext';
import { I18nProvider } from '@/i18n';
import { LocationProvider } from '@/context/LocationContext';
export default function RootLayout() { return <SafeAreaProvider><I18nProvider><AppProvider><LocationProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShadowVisible: false, headerStyle: { backgroundColor: colors.cream }, headerTintColor: colors.green, contentStyle: { backgroundColor: colors.cream }, headerTitleStyle: { fontWeight: '800' } }}><Stack.Screen name="index" options={{ headerShown: false }} /><Stack.Screen name="role" options={{ title: 'Choose your role' }} /><Stack.Screen name="farmer" options={{ headerShown: false }} /><Stack.Screen name="buyer" options={{ headerShown: false }} /><Stack.Screen name="settings" options={{ title: 'Settings' }} /></Stack></LocationProvider></AppProvider></I18nProvider></SafeAreaProvider>; }

import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack, useRouter, useSegments } from 'expo-router';
import { useColorScheme } from 'react-native';

import { useFonts as useNunito, Nunito_500Medium, Nunito_700Bold } from '@expo-google-fonts/nunito';
import { useFonts as useDMSans, DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import { useFonts as useFraunces, Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces';
import { useFonts as useLibreBaskerville, LibreBaskerville_400Regular } from '@expo-google-fonts/libre-baskerville';
import { useFonts as useGeistMono, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';

import { AuthProvider, useAuth } from '@/hooks/useAuth';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, user, initialized } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    const isCompleteProfileScreen = segments[1] === 'complete-profile';
    const isProfileIncomplete = session && !user?.name;

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (session) {
      if (isProfileIncomplete) {
        if (!isCompleteProfileScreen) {
          router.replace('/(auth)/complete-profile');
        }
      } else {
        if (inAuthGroup) {
          router.replace('/');
        }
      }
    }
  }, [session, user, initialized, segments, router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [nunitoLoaded] = useNunito({ Nunito_500Medium, Nunito_700Bold });
  const [dmSansLoaded] = useDMSans({ DMSans_400Regular, DMSans_500Medium });
  const [frauncesLoaded] = useFraunces({ Fraunces_400Regular_Italic });
  const [libreLoaded] = useLibreBaskerville({ LibreBaskerville_400Regular });
  const [geistLoaded] = useGeistMono({ GeistMono_500Medium });

  const fontsLoaded = nunitoLoaded && dmSansLoaded && frauncesLoaded && libreLoaded && geistLoaded;

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

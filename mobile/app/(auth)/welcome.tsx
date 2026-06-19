import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import Animated, { FadeIn, FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { useTheme } from '@/hooks/use-theme';
import { Typography } from '@/constants/theme';
import { ThemedView } from '@/components/themed-view';
import { PrimaryButton } from '@/components/auth-ui';
import { Handshake, Banknote, Coins, CheckCircle, Zap, CreditCard, Home, Plane, Gift } from 'lucide-react-native';

const SLIDES = [
  {
    eyebrow: 'SPLIT SMARTER',
    title: 'Split bills,\nnot friendships.',
    description: 'Track shared expenses with friends, family, and housemates — without the awkward conversations.',
    icons: { center: Handshake, left: Banknote, right: Coins }
  },
  {
    eyebrow: 'SETTLE UP',
    title: 'Pay back in\none simple tap.',
    description: 'Keep track of balances and settle debts instantly using your favorite payment apps.',
    icons: { center: CheckCircle, left: Zap, right: CreditCard }
  },
  {
    eyebrow: 'STAY ORGANIZED',
    title: 'Group expenses,\nsimplified.',
    description: 'Create groups for trips, apartments, or events. We do the math so you don\'t have to.',
    icons: { center: Home, left: Plane, right: Gift }
  }
];

export default function WelcomeScreen() {
  const theme = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((current) => (current + 1) % SLIDES.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const slide = SLIDES[activeIndex];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.heroCircle, { backgroundColor: theme.primaryDim }]}>
          <Animated.View key={`left-${activeIndex}`} entering={FadeIn.delay(100).duration(400)} style={styles.moneyWings}>
            <slide.icons.left size={28} color={theme.text2} strokeWidth={1.5} />
          </Animated.View>
          <Animated.View key={`right-${activeIndex}`} entering={FadeIn.delay(200).duration(400)} style={styles.moneyBag}>
            <slide.icons.right size={28} color={theme.text3} strokeWidth={1.5} />
          </Animated.View>
          <Animated.View key={`center-${activeIndex}`} entering={FadeIn.duration(400)} style={styles.handshake}>
            <slide.icons.center size={70} color={theme.primary} strokeWidth={1.5} />
          </Animated.View>
        </View>

        <Animated.View key={`text-${activeIndex}`} entering={FadeInRight.duration(400)} style={styles.textContainer}>
          <Text style={[styles.eyebrow, { color: theme.primary }]}>{slide.eyebrow}</Text>
          <Text style={[styles.title, { color: theme.text }]}>{slide.title}</Text>
          <Text style={[styles.description, { color: theme.text3 }]}>{slide.description}</Text>
        </Animated.View>

        <View style={styles.pagination}>
          {SLIDES.map((_, idx) => (
            <Animated.View 
              key={idx} 
              style={[
                idx === activeIndex ? styles.dotActive : styles.dot, 
                { backgroundColor: idx === activeIndex ? theme.primary : theme.border }
              ]} 
            />
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Link href="/(auth)/signup" asChild>
          <PrimaryButton title="Get started →" />
        </Link>
        <View style={styles.signInRow}>
          <Text style={[styles.signInText, { color: theme.text3 }]}>Already have an account? </Text>
          <Link href="/(auth)/login" asChild>
            <Text style={StyleSheet.flatten([styles.signInLink, { color: theme.primary }])}>Sign in</Text>
          </Link>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    paddingHorizontal: 24, 
    paddingTop: 120, 
    paddingBottom: 40 
  },
  content: { 
    flex: 1, 
    alignItems: 'center' 
  },
  heroCircle: {
    width: 220, 
    height: 220, 
    borderRadius: 110,
    justifyContent: 'center', 
    alignItems: 'center',
    marginBottom: 40,
    position: 'relative'
  },
  handshake: { 
    fontSize: 70, 
    zIndex: 2 
  },
  moneyWings: { 
    position: 'absolute', 
    top: 45, 
    left: 25, 
    fontSize: 26, 
    transform: [{ rotate: '-15deg' }] 
  },
  moneyBag: { 
    position: 'absolute', 
    top: 35, 
    right: 35, 
    fontSize: 26, 
    transform: [{ rotate: '10deg' }] 
  },
  textContainer: {
    width: '100%',
    alignItems: 'flex-start'
  },
  eyebrow: { 
    fontFamily: Typography.uiBold, 
    fontSize: 10, 
    letterSpacing: 1.5, 
    textTransform: 'uppercase', 
    marginBottom: 12 
  },
  title: { 
    fontFamily: Typography.displayDark, 
    fontSize: 38, 
    fontStyle: 'italic', 
    marginBottom: 16, 
    lineHeight: 44 
  },
  description: { 
    fontFamily: Typography.body, 
    fontSize: 14, 
    lineHeight: 22, 
    marginBottom: 32 
  },
  pagination: { 
    flexDirection: 'row', 
    gap: 6, 
    alignItems: 'center', 
    marginBottom: 20 
  },
  dotActive: { 
    width: 16, 
    height: 6, 
    borderRadius: 3 
  },
  dot: { 
    width: 6, 
    height: 6, 
    borderRadius: 3 
  },
  footer: { 
    width: '100%', 
    gap: 24 
  },
  signInRow: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  signInText: { 
    fontFamily: Typography.body, 
    fontSize: 13 
  },
  signInLink: { 
    fontFamily: Typography.uiBold, 
    fontSize: 13 
  }
});

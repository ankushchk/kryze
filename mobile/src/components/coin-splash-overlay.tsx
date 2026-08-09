import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Coins as CoinsIcon, Sparkles, Wallet, Trophy } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { Typography, Spacing } from '@/constants/theme';
import { ConfettiCannon } from '@/components/confetti-cannon';

export type CoinSplashData = {
  coinsEarned: number;
  totalBalance: number;
  groupName?: string | null;
  settledWith?: string;
};

type Props = {
  data: CoinSplashData;
  onFinish: () => void;
};

export function CoinSplashOverlay({ data, onFinish }: Props) {
  const theme = useTheme();

  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [scaleAnim] = useState(() => new Animated.Value(0.85));
  const [popAnim] = useState(() => new Animated.Value(1));
  const [countAnim] = useState(() => new Animated.Value(0));
  const [displayCount, setDisplayCount] = useState(0);

  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    const listenerId = countAnim.addListener(({ value }) => setDisplayCount(Math.round(value)));

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.timing(countAnim, {
      toValue: data.coinsEarned,
      delay: 650,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(popAnim, {
          toValue: 1.07,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(popAnim, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    const exit = Animated.sequence([
      Animated.delay(2900),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]);
    exit.start(({ finished }) => {
      if (finished) {
        onFinishRef.current();
      }
    });

    return () => {
      countAnim.removeListener(listenerId);
      pulse.stop();
      exit.stop();
    };
  }, [fadeAnim, scaleAnim, popAnim, countAnim, data.coinsEarned]);

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <ConfettiCannon active />

      {/* Decorative color blobs for a soft "gradient" feel */}
      <View style={[styles.blob, styles.blobTop, { backgroundColor: theme.primaryDim }]} />
      <View style={[styles.blob, styles.blobBottom, { backgroundColor: theme.lentDim }]} />

      <Animated.View
        style={[
          styles.card,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
            backgroundColor: theme.card,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={[styles.rewardPill, { backgroundColor: theme.backgroundElement }]}>
          <Sparkles size={15} color={theme.primary} />
          <Text style={[styles.rewardPillText, { color: theme.primary, fontFamily: Typography.uiBold }]}>
            Settlement Splash
          </Text>
        </View>

        <Animated.View
          style={[
            styles.coinBadge,
            {
              backgroundColor: theme.primaryDim,
              transform: [{ scale: popAnim }],
            },
          ]}
        >
          <CoinsIcon size={64} color={theme.primary} />
        </Animated.View>

        <Text style={[styles.title, { color: theme.text, fontFamily: Typography.uiBold }]}>
          You earned
        </Text>

        <View style={styles.countRow}>
          <Text style={[styles.plusSign, { color: theme.primary, fontFamily: Typography.uiBold }]}>+</Text>
          <Text style={[styles.count, { color: theme.primary, fontFamily: Typography.uiBold }]}>
            {displayCount}
          </Text>
          <Text style={[styles.coinWord, { color: theme.text2, fontFamily: Typography.body }]}>
            {displayCount === 1 ? 'coin' : 'coins'}
          </Text>
        </View>

        {data.settledWith || data.groupName ? (
          <Text style={[styles.subtitle, { color: theme.textSecondary, fontFamily: Typography.body }]}>
            {data.settledWith ? `Settled with ${data.settledWith}` : ''}
            {data.settledWith && data.groupName ? ' • ' : ''}
            {data.groupName ? `in ${data.groupName}` : ''}
          </Text>
        ) : null}

        <View style={[styles.dividerRow, { backgroundColor: theme.border }]} />

        <View style={[styles.balanceRow, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.balanceIconWrap, { backgroundColor: theme.lentDim }]}>
            <Wallet size={16} color={theme.lent} />
          </View>
          <View style={styles.balanceTextWrap}>
            <Text style={[styles.balanceLabel, { color: theme.text3, fontFamily: Typography.uiBold }]}>
              TOTAL BALANCE
            </Text>
            <Text style={[styles.balanceValue, { color: theme.text, fontFamily: Typography.uiBold }]}>
              {data.totalBalance} {data.totalBalance === 1 ? 'coin' : 'coins'}
            </Text>
          </View>
          <Trophy size={18} color={theme.primary} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  blob: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.85,
  },
  blobTop: {
    top: -120,
    right: -120,
  },
  blobBottom: {
    bottom: -120,
    left: -120,
  },
  card: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.five,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: Spacing.three,
  },
  rewardPillText: {
    fontSize: 13,
    letterSpacing: 0.4,
  },
  coinBadge: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 18,
    marginBottom: Spacing.half,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  plusSign: {
    fontSize: 34,
    marginRight: 2,
  },
  count: {
    fontSize: 46,
    lineHeight: 52,
  },
  coinWord: {
    fontSize: 20,
    marginLeft: 8,
  },
  subtitle: {
    fontSize: 13,
    marginTop: Spacing.two,
    textAlign: 'center',
  },
  dividerRow: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginTop: Spacing.four,
    marginBottom: Spacing.three,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
  balanceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.three,
  },
  balanceTextWrap: {
    flex: 1,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  balanceValue: {
    fontSize: 16,
    marginTop: 2,
  },
});
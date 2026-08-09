import React from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
export const CONFETTI_COLORS = ['#E6A23C', '#2E7D32', '#3399cc', '#e74c3c', '#9b59b6', '#1abc9c'];

type ConfettiCannonProps = {
  active: boolean;
};

export const ConfettiCannon = ({ active }: ConfettiCannonProps) => {
  const [confettiItems] = React.useState(() =>
    Array.from({ length: 65 }).map(() => {
      return {
        key: Math.random().toString(),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: Math.random() * 6 + 6,
        left: Math.random() * SCREEN_WIDTH,
        isWide: Math.random() > 0.5,
        isRound: Math.random() > 0.7,
        yAnim: new Animated.Value(-20),
        xAnim: new Animated.Value(0),
        rotateAnim: new Animated.Value(0),
      };
    })
  );

  React.useEffect(() => {
    if (active) {
      const animations = confettiItems.map((item) => {
        const duration = Math.random() * 2000 + 1500;
        const delay = Math.random() * 500;
        const targetX = (Math.random() - 0.5) * 120;
        const targetRotate = Math.random() * 3 + 1;

        return Animated.parallel([
          Animated.timing(item.yAnim, {
            toValue: SCREEN_HEIGHT + 20,
            duration,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(item.xAnim, {
            toValue: targetX,
            duration,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(item.rotateAnim, {
            toValue: targetRotate,
            duration,
            delay,
            useNativeDriver: true,
          }),
        ]);
      });

      Animated.parallel(animations).start();
    } else {
      confettiItems.forEach(item => {
        item.yAnim.setValue(-20);
        item.xAnim.setValue(0);
        item.rotateAnim.setValue(0);
      });
    }
  }, [active, confettiItems]);

  if (!active) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {confettiItems.map((item) => {
        const rotateInterpolate = item.rotateAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        });

        return (
          <Animated.View
            key={item.key}
            style={{
              position: 'absolute',
              top: 0,
              left: item.left,
              width: item.size,
              height: item.size * (item.isWide ? 1.5 : 1),
              borderRadius: item.isRound ? item.size : 2,
              backgroundColor: item.color,
              zIndex: 9999,
              transform: [
                { translateY: item.yAnim },
                { translateX: item.xAnim },
                { rotate: rotateInterpolate },
              ],
            }}
          />
        );
      })}
    </View>
  );
};
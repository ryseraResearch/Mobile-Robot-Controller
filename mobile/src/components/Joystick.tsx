import React, { useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { C } from '../constants';

/**
 * Pure display component — no touch handling.
 * The parent (DriveScreen mainArea) owns all touch events and
 * drives this via the `pan` Animated.ValueXY it controls.
 */
export interface JoystickProps {
  size?: number;
  pan:   Animated.ValueXY;
}

const THUMB_SIZE = 52;

export function Joystick({ size = 150, pan }: JoystickProps) {
  return (
    <View
      pointerEvents="none"
      style={[styles.outer, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <View style={[styles.ring, {
        width: size * 0.6, height: size * 0.6, borderRadius: size * 0.3,
      }]} />
      <Animated.View style={[styles.thumb, {
        width:        THUMB_SIZE,
        height:       THUMB_SIZE,
        borderRadius: THUMB_SIZE / 2,
        transform:    [{ translateX: pan.x }, { translateY: pan.y }],
      }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: C.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'dashed',
  },
  thumb: {
    backgroundColor: C.primary,
    position: 'absolute',
    shadowColor: C.primary,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
});


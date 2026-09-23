import type { ViewStyle } from 'react-native';

const ABSOLUTE_FILL: ViewStyle = {
  position: 'absolute',
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  height: '100%',
};

/**
 * Skia <Canvas> on web forwards `style` to a DOM node without RN's
 * StyleSheet.flatten. Passing an array → Safari
 * "Cannot set indexed properties on this object" and a white screen.
 */
export function skiaCanvasStyle(extra?: ViewStyle): ViewStyle {
  return extra ? { ...ABSOLUTE_FILL, ...extra } : { ...ABSOLUTE_FILL };
}

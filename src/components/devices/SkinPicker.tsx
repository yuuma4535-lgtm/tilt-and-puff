import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SkinId } from '../../types';
import { SKIN_ORDER } from '../../constants';
import { BASE, getSkinPalette } from '../../theme/palette';
import { t } from '../../i18n';

type Props = {
  selected: SkinId;
  onSelect: (id: SkinId) => void;
};

const labelKey = {
  heatStick: 'skinHeatStick',
  roll: 'skinRoll',
  cigar: 'skinCigar',
} as const;

/** Static color chip — avoids mounting three live Skia skins in settings */
function SkinThumb({
  id,
  selected,
  onPress,
}: {
  id: SkinId;
  selected: boolean;
  onPress: () => void;
}) {
  const palette = getSkinPalette(id);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.thumb,
        selected && {
          borderColor: palette.neon,
          backgroundColor: palette.neonSoft,
        },
      ]}
    >
      <View
        style={[
          styles.swatch,
          {
            backgroundColor: palette.body,
            borderColor: palette.neonDim,
            shadowColor: palette.glowShadow,
          },
        ]}
      >
        <View style={[styles.swatchTip, { backgroundColor: palette.tip }]} />
      </View>
      <Text
        style={[
          styles.thumbLabel,
          { color: selected ? palette.neon : BASE.textMuted },
        ]}
      >
        {t(labelKey[id])}
      </Text>
    </Pressable>
  );
}

export function SkinPicker({ selected, onSelect }: Props) {
  return (
    <View style={styles.row}>
      {SKIN_ORDER.map((id) => (
        <SkinThumb
          key={id}
          id={id}
          selected={id === selected}
          onPress={() => onSelect(id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    justifyContent: 'center',
  },
  thumb: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: BASE.surface,
    borderWidth: 1.5,
    borderColor: BASE.border,
    gap: 8,
    minHeight: 120,
  },
  swatch: {
    width: 28,
    height: 72,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  swatchTip: {
    height: 14,
    width: '100%',
    opacity: 0.9,
  },
  thumbLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
});

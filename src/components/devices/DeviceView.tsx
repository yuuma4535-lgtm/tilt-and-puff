import { StyleSheet, Text, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { SkinId } from '../../types';
import { getSkinPalette } from '../../theme/palette';
import { HeatStickDevice } from './HeatStickDevice';
import { RollDevice } from './RollDevice';
import { CigarDevice } from './CigarDevice';
import { t } from '../../i18n';

type Props = {
  skinId: SkinId;
  gaugeSV: SharedValue<number>;
  puffing?: boolean;
  puffProgressSV?: SharedValue<number>;
  burnProgressSV?: SharedValue<number>;
  gravityXSV?: SharedValue<number>;
  gravityYSV?: SharedValue<number>;
  ashKnockId?: number;
  puffCount?: number;
  sessionActive?: boolean;
  settling?: boolean;
  butt?: boolean;
  lengthScale?: number;
  height?: number;
  showLabel?: boolean;
};

const skinLabelKey = {
  heatStick: 'skinHeatStick',
  roll: 'skinRoll',
  cigar: 'skinCigar',
} as const;

export function DeviceView({
  skinId,
  gaugeSV,
  puffing = false,
  puffProgressSV,
  burnProgressSV,
  gravityXSV,
  gravityYSV,
  ashKnockId = 0,
  puffCount = 0,
  sessionActive = false,
  settling = false,
  butt = false,
  lengthScale = 1,
  height = 240,
  showLabel = true,
}: Props) {
  const palette = getSkinPalette(skinId);

  return (
    <View style={styles.wrap}>
      {skinId === 'heatStick' ? (
        <HeatStickDevice
          key="heatStick"
          gaugeSV={gaugeSV}
          puffing={puffing}
          puffProgressSV={puffProgressSV}
          height={height}
        />
      ) : null}
      {skinId === 'roll' ? (
        <RollDevice
          key="roll"
          gaugeSV={gaugeSV}
          puffing={puffing}
          puffProgressSV={puffProgressSV}
          burnProgressSV={burnProgressSV}
          gravityXSV={gravityXSV}
          gravityYSV={gravityYSV}
          ashKnockId={ashKnockId}
          puffCount={puffCount}
          sessionActive={sessionActive}
          settling={settling}
          butt={butt}
          lengthScale={lengthScale}
          height={height}
        />
      ) : null}
      {skinId === 'cigar' ? (
        <CigarDevice
          key="cigar"
          gaugeSV={gaugeSV}
          puffing={puffing}
          puffProgressSV={puffProgressSV}
          burnProgressSV={burnProgressSV}
          gravityXSV={gravityXSV}
          gravityYSV={gravityYSV}
          ashKnockId={ashKnockId}
          puffCount={puffCount}
          sessionActive={sessionActive}
          settling={settling}
          butt={butt}
          height={height}
        />
      ) : null}
      {showLabel && (
        <Text style={[styles.label, { color: palette.neon }]}>
          {t(skinLabelKey[skinId])}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});

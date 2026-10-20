import { Image, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

const schoolLogo = require('../../assets/school_logo_small.png');

export function SchoolBrand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.container, compact && styles.compactContainer]}>
      <Image
        accessibilityLabel="HCCCI school logo"
        source={schoolLogo}
        style={compact ? styles.compactLogo : styles.logo}
        resizeMode="contain"
      />
      {!compact ? (
        <View style={styles.textGroup}>
          <Text style={styles.name}>HCCCI</Text>
          <Text style={styles.caption}>Room Availability</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 18,
  },
  compactContainer: {
    marginBottom: 0,
    marginRight: 12,
  },
  logo: {
    width: 112,
    height: 112,
  },
  compactLogo: {
    width: 34,
    height: 34,
  },
  textGroup: {
    alignItems: 'center',
    marginTop: 8,
  },
  name: {
    color: '#0b285d',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  caption: {
    color: '#8a6d45',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});
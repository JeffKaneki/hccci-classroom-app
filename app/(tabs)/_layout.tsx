import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SchoolBrand } from '../../src/components/SchoolBrand';

export default function TabLayout() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <View style={styles.brandBar}>
        <SchoolBrand compact />
        <View>
          <Text style={styles.brandName}>HCCCI Room Availability</Text>
          <Text style={styles.brandCaption}>Campus access for the HCCCI community</Text>
        </View>
      </View>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#1d4ed8',
          tabBarStyle: {
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            backgroundColor: '#ffffff',
          },
        }}
      >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="home" color={String(color ?? '#1d4ed8')} size={size} />,
        }}
      />
      <Tabs.Screen
        name="directory"
        options={{
          title: 'Directory',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="room-service" color={String(color ?? '#1d4ed8')} size={size} />,
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Requests',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="clipboard-text-outline" color={String(color ?? '#1d4ed8')} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account" color={String(color ?? '#1d4ed8')} size={size} />,
        }}
      />
      </Tabs>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fffaf2',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d8c7ad',
  },
  brandName: {
    color: '#0b285d',
    fontSize: 15,
    fontWeight: '800',
  },
  brandCaption: {
    color: '#8a6d45',
    fontSize: 11,
    marginTop: 2,
  },
});

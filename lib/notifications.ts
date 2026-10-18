import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * expo-notifications, or null where it can't load. Expo Go on Android (SDK 53+)
 * throws as soon as the module is imported, so it's required lazily here and
 * push is simply unavailable there. Use a development build to test push.
 */
const unsupported =
  Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const Notifications: typeof import('expo-notifications') | null = unsupported
  ? null
  : require('expo-notifications');

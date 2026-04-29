import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { RootStackParamList } from './src/types/navigation';
import { HomeScreen }    from './src/screens/HomeScreen';
import { DriveScreen }   from './src/screens/DriveScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle:       { backgroundColor: '#0f0f1a' },
            headerTintColor:   '#ffffff',
            contentStyle:      { backgroundColor: '#0f0f1a' },
            headerBackVisible: false,
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'Line Follower' }}
          />
          <Stack.Screen
            name="Drive"
            component={DriveScreen}
            options={{ title: 'Race', gestureEnabled: false }}
          />
          <Stack.Screen
            name="Results"
            component={ResultsScreen}
            options={{ title: 'Results', gestureEnabled: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

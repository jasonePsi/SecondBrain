import React from 'react';
import { Platform } from 'react-native';
import { Tabs, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../src/theme/theme';
import { useReducedMotion } from '../../src/services/interaction_feedback';

function TabBarIcon(props: {
    name: React.ComponentProps<typeof Ionicons>['name'];
    color: string;
}) {
    return <Ionicons size={22} style={{ marginBottom: -2 }} {...props} />;
}

export default function TabLayout() {
    const theme = useAppTheme();
    const reducedMotion = useReducedMotion();
    const tabBarBackground = theme.isDark ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)';

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <Tabs
                screenOptions={{
                    animation: reducedMotion ? 'none' : 'fade',
                    headerShown: true,
                    headerStyle: {
                        backgroundColor: theme.colors.background.base
                    },
                    headerShadowVisible: false,
                    headerTintColor: theme.colors.tint.primary,
                    tabBarActiveTintColor: theme.colors.tint.primary,
                    tabBarInactiveTintColor: theme.colors.text.tertiary,
                    tabBarStyle: {
                        borderTopColor: theme.colors.separator.subtle,
                        borderTopWidth: 1,
                        backgroundColor: tabBarBackground,
                        height: Platform.OS === 'ios' ? 82 : 66,
                        paddingTop: 6,
                        paddingBottom: Platform.OS === 'ios' ? 22 : 8
                    },
                    tabBarLabelStyle: {
                        fontSize: 11,
                        fontWeight: '600'
                    }
                }}>
                <Tabs.Screen
                    name="spaces"
                    options={{
                        title: 'Spaces',
                        tabBarIcon: ({ color }) => <TabBarIcon name="albums-outline" color={color} />,
                    }}
                />
                <Tabs.Screen
                    name="feed"
                    options={{
                        title: 'Feed',
                        tabBarIcon: ({ color }) => <TabBarIcon name="list-outline" color={color} />,
                    }}
                />
                <Tabs.Screen
                    name="brain"
                    options={{
                        title: 'Brain',
                        tabBarIcon: ({ color }) => <TabBarIcon name="sparkles-outline" color={color} />,
                    }}
                />
                <Tabs.Screen
                    name="search"
                    options={{
                        title: 'Search',
                        tabBarIcon: ({ color }) => <TabBarIcon name="search-outline" color={color} />,
                    }}
                />
                <Tabs.Screen
                    name="settings"
                    options={{
                        title: 'Settings',
                        tabBarIcon: ({ color }) => <TabBarIcon name="settings-outline" color={color} />,
                    }}
                />
            </Tabs>
        </>
    );
}

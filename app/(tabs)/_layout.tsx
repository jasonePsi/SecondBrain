import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/Colors';

function TabBarIcon(props: {
    name: React.ComponentProps<typeof Ionicons>['name'];
    color: string;
}) {
    return <Ionicons size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: true,
                tabBarActiveTintColor: Colors.tint,
                tabBarStyle: {
                    backgroundColor: Colors.card,
                },
                headerStyle: {
                    backgroundColor: Colors.card,
                }
            }}>
            <Tabs.Screen
                name="feed"
                options={{
                    title: 'Feed',
                    tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
                }}
            />
            <Tabs.Screen
                name="search"
                options={{
                    title: 'Search',
                    tabBarIcon: ({ color }) => <TabBarIcon name="search" color={color} />,
                }}
            />
            <Tabs.Screen
                name="spaces"
                options={{
                    title: 'Spaces',
                    tabBarIcon: ({ color }) => <TabBarIcon name="grid" color={color} />,
                }}
            />
            <Tabs.Screen
                name="brain"
                options={{
                    title: 'Brain',
                    tabBarIcon: ({ color }) => <TabBarIcon name="server" color={color} />, // or list
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: 'Settings',
                    tabBarIcon: ({ color }) => <TabBarIcon name="settings" color={color} />,
                }}
            />
        </Tabs>
    );
}

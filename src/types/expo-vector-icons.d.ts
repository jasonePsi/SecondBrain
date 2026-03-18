declare module '@expo/vector-icons' {
  import * as React from 'react';
  import { StyleProp, TextProps, TextStyle, ViewStyle } from 'react-native';

  export interface IoniconProps extends TextProps {
    name: string;
    size?: number;
    color?: string;
    style?: StyleProp<TextStyle | ViewStyle>;
  }

  export const Ionicons: React.ComponentType<IoniconProps>;
}

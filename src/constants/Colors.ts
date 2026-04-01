import { getSystemTheme, toLegacyColors } from '../theme/theme';

// Backward-compatible color export used by legacy screen styles.
// New screens/components should prefer `useAppTheme` from `src/theme/theme`.
export const Colors = toLegacyColors(getSystemTheme());

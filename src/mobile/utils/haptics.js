import { Capacitor } from '@capacitor/core';

let Haptics = null;
let ImpactStyle = null;

const loadHaptics = async () => {
  if (Haptics) return;
  try {
    const mod = await import('@capacitor/haptics');
    Haptics = mod.Haptics;
    ImpactStyle = mod.ImpactStyle;
  } catch (_) { /* not available */ }
};

export const haptic = async (style = 'light') => {
  if (!Capacitor.isNativePlatform()) return;
  await loadHaptics();
  if (!Haptics) return;
  try {
    await Haptics.impact({ style: style === 'heavy' ? ImpactStyle.Heavy : ImpactStyle.Light });
  } catch (_) { /* ignore */ }
};

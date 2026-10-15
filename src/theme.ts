import { IN_TUNE_CENTS } from './tuner/useTuner';

export const colors = {
  background: '#0B0D12',
  surface: '#151922',
  surfaceRaised: '#1E2430',
  border: '#262D3A',
  text: '#F4F6FB',
  muted: '#7C8597',
  faint: '#3A4252',
  inTune: '#4DF2B0',
  close: '#FFC857',
  off: '#FF6B6B',
};

export function centsColor(cents: number | null): string {
  if (cents == null) return colors.faint;
  const abs = Math.abs(cents);
  if (abs <= IN_TUNE_CENTS) return colors.inTune;
  if (abs <= 15) return colors.close;
  return colors.off;
}

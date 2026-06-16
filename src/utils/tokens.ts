/**
 * Ghostwire Design Tokens
 * 
 * Aesthetic: signal-noir
 * Dark, minimal, terminal-inspired but warm.
 * Purple accent = encrypted state. Green = connected. Red = danger.
 * Monospace for IDs/keys. System font for UI.
 */

export const colors = {
  // Background layers
  bg: '#0a0a0a',
  bgCard: '#111111',
  bgInput: '#1a1a1a',
  bgHover: '#1f1f1f',

  // Borders
  border: '#2a2a2a',
  borderStrong: '#3a3a3a',

  // Text
  text: '#f0f0f0',
  textSecondary: '#888888',
  textMuted: '#555555',

  // Accent - encrypted/active state
  purple: '#7c3aed',
  purpleLight: '#a78bfa',
  purpleDim: '#3b1f6e',

  // Status
  green: '#22c55e',
  greenDim: '#14532d',
  red: '#ef4444',
  redDim: '#7f1d1d',
  yellow: '#eab308',

  // Message bubbles
  bubbleSent: '#3b1f6e',
  bubbleReceived: '#1a1a1a',
  bubbleSentText: '#e9d5ff',
  bubbleReceivedText: '#f0f0f0',
}

export const fonts = {
  mono: 'Courier New',
  system: 'System',
}

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  full: 9999,
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
}

export const text = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  display: 34,
}

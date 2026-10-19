import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#FFF9F4',
  card: '#FFFFFF',
  primary: '#E2725B',
  primaryDark: '#C85A43',
  ink: '#2D2A26',
  muted: '#8A7F76',
  line: '#F0E4D8',
  chip: '#F7EDE4',
  success: '#4C9A6C',
  hero: '#2D2A26', // dark hero surface (feed clock)
};

export const shared = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 18,
    marginHorizontal: 16,
    marginTop: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 12,
  },
  bigButton: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 14,
  },
  bigButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  chip: {
    backgroundColor: colors.chip,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: '#FDEEE7',
  },
  chipText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
  },
  input: {
    backgroundColor: '#FBF6F1',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 17,
    color: colors.ink,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 6,
  },
});

import { defineStrings } from '../types';

// Area "states": see the ownership map in lib/i18n/registry.ts. Follow lib/i18n/GLOSSARY.md.
export default defineStrings({
  en: {
    // components/StateView.tsx: a record the server says is gone (404) or not this profile's (403).
    'unavailable.title': "This record isn't available",
    'unavailable.text': 'It may have been removed by the clinic, or it belongs to a different profile.',
    'unavailable.goHome': 'Go to Home',
    // Skeleton placeholder announced while a list's first page loads.
    loading: 'Loading…',
  },
  fil: {
    'unavailable.title': 'Hindi available ang record na ito',
    'unavailable.text': 'Maaaring tinanggal na ito ng clinic, o para ito sa ibang profile.',
    'unavailable.goHome': 'Pumunta sa Home',
    loading: 'Naglo-load…',
  },
});

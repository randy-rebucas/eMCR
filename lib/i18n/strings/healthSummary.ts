import { defineStrings } from '../types';

// Area "healthSummary": see the ownership map in lib/i18n/registry.ts. Follow lib/i18n/GLOSSARY.md.
// "Health Summary" is a feature name and stays English. Allergies, medicines, conditions and vaccine
// names come from the clinic and are never translated.
export default defineStrings({
  en: {
    title: 'Health Summary',
    pdfTitle: 'Health Summary',
    // Saved PDF's file name (letters, digits, - and _ only).
    pdfFileName: 'Health-Summary',
    pdfFailed: 'Couldn’t open the PDF',
    pdfFailedFallback: 'Check your connection and try again.',
    subtitleSelf:
      'Your allergies, medicines and vaccinations from every clinic. Show it, or send the PDF, when you see a new doctor.',
    subtitleOther:
      '{whose} allergies, medicines and vaccinations from every clinic. Show it, or send the PDF, when you see a new doctor.',
    downloadPdf: 'Download PDF',
    shareWithDoctor: 'Share with a doctor',
    sources: 'From {clinics} · updated {date}',
    allergies: 'Allergies',
    severe: 'Severe',
    noAllergies: 'No known allergies recorded.',
    currentMedicines: 'Current Medicines',
    noCurrentMedicines: 'No current medicines.',
    conditions: 'Conditions',
    since: 'since {date}',
    noConditions: 'No conditions recorded.',
    vaccinations: 'Vaccinations',
    batch: 'Batch {batch}',
    noVaccinations: 'No vaccinations recorded.',
    otherMedicines: 'Other Medicines This Year',
    note: 'Each clinic keeps its own record. If something is missing or wrong, ask that clinic to update it.',
    until: 'Until {date}',
    prescribed: 'Prescribed {date}',
    openPrescriptionHint: 'Opens the prescription',
  },
  fil: {
    title: 'Health Summary',
    pdfTitle: 'Health Summary',
    pdfFileName: 'Health-Summary',
    pdfFailed: 'Hindi mabuksan ang PDF',
    pdfFailedFallback: 'Tingnan ang internet connection mo at subukan ulit.',
    subtitleSelf:
      'Ang mga allergy, gamot at bakuna mo mula sa bawat clinic. Ipakita ito, o ipadala ang PDF, kapag magpapatingin ka sa bagong doktor.',
    subtitleOther:
      'Ang mga allergy, gamot at bakuna {whose} mula sa bawat clinic. Ipakita ito, o ipadala ang PDF, kapag magpapatingin sa bagong doktor.',
    downloadPdf: 'I-download ang PDF',
    shareWithDoctor: 'Ibahagi sa doktor',
    sources: 'Mula sa {clinics} · na-update noong {date}',
    allergies: 'Mga Allergy',
    severe: 'Malala',
    noAllergies: 'Walang naitalang allergy.',
    currentMedicines: 'Mga Kasalukuyang Gamot',
    noCurrentMedicines: 'Walang kasalukuyang gamot.',
    conditions: 'Mga Kondisyon',
    since: 'mula {date}',
    noConditions: 'Walang naitalang kondisyon.',
    vaccinations: 'Mga Bakuna',
    batch: 'Batch {batch}',
    noVaccinations: 'Walang naitalang bakuna.',
    otherMedicines: 'Iba Pang Gamot Ngayong Taon',
    note: 'May sariling record ang bawat clinic. Kung may kulang o mali, hilingin sa clinic na iyon na i-update ito.',
    until: 'Hanggang {date}',
    prescribed: 'Inireseta noong {date}',
    openPrescriptionHint: 'Binubuksan ang reseta',
  },
});

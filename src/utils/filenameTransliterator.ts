// filenameTransliterator.ts

// Mapping based on the Hebrew keyboard layout
const hebrewToEng: Record<string, string> = {
  'ק': 'w', 'ר': 'e', 'א': 'r', 'ט': 't', 'ו': 'u', 'ן': 'i', 'ם': 'o', 'פ': 'p',
  'ש': 'a', 'ד': 's', 'ג': 'd', 'כ': 'f', 'ע': 'g', 'י': 'h', 'ח': 'j', 'ל': 'k', 'ך': 'l',
  'ז': 'z', 'ס': 'x', 'ב': 'c', 'ה': 'v', 'נ': 'b', 'מ': 'n', 'צ': 'm',
  'ף': '[', 'ת': ',', 'ץ': '.'
};

// Reverse mapping from English to Hebrew
const engToHebrew: Record<string, string> = {};
for (const [hebrewChar, engChar] of Object.entries(hebrewToEng)) {
  engToHebrew[engChar] = hebrewChar;
}

// Regular expression to detect Hebrew characters
const hebrewRegex = /[\u0590-\u05FF]/;

// Helper function to split filename into name and extension
function splitFilename(filename: string): { namePart: string; ext: string } {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) {
    return { namePart: filename, ext: '' };
  }
  return {
    namePart: filename.substring(0, lastDot),
    ext: filename.substring(lastDot) // includes the dot
  };
}

// Converts a Hebrew filename to its English-key equivalent only if it contains Hebrew characters
export function transliterateToEnglish(filename: string): string {
  if (!hebrewRegex.test(filename)) {
    return filename; // Return as is if no Hebrew detected
  }

  const { namePart, ext } = splitFilename(filename);
  let newName = '';
  for (const ch of namePart) {
    newName += hebrewToEng[ch] || ch; // Convert or keep original if not in mapping
  }
  return newName + ext;
}

// Converts an English-key filename back to Hebrew
export function transliterateToHebrew(filename: string): string {
  const { namePart, ext } = splitFilename(filename);
  let newName = '';
  for (const ch of namePart) {
    newName += engToHebrew[ch] || ch; // Convert or keep original if not in mapping
  }
  return newName + ext;
}

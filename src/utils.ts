// TODO: konverter alt til a-z
export const sanitizeText = (text: string) => {
    return text.toLowerCase();
};

export const filterDuplicates = (array: any[]) => [...new Set(array)];

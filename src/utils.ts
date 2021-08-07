const charMap: { [key: string]: string } = {
    æ: 'ae',
    ø: 'o',
    å: 'a',
    á: 'a',
    č: 'c',
    đ: 'd',
    ŋ: 'n',
    š: 's',
    ŧ: 't',
    ž: 'z',
};

const charsToReplace = Object.keys(charMap).reduce((acc, char) => {
    return acc + char;
}, '');

const replaceSpecialCharPattern = new RegExp(`[${charsToReplace}]`, 'g');

const replaceSpecialCharFunc = (match: string) => charMap[match] || match;

export const sanitizeString = (str: string) =>
    str
        .toLowerCase()
        .replace(replaceSpecialCharPattern, replaceSpecialCharFunc);

export const filterDuplicates = (array: any[]) => [...new Set(array)];

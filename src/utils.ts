export type SearchHit = {
    kontorNavn: string;
    enhetNr: string;
    status: string;
    hitString: string;
};

const charMap: { [key: string]: string } = {
    æ: 'ae',
    ø: 'o',
    đ: 'd',
    ŋ: 'n',
    ŧ: 't',
    '.': '',
    ' ': '-',
};

const charsToReplace = Object.keys(charMap).reduce((acc, char) => {
    return acc + char;
}, '');

const replaceSpecialCharPattern = new RegExp(`[${charsToReplace}]`, 'g');

const replaceSpecialCharFunc = (match: string) => {
    const newChar = charMap[match];
    return newChar !== undefined ? newChar : match;
};

export const normalizeString = (str: string) =>
    str
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(replaceSpecialCharPattern, replaceSpecialCharFunc);

export const removeDuplicates = <Type>(
    array: Type[],
    isEqualPredicate?: (a: any, b: any) => boolean
): Type[] =>
    isEqualPredicate
        ? array.filter((aItem, aIndex) => {
              const bIndex = array.findIndex((bItem) =>
                  isEqualPredicate(aItem, bItem)
              );
              return aIndex === bIndex;
          })
        : [...new Set(array)];

export const decodeBase64 = (b64Str: string) =>
    Buffer.from(b64Str, 'base64').toString();

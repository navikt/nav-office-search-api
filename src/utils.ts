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

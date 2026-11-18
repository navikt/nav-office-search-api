export const removeDuplicates = <Type>(array: Type[], isEqualPredicate?: (a: Type, b: Type) => boolean): Type[] =>
	isEqualPredicate
		? array.filter((aItem, aIndex) => {
				const bIndex = array.findIndex((bItem) => isEqualPredicate(aItem, bItem));
				return aIndex === bIndex;
			})
		: [...new Set(array)];

// `next/font/google` loaders only work inside Next's compiler, which swaps
// each call for the generated font. Vitest renders components that import
// `components/fonts.ts` with these stand-ins instead.
interface FontOptions {
  variable?: string;
}

function loader(family: string) {
  return (options: FontOptions = {}) => ({
    className: `font-${family}`,
    variable: options.variable ? `font-var-${family}` : "",
    style: { fontFamily: family },
  });
}

export const Dela_Gothic_One = loader("dela-gothic-one");
export const Tiny5 = loader("tiny5");

/**
 * Types for the string catalogs. Every area file calls `defineStrings({ en, fil })`:
 * - `fil` must have exactly the keys of `en` (a missing or misspelled key is a type error);
 * - `{name}` placeholders in the English text become the typed params of `t()`.
 */

/** A message that changes with a count. `t()` picks `one` when `count === 1`, else `other`. */
export type Plural = { one: string; other: string };

export type Message = string | Plural;

export type Messages = Record<string, Message>;

/**
 * Declare one area's strings. Write the English and Filipino side by side:
 *
 *   export default defineStrings({
 *     en: { title: 'Lab results', ready: { one: '{count} result ready', other: '{count} results ready' } },
 *     fil: { title: 'Lab results', ready: '{count} resulta na ang handa' },
 *   });
 *
 * A Filipino entry may be a plain string where the English one is a plural (Filipino nouns rarely
 * change with the count), and vice versa.
 */
export function defineStrings<const E extends Messages>(catalog: {
  en: E;
  fil: NoInfer<{ readonly [K in keyof E]: Message }>;
}): { en: E; fil: { readonly [K in keyof E]: Message } } {
  return catalog;
}

/** Names inside `{…}` in a string literal type. */
type Placeholders<S> = S extends `${string}{${infer P}}${infer Rest}` ? P | Placeholders<Rest> : never;

type ParamNames<M> = M extends Plural ? Placeholders<M['one'] | M['other']> | 'count' : Placeholders<M>;

export type ParamValue = string | number;

/** The params argument of `t()` for a message: none, or an object with every placeholder. */
export type ParamsArg<M> = [ParamNames<M>] extends [never]
  ? [params?: Record<string, never>]
  : [params: { [P in ParamNames<M>]: P extends 'count' ? number : ParamValue }];

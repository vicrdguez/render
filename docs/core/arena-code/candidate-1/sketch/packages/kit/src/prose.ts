/**
 * `prose()` (docs/core/prose.md, "The recommendation is option 2, kept strict"). Unit 4: W2's agent instructions are its
 * first caller.
 *
 * - A slot is `{{name}}`. A value is a string. Code formats a list before it passes it in.
 * - The file's slots must equal the declared names, checked when the module loads. Every call sits at the top level of
 *   an extension's module, so a missing file or a wrong slot stops the server before a project opens.
 * - Substitution is one pass. A value that contains `{{x}}` stays as text.
 * - No conditions, no loops, no includes. A different case is a different file.
 */

export type Prose<S extends string> = (values: { readonly [K in S]: string }) => string;

export function prose<const S extends string>(directory: string, file: string, slots: readonly S[]): Prose<S> {
	// TODO: readFileSync(join(directory, file), "utf8"); found = every {{name}} in it; throw unless found equals slots
	//       as sets; return values => one pass of replace(/{{(\w+)}}/g, (_, name) => values[name])
	void [directory, file, slots];
	return () => {
		throw new Error("not implemented");
	};
}

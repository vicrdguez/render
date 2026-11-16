export function makePdf(
	pages: readonly string[],
	info: { Title?: string; Author?: string } = {},
): Uint8Array {
	const pageIds = pages.map((_, index) => 4 + index * 2);
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	];
	for (const [index, text] of pages.entries()) {
		const lines = text
			.split("\n")
			.flatMap((line) => line.match(/.{1,60}/g) ?? [""]);
		const stream = `BT /F1 12 Tf 14 TL 72 720 Td ${lines.map((line) => `(${line.replace(/[\\()]/g, "\\$&")}) Tj T*`).join(" ")} ET`;
		objects.push(
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[index]! + 1} 0 R >>`,
		);
		objects.push(
			`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
		);
	}
	const entries = Object.entries(info).map(
		([key, value]) => `/${key} (${value.replace(/[\\()]/g, "\\$&")})`,
	);
	if (entries.length > 0) objects.push(`<< ${entries.join(" ")} >>`);
	let body = "%PDF-1.4\n";
	const offsets: number[] = [];
	for (const [index, object] of objects.entries()) {
		offsets.push(Buffer.byteLength(body));
		body += `${index + 1} 0 obj\n${object}\nendobj\n`;
	}
	const xref = Buffer.byteLength(body);
	body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const offset of offsets)
		body += `${String(offset).padStart(10, "0")} 00000 n \n`;
	body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${entries.length > 0 ? ` /Info ${objects.length} 0 R` : ""} >>\nstartxref\n${xref}\n%%EOF\n`;
	return new TextEncoder().encode(body);
}

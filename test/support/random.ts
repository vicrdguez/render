// Seeded xorshift32 generator shared by the schedule suites, so failures replay from their printed seed.
export function seeded(seed: number): () => number {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s >>>= 0;
		s ^= s >>> 17;
		s ^= s << 5;
		s >>>= 0;
		return s / 0x1_0000_0000;
	};
}

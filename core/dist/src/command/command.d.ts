export declare function serverConfig(argv: readonly string[]): {
    port: number;
    allowedHosts: string[];
} | undefined;
/** `tau` with no argument serves; `tau device …` reaches the running server through its admin socket. */
export declare function run(argv: readonly string[]): Promise<number>;

import { type Outcome } from "./refusals.js";
export declare class StructuralQueue {
    #private;
    run<T>(work: () => Promise<Outcome<T>>): Promise<Outcome<T>>;
    close(): Promise<void>;
}

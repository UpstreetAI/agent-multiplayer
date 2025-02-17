type MethodArgs = {
    method: number;
    args: object;
};

type MultiplayerApi = EventTarget & {
    send: (methodArgs: MethodArgs) => void;
};
declare const connect: (url: string, { signal, }?: {
    signal?: AbortSignal;
}) => Promise<MultiplayerApi>;

export { connect };

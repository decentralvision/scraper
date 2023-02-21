/// <reference types="node" />
/// <reference types="node" />
import type net from 'net';
import type tls from 'tls';
declare type AdditionalProps = {
    proxyChainId?: number;
};
export declare type Socket = net.Socket & AdditionalProps;
export declare type TLSSocket = tls.TLSSocket & AdditionalProps;
export {};
//# sourceMappingURL=socket.d.ts.map
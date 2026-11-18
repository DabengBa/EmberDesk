import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { AgentConnectOpts } from 'agent-base';
import fetch from 'node-fetch';
import type { RequestInfo, RequestInit } from 'node-fetch';
import { ProxyAgent } from 'proxy-agent';
import { PrivateRequestAgent } from './private-request-filter.ts';

const blocked = new net.BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16]] as const) {
    blocked.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10]] as const) {
    blocked.addSubnet(address, prefix, 'ipv6');
}

/** Import content is untrusted: validate every actual connection, even when the global filter is disabled. */
export function fetchExternalImport(url: RequestInfo | URL, options?: RequestInit) {
    return fetch(url, {
        ...options,
        // node-fetch calls this again for every redirect, preserving its normal redirect semantics.
        agent: target => new class extends PrivateRequestAgent {
            constructor() {
                super({ privateAddressWhitelist: [], logBlocked: false, logAllowed: false, allowUnresolvedHosts: false, enableKeepAlive: false,
                    rejectAddress: address => blocked.check(address, net.isIP(address) === 6 ? 'ipv6' : 'ipv4') });
            }
            async connect(request: http.ClientRequest, connectOptions: AgentConnectOpts): Promise<net.Socket> {
                const globalAgent = target.protocol === 'https:' ? https.globalAgent : http.globalAgent;
                // The proxy may resolve a different target than this process can inspect. Never bypass it.
                if (globalAgent instanceof ProxyAgent && await globalAgent.getProxyForUrl(target.href, request)) {
                    throw new Error('External import through an unverified proxy is not permitted');
                }
                return super.connect(request, connectOptions);
            }
        }(),
    });
}

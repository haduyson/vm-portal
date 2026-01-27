declare module '@novnc/novnc/lib/rfb.js' {
  interface RFBCredentials {
    password?: string;
    username?: string;
    target?: string;
  }

  interface RFBOptions {
    credentials?: RFBCredentials;
    shared?: boolean;
    repeaterID?: string;
    wsProtocols?: string[];
  }

  class RFB {
    constructor(target: HTMLElement, urlOrChannel: string | WebSocket, options?: RFBOptions);
    viewOnly: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    clipViewport: boolean;
    showDotCursor: boolean;
    background: string;
    qualityLevel: number;
    compressionLevel: number;
    capabilities: { power: boolean };
    disconnect(): void;
    sendCredentials(credentials: RFBCredentials): void;
    sendKey(keysym: number, code: string | null, down?: boolean): void;
    sendCtrlAltDel(): void;
    focus(): void;
    blur(): void;
    machineShutdown(): void;
    machineReboot(): void;
    machineReset(): void;
    clipboardPasteFrom(text: string): void;
    addEventListener(type: string, listener: (e: any) => void): void;
    removeEventListener(type: string, listener: (e: any) => void): void;
  }

  export default RFB;
}

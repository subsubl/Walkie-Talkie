
import { Injectable, signal, WritableSignal } from '@angular/core';

declare var SpixiAppSdk: {
  _isTestEnv: boolean;
  fireOnLoad: () => void;
  sendNetworkData: (data: string) => void;
  onInit: (sessionId: string, userAddresses: string[]) => void;
  onNetworkData: (senderAddress: string, data: string) => void;
};

export interface SpixiInitData {
  sessionId: string;
  userAddresses: string[];
}

export interface SpixiNetworkData {
  senderAddress: string;
  data: string;
}

@Injectable({ providedIn: 'root' })
export class SpixiService {
  initData: WritableSignal<SpixiInitData | null> = signal(null);
  networkData: WritableSignal<SpixiNetworkData | null> = signal(null);

  constructor() {}

  initialize() {
    if (typeof SpixiAppSdk === 'undefined') {
      console.warn('SpixiAppSdk not found. Running in a limited environment.');
      return;
    }

    SpixiAppSdk.onInit = (sessionId: string, userAddresses: string[]) => {
      this.initData.set({ sessionId, userAddresses });
    };

    SpixiAppSdk.onNetworkData = (senderAddress: string, data: string) => {
      this.networkData.set({ senderAddress, data });
      this.networkData.set(null); // Reset to allow subsequent same values to trigger effects
    };
    
    SpixiAppSdk.fireOnLoad();
  }

  sendNetworkData(data: string) {
    if (typeof SpixiAppSdk !== 'undefined' && SpixiAppSdk.sendNetworkData) {
      SpixiAppSdk.sendNetworkData(data);
    }
  }
}

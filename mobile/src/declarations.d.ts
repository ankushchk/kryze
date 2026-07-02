import 'react-native';

declare module 'react-native' {
  interface NativeModulesStatic {
    RNExpoReadSms: {
      startReadSMS(successCallback: (msg: string) => void, errorCallback: (err: any) => void): void;
      stopReadSMS(): void;
      readSMSInbox(
        limit: number,
        successCallback: (smsList: Array<{ sender: string; body: string; date: string }>) => void,
        errorCallback: (error: any) => void
      ): void;
    };
  }
}



export interface WeatherPathIdentity {path:string;dev:string;ino:string;}
/** Existing customer settings, original roots and stable filesystem identities. */
export interface WeatherApplicationSelection {
 schema:'stellar-forge.weather-application-selection.v1';
 settingsFile:string;
 settingsSha256:string;
 selectionSha256:string;
 mode:'review'|'operator';
 stateRoot:string;
 weatherDirectory:string;
 buyerDirectory:string|null;
 originalOperatorDirectory:string|null;
 setupDirectory:string|null;
 sellerClient:string|null;
 sellerClientSha256:string|null;
 providerMode:'evaluation'|'professional';
 apiKeyEnv:string|null;
 proxyEnv:string|null;
 directoryIdentities:WeatherPathIdentity[];
 databaseIdentity:WeatherPathIdentity;
}
export interface WeatherApplicationAnnouncement extends Omit<WeatherApplicationSelection,'schema'> {
 schema:'stellar-forge.weather-application-runtime.v1';
 provider:'open-meteo-weather';
 runtimeRoot:string;
 url:string;
 originId:string;
}
export interface WeatherManagedOptions {
 settingsFile:string;
 expectedSettingsSha256?:string;
 expectedSelectionSha256?:string;
 expectedRuntimeRoot?:string;
 port:number;
}
export interface WeatherApplicationSession {
 selection:WeatherApplicationSelection;
 announcement:WeatherApplicationAnnouncement;
 origin:string;
 url:string;
 workspace:unknown;
 close():Promise<void>;
}
export const WEATHER_APPLICATION_SELECTION_SCHEMA:'stellar-forge.weather-application-selection.v1';
export const WEATHER_APPLICATION_RUNTIME_SCHEMA:'stellar-forge.weather-application-runtime.v1';
export function inspectWeatherApplication(settingsFile:string):Promise<WeatherApplicationSelection>;
export function weatherManagedOptions(args:string[]):WeatherManagedOptions;
export function startWeatherApplication(options:Omit<WeatherManagedOptions,'port'>&{
 port?:number;
 environment?:Record<string,string|undefined>;
}):Promise<WeatherApplicationSession>;
export function main(args?:string[]):Promise<WeatherApplicationSession|undefined>;

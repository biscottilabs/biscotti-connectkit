export type Languages =
  | 'ar-AE'
  | 'en-US'
  | 'ee-EE'
  | 'es-ES'
  | 'fa-IR'
  | 'fr-FR'
  | 'ja-JP'
  | 'pt-BR'
  | 'zh-CN'
  | 'ca-AD'
  | 'ru-RU'
  | 'zh-CN'
  | 'tr-TR'
  | 'vi-VN';

import { default as arAE } from './locales/ar-AE';
import { default as enUS } from './locales/en-US';
import { default as eeEE } from './locales/ee-EE';
import { default as esES } from './locales/es-ES';
import { default as faIR } from './locales/fa-IR';
import { default as frFR } from './locales/fr-FR';
import { default as jaJP } from './locales/ja-JP';
import { default as ptBR } from './locales/pt-BR';
import { default as ruRU } from './locales/ru-RU';
import { default as zhCN } from './locales/zh-CN';
import { default as caAD } from './locales/ca-AD';
import { default as trTR } from './locales/tr-TR';
import { default as viVN } from './locales/vi-VN';

// TODO: tree-shaking
export const getLocale = (lang: Languages) => {
  let locale = enUS;

  switch (lang) {
    case 'ee-EE':
      locale = eeEE;
      break;
    case 'ar-AE':
      locale = arAE;
      break;
    case 'es-ES':
      locale = esES;
      break;
    case 'fa-IR':
      locale = faIR;
      break;
    case 'fr-FR':
      locale = frFR;
      break;
    case 'ja-JP':
      locale = jaJP;
      break;
    case 'pt-BR':
      locale = ptBR;
      break;
    case 'ru-RU':
      locale = ruRU;
      break;
    case 'zh-CN':
      locale = zhCN;
      break;
    case 'ca-AD':
      locale = caAD;
      break;
    case 'tr-TR':
      locale = trTR;
      break;
    case 'vi-VN':
      locale = viVN;
      break;
    default:
      return enUS;
  }

  // New SDK surfaces can ship in English without breaking older locale files.
  // A translated value always wins when it exists.
  return { ...enUS, ...locale };
};

/*
// Could be useful for locale files to use these keys rather than hard-coded into the objects
export const keys = {
  connectorName: '{{ CONNECTORNAME }}',
  connectorShortName: '{{ CONNECTORSHORTNAME }}',
  suggestedExtensionBrowser: '{{ SUGGESTEDEXTENSIONBROWSER }}',
  walletConnectLogo: '{{ WALLETCONNECTLOGO }}',
};
*/

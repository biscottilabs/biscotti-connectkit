import { describe, expect, test } from 'bun:test';

import {
  environmentOfBlockchain,
  environmentOfChain,
} from '../src/circle/chains';
import { resolveCircleConfig } from '../src/circle/config';
import {
  issuesFromHealth,
  preflightCircleConfig,
} from '../src/circle/preflight';
import type { CircleConfigIssue } from '../src/circle/types';

const MAINNET = 1;
const BASE = 8453;
const BASE_SEPOLIA = 84532;
const ARC_TESTNET = 5042002;

const errorIds = (issues: CircleConfigIssue[]) =>
  issues
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.id)
    .sort();

describe('chains', () => {
  test('environment is derived from the blockchain name', () => {
    expect(environmentOfBlockchain('BASE')).toBe('mainnet');
    expect(environmentOfBlockchain('ARC-TESTNET')).toBe('testnet');
    expect(environmentOfBlockchain('MATIC-AMOY')).toBe('testnet');
    expect(environmentOfBlockchain('EVM-TESTNET')).toBe('testnet');
    expect(environmentOfChain(10143)).toBe('testnet');
    expect(environmentOfChain(999999)).toBeUndefined();
  });
});

describe('resolveCircleConfig', () => {
  const both = {
    environment: 'mainnet' as const,
    appId: 'shared',
    google: { clientId: 'g-shared', selectAccountPrompt: false },
    environments: {
      testnet: { appId: 'app-test', defaultChainId: ARC_TESTNET },
      mainnet: {
        appId: 'app-live',
        google: { clientId: 'g-live' },
        accountType: 'SCA' as const,
      },
    },
  };

  test('environment values override shared ones', () => {
    const resolved = resolveCircleConfig(both, [BASE_SEPOLIA, BASE]);
    expect(resolved.environment).toBe('mainnet');
    expect(resolved.appId).toBe('app-live');
    expect(resolved.google).toEqual({
      clientId: 'g-live',
      selectAccountPrompt: false,
    });
    expect(resolved.accountType).toBe('SCA');
    expect(resolved.defaultChainId).toBe(BASE);
  });

  test('switching environment changes only the active values', () => {
    const resolved = resolveCircleConfig({ ...both, environment: 'testnet' }, [
      BASE_SEPOLIA,
      BASE,
      ARC_TESTNET,
    ]);
    expect(resolved.appId).toBe('app-test');
    expect(resolved.defaultChainId).toBe(ARC_TESTNET);
    expect(resolved.accountType).toBe('EOA');
  });

  test('flat config infers the environment from chains', () => {
    const fromChains = resolveCircleConfig({ appId: 'x' }, [
      MAINNET,
      BASE_SEPOLIA,
    ]);
    expect(fromChains.environment).toBe('mainnet');
    expect(fromChains.environmentSource).toBe('chain');

    const fromDefault = resolveCircleConfig(
      { appId: 'x', defaultChainId: BASE_SEPOLIA },
      [MAINNET, BASE_SEPOLIA]
    );
    expect(fromDefault.environment).toBe('testnet');
  });

  test('a single declared environment is used', () => {
    const resolved = resolveCircleConfig(
      { environments: { mainnet: { appId: 'a' } } },
      [BASE_SEPOLIA, BASE]
    );
    expect(resolved.environment).toBe('mainnet');
    expect(resolved.environmentSource).toBe('environments');
  });

  test('defaults to testnet', () => {
    expect(resolveCircleConfig({}, [999]).environment).toBe('testnet');
  });
});

describe('preflightCircleConfig', () => {
  test('both environments without a choice is an error', () => {
    const issues = preflightCircleConfig(
      {
        environments: { testnet: { appId: 'a' }, mainnet: { appId: 'b' } },
        google: { clientId: 'g' },
      },
      [BASE_SEPOLIA, BASE]
    );
    expect(errorIds(issues)).toEqual(['ambiguousEnvironment']);
  });

  test('default chain from the other environment and missing from wagmi', () => {
    const issues = preflightCircleConfig(
      {
        environment: 'testnet',
        appId: 'a',
        google: { clientId: 'g' },
        defaultChainId: BASE,
      },
      [BASE_SEPOLIA]
    );
    expect(errorIds(issues)).toEqual([
      'defaultChainNotConfigured',
      'environmentChainMismatch',
    ]);
  });

  test('invalid environment value', () => {
    const issues = preflightCircleConfig(
      { environment: 'live' as never, appId: 'a', methods: ['email'] },
      [BASE]
    );
    expect(errorIds(issues)).toContain('invalidEnvironment');
  });

  test('variable names carry no framework prefix', () => {
    const issues = preflightCircleConfig(
      { environment: 'testnet', environments: { testnet: {} } },
      [ARC_TESTNET]
    );
    expect(issues.find((issue) => issue.id === 'appId')?.envVar).toBe(
      'CIRCLE_TESTNET_APP_ID'
    );
    expect(issues.find((issue) => issue.id === 'googleClientId')?.envVar).toBe(
      'GOOGLE_CLIENT_ID'
    );
    expect(JSON.stringify(issues)).not.toContain('NEXT_PUBLIC_CIRCLE');
  });
});

describe('issuesFromHealth', () => {
  test('uses the active environment entry', () => {
    const report = { ok: true, environments: { testnet: { ok: true } } };
    expect(issuesFromHealth(report, 'testnet')).toEqual([]);
    expect(issuesFromHealth(report, 'mainnet')[0].id).toBe(
      'serverEnvironmentMissing'
    );
  });

  test('falls back to top-level fields for older servers', () => {
    const issues = issuesFromHealth(
      { ok: false, missing: [{ id: 'apiKey', scope: 'server' }] },
      'testnet'
    );
    expect(issues[0].id).toBe('apiKey');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedIP, isValidServerHost } from '../utils/networkValidation';

describe('isBlockedIP', () => {
  it('blocks IPv4 loopback 127.0.0.1', () => assert.equal(isBlockedIP('127.0.0.1'), true));
  it('blocks IPv4 loopback 127.0.0.2', () => assert.equal(isBlockedIP('127.0.0.2'), true));
  it('blocks link-local 169.254.169.254', () => assert.equal(isBlockedIP('169.254.169.254'), true));
  it('blocks unspecified 0.0.0.0', () => assert.equal(isBlockedIP('0.0.0.0'), true));
  it('blocks IPv6 loopback ::1', () => assert.equal(isBlockedIP('::1'), true));
  it('blocks IPv6 unspecified ::', () => assert.equal(isBlockedIP('::'), true));
  it('blocks IPv4-mapped IPv6 ::ffff:127.0.0.1', () =>
    assert.equal(isBlockedIP('::ffff:127.0.0.1'), true));
  it('blocks expanded IPv6 loopback 0:0:0:0:0:0:0:1', () =>
    assert.equal(isBlockedIP('0:0:0:0:0:0:0:1'), true));

  it('allows private LAN 10.0.0.1', () => assert.equal(isBlockedIP('10.0.0.1'), false));
  it('allows private LAN 172.16.0.1', () => assert.equal(isBlockedIP('172.16.0.1'), false));
  it('allows private LAN 192.168.1.1', () => assert.equal(isBlockedIP('192.168.1.1'), false));
  it('allows public IP 1.2.3.4', () => assert.equal(isBlockedIP('1.2.3.4'), false));
  it('allows public IP 8.8.8.8', () => assert.equal(isBlockedIP('8.8.8.8'), false));
});

describe('isValidServerHost', () => {
  it('accepts valid IPv4', () => assert.equal(isValidServerHost('192.168.1.100'), true));
  it('accepts valid public IP', () => assert.equal(isValidServerHost('1.2.3.4'), true));
  it('accepts valid hostname', () =>
    assert.equal(isValidServerHost('my-server.example.com'), true));
  it('accepts single-label hostname', () => assert.equal(isValidServerHost('myserver'), true));

  it('rejects loopback IP', () => assert.equal(isValidServerHost('127.0.0.1'), false));
  it('rejects link-local IP', () => assert.equal(isValidServerHost('169.254.1.1'), false));
  it('rejects localhost hostname', () => assert.equal(isValidServerHost('localhost'), false));
  it('rejects empty string', () => assert.equal(isValidServerHost(''), false));
  it('rejects very long hostname', () => assert.equal(isValidServerHost('a'.repeat(254)), false));
  it('rejects hostname with leading hyphen', () =>
    assert.equal(isValidServerHost('-invalid.com'), false));
  it('rejects hostname with trailing hyphen', () =>
    assert.equal(isValidServerHost('invalid-.com'), false));
  it('rejects hostname with special chars', () =>
    assert.equal(isValidServerHost('invalid!.com'), false));
  it('rejects non-string input', () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.equal(isValidServerHost(42 as any), false));
});

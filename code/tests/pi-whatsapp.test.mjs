import assert from 'node:assert/strict';
import {
  assistantText,
  extractText,
  filterIncomingMessage,
  getAudioMessage,
  getImageMessage,
  isNonPersonalJid,
  maskPhone,
  normalizeLidJid,
  normalizePersonalJid,
  phoneToPersonalJid,
} from '../extensions/whatsapp/whatsapp-utils.ts';

assert.equal(phoneToPersonalJid('+1 (555) 123-4567'), '15551234567@s.whatsapp.net');
assert.equal(normalizePersonalJid('15551234567:12@s.whatsapp.net'), '15551234567@s.whatsapp.net');
assert.equal(normalizeLidJid('207666014081169:12@lid'), '207666014081169@lid');
assert.equal(phoneToPersonalJid('123'), undefined);
assert.equal(maskPhone('+15551234567'), '+*******4567');

assert.equal(isNonPersonalJid('1203630@g.us'), true);
assert.equal(isNonPersonalJid('status@broadcast'), true);
assert.equal(isNonPersonalJid('123@newsletter'), true);
assert.equal(isNonPersonalJid('15551234567@s.whatsapp.net'), false);
assert.equal(isNonPersonalJid('207666014081169@lid'), false);

const allowedJid = '15551234567@s.whatsapp.net';
assert.deepEqual(filterIncomingMessage({ remoteJid: allowedJid, allowedJid, fromMe: false }), { allowed: true, jid: allowedJid });
assert.equal(filterIncomingMessage({ remoteJid: '1203630@g.us', allowedJid, fromMe: false }).allowed, false);
assert.equal(filterIncomingMessage({ remoteJid: '111@s.whatsapp.net', allowedJid, fromMe: false }).allowed, false);
assert.deepEqual(filterIncomingMessage({ remoteJid: '207666014081169@lid', allowedJid, allowedLids: ['207666014081169@lid'], fromMe: false }), { allowed: true, jid: '207666014081169@lid' });
assert.equal(filterIncomingMessage({ remoteJid: allowedJid, allowedJid, fromMe: true }).allowed, false);

assert.equal(extractText({ conversation: 'hello' }), 'hello');
assert.equal(extractText({ extendedTextMessage: { text: 'extended' } }), 'extended');
assert.equal(extractText({ imageMessage: { caption: 'caption' } }), 'caption');
assert.equal(extractText({ ephemeralMessage: { message: { conversation: 'wrapped' } } }), 'wrapped');
assert.ok(getImageMessage({ imageMessage: { mimetype: 'image/jpeg' } }));
assert.ok(getAudioMessage({ audioMessage: { mimetype: 'audio/ogg' } }));

assert.equal(assistantText({ role: 'assistant', content: ' hi ' }), 'hi');
assert.equal(assistantText({ role: 'assistant', content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }), 'a\nb');
assert.equal(assistantText({ role: 'user', content: 'nope' }), '');

console.log('pi-whatsapp tests passed');

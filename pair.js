const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  downloadContentFromMessage,
  DisconnectReason
} = require('baileys');

// ---------------- CONFIG ----------------

const BOT_NAME_FANCY = '🌹 ＢＬＯＯＤＹ ＲＯＳＥ 🌹';

const config = {
  AUTO_VIEW_STATUS: 'true', // Master, මේක true කරන එක ලස්සනයි
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'true',
  AUTO_LIKE_EMOJI: ['🌹', '💉', '🩸', '💀', '🥀', '💊', '🫀', '🧿', '🖤', '🔥'],
  PREFIX: '.',
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/BFalrJo3NQj0lq5F9GKvR5?mode=gi_t',
  RCD_IMAGE_PATH: 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg',
  NEWSLETTER_JID: '120363421675697127@newsletter',
  OTP_EXPIRY: 300000,
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94771483306', // ඔයාගේ නම්බර් එක දැම්මා
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbBjdX81XquXcMfqXz2z',
  BOT_NAME: 'BLOODY ROSE MD',
  BOT_VERSION: '1.0.0V',
  OWNER_NAME: 'ＬＯＲＤ ＩＮＤＵＭＩＮＡ 💉',
  IMAGE_PATH: 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg',
  BOT_FOOTER: '🌹 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐁𝐋𝐎𝐎𝐃Ｙ 𝐑𝐎𝐒𝐄 🌹',
  BUTTON_IMAGES: { ALIVE: 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg' }
};

module.exports = config;
// ---------------- MONGO SETUP ----------------

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://indumina2011:indumina2011@cluster0.a5nqcag.mongodb.net/';
const MONGO_DB = process.env.MONGO_DB || 'indumina2011'
let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch(e){}
  mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  console.log('✅ Mongo initialized and collections ready');
}

// ---------------- Mongo helpers ----------------

async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await configsCol.findOne({ number: sanitized });
    return doc ? doc.config : null;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

// -------------- newsletter react-config helpers --------------

async function addNewsletterReactConfig(jid, emojis = []) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
    console.log(`Added react-config for ${jid} -> ${emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
    console.log(`Removed react-config for ${jid}`);
  } catch (e) { console.error('removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return []; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : []) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

// ---------------- basic utils ----------------

function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n> *${footer}*`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getSriLankaTimestamp(){ return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

const activeSockets = new Map();

const socketCreationTime = new Map();

const otpStore = new Map();

// ---------------- helpers kept/adapted ----------------

async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}

async function sendAdminConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  const admins = await loadAdminsFromMongo();
  const groupStatus = groupResult.status === 'success' ? `Joined (ID: ${groupResult.gid})` : `Failed to join group: ${groupResult.error}`;
  const botName = sessionConfig.botName || BOT_NAME_FANCY;
  const image = sessionConfig.logo || config.RCD_IMAGE_PATH;
  const caption = formatMessage(botName, `📞 Number: ${number}\n🩵 Status: ${groupStatus}\n🕒 Connected at: ${getSriLankaTimestamp()}`, botName);
  for (const admin of admins) {
    try {
      const to = admin.includes('@') ? admin : `${admin}@s.whatsapp.net`;
      if (String(image).startsWith('http')) {
        await socket.sendMessage(to, { image: { url: image }, caption });
      } else {
        try {
          const buf = fs.readFileSync(image);
          await socket.sendMessage(to, { image: buf, caption });
        } catch (e) {
          await socket.sendMessage(to, { image: { url: config.RCD_IMAGE_PATH }, caption });
        }
      }
    } catch (err) {
      console.error('Failed to send connect message to admin', admin, err?.message || err);
    }
  }
}

async function sendOwnerConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  try {
    const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
    const activeCount = activeSockets.size;
    const botName = sessionConfig.botName || BOT_NAME_FANCY;
    const image = sessionConfig.logo || config.RCD_IMAGE_PATH;
    const groupStatus = groupResult.status === 'success' ? `Joined (ID: ${groupResult.gid})` : `Failed to join group: ${groupResult.error}`;
    const caption = formatMessage(`👑 OWNER CONNECT — ${botName}`, `📞 Number: ${number}\n🩵 Status: ${groupStatus}\n🕒 Connected at: ${getSriLankaTimestamp()}\n\n🔢 Active sessions: ${activeCount}`, botName);
    if (String(image).startsWith('http')) {
      await socket.sendMessage(ownerJid, { image: { url: image }, caption });
    } else {
      try {
        const buf = fs.readFileSync(image);
        await socket.sendMessage(ownerJid, { image: buf, caption });
      } catch (e) {
        await socket.sendMessage(ownerJid, { image: { url: config.RCD_IMAGE_PATH }, caption });
      }
    }
  } catch (err) { console.error('Failed to send owner connect message:', err); }
}

async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`🔐 OTP VERIFICATION — ${BOT_NAME_FANCY}`, `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.\n\nNumber: ${number}`, BOT_NAME_FANCY);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- handlers (newsletter + reactions) ----------------

async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      const followedDocs = await listNewslettersFromMongo(); // array of {jid, emojis}
      const reactConfigs = await listNewsletterReactsFromMongo(); // [{jid, emojis}]
      const reactMap = new Map();
      for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

      let emojis = reactMap.get(jid) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3 - retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }

    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  });
}


// ---------------- status + revocation + resizing ----------------

async function setupStatusHandlers(socket) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
    try {
      if (config.AUTO_RECORDING === 'true') await socket.sendPresenceUpdate("recording", message.key.remoteJid);
      if (config.AUTO_VIEW_STATUS === 'true') {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try { await socket.readMessages([message.key]); break; }
          catch (error) { retries--; await delay(1000 * (config.MAX_RETRIES - retries)); if (retries===0) throw error; }
        }
      }
      if (config.AUTO_LIKE_STATUS === 'true') {
        const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(message.key.remoteJid, { react: { text: randomEmoji, key: message.key } }, { statusJidList: [message.key.participant] });
            break;
          } catch (error) { retries--; await delay(1000 * (config.MAX_RETRIES - retries)); if (retries===0) throw error; }
        }
      }

    } catch (error) { console.error('Status handler error:', error); }
  });
}


async function handleMessageRevocation(socket, number) {
  socket.ev.on('messages.delete', async ({ keys }) => {
    if (!keys || keys.length === 0) return;
    const messageKey = keys[0];
    const userJid = jidNormalizedUser(socket.user.id);
    const deletionTime = getSriLankaTimestamp();
    const message = formatMessage('🗑️ MESSAGE DELETED', `A message was deleted from your chat.\n📋 From: ${messageKey.remoteJid}\n🍁 Deletion Time: ${deletionTime}`, BOT_NAME_FANCY);
    try { await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: message }); }
    catch (error) { console.error('Failed to send deletion notification:', error); }
  });
}


async function resize(image, width, height) {
  let oyy = await Jimp.read(image);
  return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}


// ---------------- command handlers ----------------

function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const type = getContentType(msg.message);
    if (!msg.message) return;
    msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

    const from = msg.key.remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const botNumber = socket.user.id ? socket.user.id.split(':')[0] : '';
    const isOwner = senderNumber === config.OWNER_NUMBER.replace(/[^0-9]/g,'');

    const body = (type === 'conversation') ? msg.message.conversation
      : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text
      : (type === 'imageMessage' && msg.message.imageMessage.caption) ? msg.message.imageMessage.caption
      : (type === 'videoMessage' && msg.message.videoMessage.caption) ? msg.message.videoMessage.caption
      : (type === 'buttonsResponseMessage') ? msg.message.buttonsResponseMessage?.selectedButtonId
      : (type === 'listResponseMessage') ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
      : (type === 'viewOnceMessage') ? (msg.message.viewOnceMessage?.message?.imageMessage?.caption || '') : '';

    if (!body || typeof body !== 'string') return;

    const prefix = config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

    // helper: download quoted media into buffer
    async function downloadQuotedMedia(quoted) {
      if (!quoted) return null;
      const qTypes = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) return null;
      const messageType = qType.replace(/Message$/i, '').toLowerCase();
      const stream = await downloadContentFromMessage(quoted[qType], messageType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        buffer,
        mime: quoted[qType].mimetype || '',
        caption: quoted[qType].caption || quoted[qType].fileName || '',
        ptt: quoted[qType].ptt || false,
        fileName: quoted[qType].fileName || ''
      };
    }

    if (!command) return;

    try {
      switch (command) {
        // --- existing commands (deletemenumber, unfollow, newslist, admin commands etc.) ---
        // ... (keep existing other case handlers unchanged) ...
         case 'ts': {
    const axios = require('axios');

    // 1. Extract Search Query
    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    let query = q.replace(/^[.\/!]ts\s*/i, '').trim();

    if (!query) {
        return await socket.sendMessage(sender, { 
            text: "⚠️ *කරුණාකර නමක් ලබා දෙන්න!*" 
        }, { quoted: msg });
    }

    // 2. Load bot name & configuration
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || 'isp';
    const myPhoto = "https://i.postimg.cc/gjkQy2Kd/images-(9).jpg"; 

    // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
    const lordMeta = {
        key: { 
            remoteJid: "status@broadcast", 
            participant: "0@s.whatsapp.net", 
            fromMe: false, 
            id: "BLOODY_ROSE_META_ID" 
        },
        message: {
            contactMessage: {
                displayName: "BLOODY ROSE 💉",
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD`
            }
        }
    };

    try {
        // --- 🔎 Reaction & Loading Animation ---
        await socket.sendMessage(sender, { react: { text: "🔎", key: msg.key } });
        const loadMsg = await socket.sendMessage(sender, { text: `[▒▒▒▒▒▒▒▒▒▒] 0% 💉🌹` }, { quoted: msg });

        const steps = [
            { bar: "[██▒▒▒▒▒▒▒▒] 20%", time: 500 },
            { bar: "[█████▒▒▒▒▒] 50%", time: 1000 },
            { bar: "[████████▒▒] 85%", time: 1500 },
            { bar: "[██████████] 100%", time: 2000 }
        ];

        for (const step of steps) {
            setTimeout(async () => {
                await socket.sendMessage(sender, { text: `${step.bar} 💉🌹`, edit: loadMsg.key });
            }, step.time);
        }

        // 3. TikTok Search Request
        const options = {
            method: 'GET',
            url: 'https://tiktok-api23.p.rapidapi.com/api/search/video',
            params: { keyword: query, count: '10', cursor: '0' },
            headers: {
                'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com',
                'x-rapidapi-key': 'b3ed75dd4fmsh37bac3020dc7418p16c174jsnc0e38d8598c6'
            }
        };

        const response = await axios.request(options);
        const posts = response.data?.data || response.data?.videos || response.data?.items;

        if (!posts || posts.length === 0) {
            return await socket.sendMessage(sender, { text: `❌ *වීඩියෝ හමු නොවීය.*`, edit: loadMsg.key });
        }

        global.tiktokSearchResults = global.tiktokSearchResults || {};
        global.tiktokSearchResults[sender] = posts.slice(0, 7);

        // 4. Luxury Menu Design
        let resultMsg = `✨ *B L O O D Y  R O S E  V 4* ✨\n\n`;
        resultMsg += `👑 *OWNER:* LORD INDUMINA\n`;
        resultMsg += `🔎 *SEARCH:* \`${query.toUpperCase()}\`\n`;
        resultMsg += `──────────────────────\n\n`;

        posts.slice(0, 7).forEach((v, i) => {
            const title = v.desc || v.title || 'TikTok Video';
            const author = v.author?.uniqueId || 'User';
            resultMsg += `*${i + 1}* ┏ 🎬 ${title.slice(0, 35)}...\n`;
            resultMsg += `    ┃ 👤 *CREATOR:* @${author}\n`;
            resultMsg += `    ┗ ⏱️ *TIME:* ${v.video?.duration || '0'}s\n\n`;
        });

        resultMsg += `──────────────────────\n`;
        resultMsg += `📥 *බාගත කිරීමට අංකය REPLY කරන්න.*\n\n`;
        resultMsg += `> *Created By ${botName} 💉🩸*`;

        setTimeout(async () => {
            await socket.sendMessage(sender, { delete: loadMsg.key });
            
            const cover = posts[0].cover || myPhoto;
            const sentMsg = await socket.sendMessage(sender, {
                image: { url: cover },
                caption: resultMsg,
                contextInfo: {
                    externalAdReply: {
                        title: "L O R D  I N D U M I N A  💉",
                        body: "B L O O D Y  R O S E  T I K T O K",
                        thumbnailUrl: myPhoto,
                        mediaType: 1,
                        sourceUrl: "https://github.com/Indumina-Lord"
                    }
                }
            }, { quoted: lordMeta }); // මෙතනින් තමයි Lord Indumina ගේ Card එක quote වෙන්නේ

            // 5. Reply Listener for Downloading
            const listener = async (mUpdate) => {
                const nMsg = mUpdate.messages[0];
                if (!nMsg.message) return;

                const isReply = nMsg.message.extendedTextMessage?.contextInfo?.stanzaId === sentMsg.key.id;
                const replyText = nMsg.message.conversation || nMsg.message.extendedTextMessage?.text;

                if (isReply && replyText && /^\d+$/.test(replyText.trim())) {
                    const index = parseInt(replyText.trim()) - 1;
                    const results = global.tiktokSearchResults[sender];

                    if (results && results[index]) {
                        try {
                            await socket.sendMessage(sender, { react: { text: "📥", key: nMsg.key } });
                            const video = results[index];
                            const author = video.author?.uniqueId || 'User';
                            const tikUrl = `https://www.tiktok.com/@${author}/video/${video.id || video.aweme_id}`;

                            const tikwm = await axios.post('https://www.tikwm.com/api/', { url: tikUrl });
                            const dlUrl = tikwm.data?.data?.play;

                            if (dlUrl) {
                                await socket.sendMessage(sender, {
                                    video: { url: dlUrl },
                                    caption: `🎬 *T I K T O K  D O W N L O A D*\n\n📝 ${video.desc || 'Success'}\n👤 *Creator:* @${author}\n\n> *${botName} 💉*`,
                                    mimetype: 'video/mp4'
                                }, { quoted: nMsg });
                            }
                            socket.ev.off('messages.upsert', listener);
                        } catch (e) {
                            socket.ev.off('messages.upsert', listener);
                        }
                    }
                }
            };

            socket.ev.on('messages.upsert', listener);
            setTimeout(() => { socket.ev.off('messages.upsert', listener); }, 300000);

        }, 2300);

    } catch (err) {
        await socket.sendMessage(sender, { text: "⚠️ *Error!*" }, { quoted: msg });
    }
    break;
}

case 'getdp': {
    try {
        // 1. Configuration & Bot Details
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const cfg = await loadUserConfigFromMongo(sanitized) || {};
        
        // මෙතන තමයි කලින් වැරදුනේ - මම මේක "BLOODY ROSE V4" වලට මාරු කළා
        const botName = cfg.botName || 'BLOODY ROSE V4';
        const myPhoto = "https://i.postimg.cc/gjkQy2Kd/images-(9).jpg"; 

        // 2. Extract number from the message
        let q = msg.message?.conversation?.split(" ")[1] || 
                msg.message?.extendedTextMessage?.text?.split(" ")[1];

        if (!q) return await socket.sendMessage(sender, { 
            text: "⚠️ *Please provide a phone number!*\n\n*Usage:* `.getdp 947xxxxxxxxx`" 
        }, { quoted: msg });

        // 3. Format JID and Start Fetching
        let jid = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        
        // Show reaction
        await socket.sendMessage(sender, { react: { text: "🖼️", key: msg.key } });

        let ppUrl;
        try {
            ppUrl = await socket.profilePictureUrl(jid, "image");
        } catch {
            ppUrl = "https://i.ibb.co/3S89z6Y/no-dp.jpg"; 
        }

        // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
        const lordMeta = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: `BR_DP_${Date.now()}` 
            },
            message: {
                contactMessage: {
                    displayName: "LORD INDUMINA 💉",
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD`
                }
            }
        };

        // 4. English Luxury Caption Design
        let caption = `✨ *B L O O D Y  R O S E  G E T D P* ✨\n\n`;
        caption += `👤 *USER:* +${q.replace(/[^0-9]/g, '')}\n`;
        caption += `👑 *OWNER:* LORD INDUMINA\n`;
        caption += `──────────────────────\n\n`;
        caption += `🖼️ Success! Here is the profile picture you requested.\n\n`;
        caption += `> *Created By ${botName} 💉🩸*`;

        // 5. Final Message - Title/Body නැතිව Large Thumbnail එක විතරක් සහිතව
        await socket.sendMessage(sender, { 
            image: { url: ppUrl }, 
            caption: caption,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    sourceUrl: "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: lordMeta });

    } catch (e) {
        console.log("❌ getdp error:", e);
        await socket.sendMessage(sender, { text: "⚠️ *Error: Could not fetch profile picture.*" });
    }
    break;
}
const axios = require('axios');
module.exports = {
    name: 'ai',
    alias: ['chat', 'rose', 'ask'],
    async execute(sock, m, { args }) {
        const from = m.key.remoteJid;
        const text = args.join(' ');
        const apiKey = "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";
        const myPhoto = "https://i.postimg.cc/gjkQy2Kd/images-(9).jpg"; 

        // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
        const lordMeta = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: `BLOODY_ROSE_AI_${Date.now()}` 
            },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        if (!text) {
            return await sock.sendMessage(from, { 
                text: "🌹 *B L O O D Y  R O S E  A I*\n\n_Master, I am online. How can I assist you today?_" 
            }, { quoted: lordMeta });
        }

        try {
            // 🩸 Step 1: React with blood to show AI is thinking
            await sock.sendMessage(from, { react: { text: "🩸", key: m.key } });

            // Groq API Request
            const response = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    messages: [
                        { role: "system", content: "You are Bloody Rose, a stylish WhatsApp AI bot created by Lord Indumina. Keep answers short and cool. Use emojis like 🌹 and 💉 in your replies." },
                        { role: "user", content: text }
                    ],
                    model: "llama-3.1-8b-instant",
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const aiResponse = response.data.choices[0].message.content;

            // Final Result with Professional AdReply
            await sock.sendMessage(from, {
                text: `✨ *B L O O D Y  R O S E  A I* ✨\n\n${aiResponse}\n\n> *POWERED BY LORD INDUMINA 💉*`,
                contextInfo: {
                    externalAdReply: {
                        title: "L O R D  I N D U M I N A  💉",
                        body: "A I  C H A T  S Y S T E M",
                        thumbnailUrl: myPhoto,
                        mediaType: 1,
                        renderLargerThumbnail: false,
                        sourceUrl: "https://github.com/Indumina-Lord"
                    }
                }
            }, { quoted: lordMeta });

            // 🌹 Step 2: Change reaction to rose once replied
            await sock.sendMessage(from, { react: { text: "🌹", key: m.key } });

        } catch (error) {
            console.error("AI Error:", error.message);
            await sock.sendMessage(from, { 
                text: "⚠️ *AI Error:* Something went wrong. Please try again later!" 
            }, { quoted: m });
        }
    }
};
 case 'weather': {
    try {
        const city = args.join(" ");
        const myPhoto = "https://i.postimg.cc/gjkQy2Kd/images-(9).jpg"; 

        // 🔹 මෙන්න මේක තමයි ඔයා ඉල්ලපු FAKE META CARD එක
        const lordMeta = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: `BR_WEATHER_${Date.now()}` 
            },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        if (!city) {
            return await socket.sendMessage(sender, { 
                text: "❗ *Please provide a city name!*" 
            }, { quoted: lordMeta }); // මෙතනදී Card එක quote වෙනවා
        }

        await socket.sendMessage(sender, { react: { text: "🌤️", key: msg.key } });

        const apiKey = '2d61a72574c11c4f36173b627f8cb177';
        const url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`;

        const response = await axios.get(url);
        const data = response.data;

        // Luxury English Caption (No Queen Asha)
        let weatherMsg = `✨ *B L O O D Y  R O S E  W E A T H E R* ✨\n\n`;
        weatherMsg += `📍 *LOCATION:* ${data.name}, ${data.sys.country}\n`;
        weatherMsg += `🌡️ *TEMPERATURE:* ${data.main.temp}°C\n`;
        weatherMsg += `🎭 *FEELS LIKE:* ${data.main.feels_like}°C\n`;
        weatherMsg += `💧 *HUMIDITY:* ${data.main.humidity}%\n`;
        weatherMsg += `☁️ *WEATHER:* ${data.weather[0].main} (${data.weather[0].description})\n`;
        weatherMsg += `💨 *WIND SPEED:* ${data.wind.speed} m/s\n\n`;
        weatherMsg += `──────────────────────\n`;
        weatherMsg += `> *CREATED BY LORD INDUMINA 💉🩸*`;

        const weatherIcon = `https://openweathermap.org/img/wn/${data.weather[0].icon}@4x.png`;
        
        await socket.sendMessage(sender, {
            image: { url: weatherIcon },
            caption: weatherMsg,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ඔයා ඉල්ලපු විදියට ලොකු Thumbnail එක විතරයි
                    sourceUrl: "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: lordMeta }); // මෙතනිනුත් Card එක quote වෙනවා

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        if (e.response && e.response.status === 404) {
            await socket.sendMessage(sender, { text: "🚫 *City not found!*" });
        } else {
            await socket.sendMessage(sender, { text: "⚠️ *An error occurred!*" });
        }
    }
    break;
}
case 'aiimg': 
case 'aiimg2': {
    const axios = require('axios');

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    const prompt = q.replace(/^[.\/!](aiimg2|aiimg)\s*/i, '').trim();

    const myPhoto = "https://i.postimg.cc/gjkQy2Kd/images-(9).jpg"; 

    // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
    const lordMeta = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: `BR_AI_IMG_${Date.now()}`
        },
        message: {
            contactMessage: {
                displayName: "LORD INDUMINA 💉",
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD`
            }
        }
    };

    if (!prompt) {
        return await socket.sendMessage(sender, {
            text: '🎨 *Please provide a description (prompt) to generate your AI image.*'
        }, { quoted: lordMeta });
    }

    try {
        // Reaction & Notification
        await socket.sendMessage(sender, { react: { text: "🎨", key: msg.key } });
        const loadMsg = await socket.sendMessage(sender, { text: '💉 *Bloody Rose is drawing your imagination...*' }, { quoted: lordMeta });

        // Determine API URL based on command
        let apiUrl = '';
        if (command === 'aiimg') {
            apiUrl = `https://movanest.zone.id/v2/pollinations-image?prompt=${encodeURIComponent(prompt)}`;
        } else if (command === 'aiimg2') {
            apiUrl = `https://api.siputzx.my.id/api/ai/magicstudio?prompt=${encodeURIComponent(prompt)}`;
        }

        // Call AI API
        const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });

        if (!response || !response.data) {
            return await socket.sendMessage(sender, {
                text: '❌ *Failed to generate image. Try again later.*'
            }, { edit: loadMsg.key });
        }

        const imageBuffer = Buffer.from(response.data, 'binary');

        // Luxury Caption
        let caption = `✨ *B L O O D Y  R O S E  A I  I M A G E* ✨\n\n`;
        caption += `📝 *PROMPT:* ${prompt}\n`;
        caption += `👑 *OWNER:* LORD INDUMINA\n`;
        caption += `──────────────────────\n\n`;
        caption += `> *Generated By Bloody Rose V4 💉🩸*`;

        // Send AI Image with Large Thumbnail
        await socket.sendMessage(sender, { delete: loadMsg.key });
        
        await socket.sendMessage(sender, {
            image: imageBuffer,
            caption: caption,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ලොකු thumbnail එක විතරක් පේන්න
                    sourceUrl: "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: lordMeta });

        await socket.sendMessage(sender, { react: { text: "🌹", key: msg.key } });

    } catch (err) {
        console.error('AI Image Error:', err);
        await socket.sendMessage(sender, {
            text: `❗ *An error occurred while generating the image.*`
        }, { quoted: msg });
    }
    break;
}               case 'pair': {
    // ✅ Fix for node-fetch v3.x (ESM-only module)
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    const number = q.replace(/^[.\/!]pair\s*/i, '').trim();

    if (!number) {
        return await socket.sendMessage(sender, {
            text: '*📌 Usage:* .pair +9470604XXXX'
        }, { quoted: msg });
    }

    try {
        const url = `https://mini-bot-1-6bip.onrender.com/code?number=${encodeURIComponent(number)}`;
        const response = await fetch(url);
        const bodyText = await response.text();

        console.log("🌐 API Response:", bodyText);

        let result;
        try {
            result = JSON.parse(bodyText);
        } catch (e) {
            console.error("❌ JSON Parse Error:", e);
            return await socket.sendMessage(sender, {
                text: '❌ Invalid response from server. Please contact support.'
            }, { quoted: msg });
        }

        if (!result || !result.code) {
            return await socket.sendMessage(sender, {
                text: '❌ Failed to retrieve pairing code. Please check the number.'
            }, { quoted: msg });
        }
		await socket.sendMessage(m.chat, { react: { text: '🔑', key: msg.key } });
        await socket.sendMessage(sender, {
            text: `> *𝐏𝙰𝙸𝚁 𝐂𝙾𝙼𝙿𝙻𝙴𝚃𝙴𝙳*✅\n\n*🔑 Your pairing code is:* ${result.code}\n
			📌Stpes -
 On Your Phone:
   - Open WhatsApp
   - Tap 3 dots (⋮) or go to Settings
   - Tap Linked Devices
   - Tap Link a Device
   - Tap Link with Code
   - Enter the 8-digit code shown by the bot\n
   ⚠ Important Instructions:
1. ⏳ Pair this code within 1 minute.
2. 🚫 Do not share this code with anyone.
3. 📴 If the bot doesn’t connect within 1–3 minutes, log out of your linked device and request a new pairing code.
> > Queen Asha Mini `
        }, { quoted: msg });

        await sleep(2000);

        await socket.sendMessage(sender, {
            text: `${result.code}\n> > NIKKA V5`
        }, { quoted: msg });

    } catch (err) {
        console.error("❌ Pair Command Error:", err);
        await socket.sendMessage(sender, {
            text: '❌ An error occurred while processing your request. Please try again later.'
        }, { quoted: msg });
    }

    break;
}

 case 'cricket': {
    try {
        const myPhoto = "https://i.postimg.cc/gjkQy2Kd/images-(9).jpg"; 

        // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
        const lordMeta = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: `BR_CRICKET_${Date.now()}` 
            },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        // Reaction
        await socket.sendMessage(sender, { react: { text: "🏏", key: msg.key } });

        const response = await fetch('https://suhas-bro-api.vercel.app/news/cricbuzz');
        if (!response.ok) throw new Error(`API failed: ${response.status}`);

        const data = await response.json();

        if (!data.status || !data.result) {
            return await socket.sendMessage(sender, { text: "🚫 *Live match data not found at the moment!*" }, { quoted: lordMeta });
        }

        const { title, score, to_win, crr, link } = data.result;

        // 🔹 LUXURY CRICKET CAPTION
        let cricMsg = `✨ *B L O O D Y  R O S E  C R I C K E T* ✨\n\n`;
        cricMsg += `📢 *MATCH:* ${title}\n\n`;
        cricMsg += `🏆 *SCORE:* ${score}\n`;
        cricMsg += `🎯 *TO WIN:* ${to_win}\n`;
        cricMsg += `📈 *RUN RATE:* ${crr}\n\n`;
        cricMsg += `🌐 *LINK:* ${link}\n\n`;
        cricMsg += `──────────────────────\n`;
        cricMsg += `> *UPDATED BY LORD INDUMINA 💉🩸*`;

        // Sending the message with Large Thumbnail only
        await socket.sendMessage(sender, {
            text: cricMsg,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ලොකු Thumbnail එක විතරයි
                    sourceUrl: link || "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: lordMeta });

    } catch (error) {
        console.error(`Error in cricket case: ${error.message}`);
        await socket.sendMessage(sender, {
            text: '⚠️ *System Error: Could not fetch cricket news!*'
        }, { quoted: msg });
    }
    break;
}
  case 'gossip': {
    try {
        const myPhoto = "https://i.postimg.cc/gjkQy2Kd/images-(9).jpg"; 

        // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
        const lordMeta = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: `BR_GOSSIP_${Date.now()}` 
            },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        // Reaction
        await socket.sendMessage(sender, { react: { text: "📰", key: msg.key } });

        const response = await fetch('https://suhas-bro-api.vercel.app/news/gossiplankanews');
        if (!response.ok) throw new Error('Failed to fetch gossip news');

        const data = await response.json();
        if (!data.status || !data.result) throw new Error('Invalid data structure');

        const { title, desc, date, link } = data.result;

        // Image Scraper
        let thumbnailUrl = 'https://via.placeholder.com/150';
        try {
            const pageResponse = await fetch(link);
            if (pageResponse.ok) {
                const pageHtml = await pageResponse.text();
                const cheerio = require('cheerio'); 
                const $ = cheerio.load(pageHtml);
                thumbnailUrl = $('meta[property="og:image"]').attr('content') || thumbnailUrl;
            }
        } catch (err) {
            console.warn(`Thumbnail scrape failed: ${err.message}`);
        }

        // 🔹 BLOODY ROSE LUXURY CAPTION
        let gossipMsg = `✨ *B L O O D Y  R O S E  G O S S I P* ✨\n\n`;
        gossipMsg += `📢 *TITLE:* ${title}\n\n`;
        gossipMsg += `📝 *INFO:* ${desc}\n\n`;
        gossipMsg += `🕒 *DATE:* ${date || 'Just now'}\n`;
        gossipMsg += `🌐 *LINK:* ${link}\n\n`;
        gossipMsg += `──────────────────────\n`;
        gossipMsg += `> *NEWS BY BLOODY ROSE V4 💉🩸*`; // මෙන්න මෙතන වෙනස් කළා

        // Send message with News Image and Large AdReply
        await socket.sendMessage(sender, {
            image: { url: thumbnailUrl },
            caption: gossipMsg,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto, 
                    mediaType: 1,
                    renderLargerThumbnail: true, 
                    sourceUrl: link
                }
            }
        }, { quoted: lordMeta });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (error) {
        console.error(`Error in gossip news: ${error.message}`);
        await socket.sendMessage(sender, {
            text: '⚠️ *System Error: Could not fetch news!*'
        }, { quoted: msg });
    }
    break;
}
case 'deleteme': {
  // 'number' is the session number passed to setupCommandHandlers (sanitized in caller)
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  // determine who sent the command
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  // Permission: only the session owner or the bot OWNER can delete this session
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or the bot owner can delete this session.' }, { quoted: msg });
    break;
  }

  try {
    // 1) Remove from Mongo
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);

    // 2) Remove temp session dir
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try {
      if (fs.existsSync(sessionPath)) {
        fs.removeSync(sessionPath);
        console.log(`Removed session folder: ${sessionPath}`);
      }
    } catch (e) {
      console.warn('Failed removing session folder:', e);
    }

    // 3) Try to logout & close socket
    try {
      if (typeof socket.logout === 'function') {
        await socket.logout().catch(err => console.warn('logout error (ignored):', err?.message || err));
      }
    } catch (e) { console.warn('socket.logout failed:', e?.message || e); }
    try { socket.ws?.close(); } catch (e) { console.warn('ws close failed:', e?.message || e); }

    // 4) Remove from runtime maps
    activeSockets.delete(sanitized);
    socketCreationTime.delete(sanitized);

    // 5) notify user
    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption: formatMessage('🗑️ SESSION DELETED', '✅ Your session has been successfully deleted from MongoDB and local storage.', BOT_NAME_FANCY)
    }, { quoted: msg });

    console.log(`Session ${sanitized} deleted by ${senderNum}`);
  } catch (err) {
    console.error('deleteme command error:', err);
    await socket.sendMessage(sender, { text: `❌ Failed to delete session: ${err.message || err}` }, { quoted: msg });
  }
  break;
}
case 'deletemenumber': {
  // args is available in the handler (body split). Expect args[0] = target number
  const targetRaw = (args && args[0]) ? args[0].trim() : '';
  if (!targetRaw) {
    await socket.sendMessage(sender, { text: '❗ Usage: .deletemenumber <number>\nExample: .deletemenumber 9478#######' }, { quoted: msg });
    break;
  }

  const target = targetRaw.replace(/[^0-9]/g, '');
  if (!/^\\d{6,}$/.test(target)) {
    await socket.sendMessage(sender, { text: '❗ Invalid number provided.' }, { quoted: msg });
    break;
  }

  // Permission check: only OWNER or configured admins can run this
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  let allowed = false;
  if (senderNum === ownerNum) allowed = true;
  else {
    try {
      const adminList = await loadAdminsFromMongo();
      if (Array.isArray(adminList) && adminList.some(a => a.replace(/[^0-9]/g,'') === senderNum || a === senderNum || a === `${senderNum}@s.whatsapp.net`)) {
        allowed = true;
      }
    } catch (e) {
      console.warn('Failed checking admin list', e);
    }
  }

  if (!allowed) {
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only bot owner or admins can delete other sessions.' }, { quoted: msg });
    break;
  }

  try {
    // notify start
    await socket.sendMessage(sender, { text: `🗑️ Deleting session for ${target} — attempting now...` }, { quoted: msg });

    // 1) If active, try to logout + close
    const runningSocket = activeSockets.get(target);
    if (runningSocket) {
      try {
        if (typeof runningSocket.logout === 'function') {
          await runningSocket.logout().catch(e => console.warn('logout error (ignored):', e?.message || e));
        }
      } catch (e) { console.warn('Error during logout:', e); }
      try { runningSocket.ws?.close(); } catch (e) { console.warn('ws close error:', e); }
      activeSockets.delete(target);
      socketCreationTime.delete(target);
    }

    // 2) Remove from Mongo (sessions + numbers)
    await removeSessionFromMongo(target);
    await removeNumberFromMongo(target);

    // 3) Remove temp session dir if exists
    const tmpSessionPath = path.join(os.tmpdir(), `session_${target}`);
    try {
      if (fs.existsSync(tmpSessionPath)) {
        fs.removeSync(tmpSessionPath);
        console.log(`Removed temp session folder: ${tmpSessionPath}`);
      }
    } catch (e) {
      console.warn('Failed removing tmp session folder:', e);
    }

    // 4) Confirm to caller & notify owner
    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption: formatMessage('🗑️ SESSION REMOVED', `✅ Session for number *${target}* has been deleted from MongoDB and runtime.`, BOT_NAME_FANCY)
    }, { quoted: msg });

    // optional: inform owner
    try {
      const ownerJid = `${ownerNum}@s.whatsapp.net`;
      await socket.sendMessage(ownerJid, {
        text: `👑 Notice: Session removed by ${senderNum}\n→ Number: ${target}\n→ Time: ${getSriLankaTimestamp()}`
      });
    } catch (e) { /* ignore notification errors */ }

    console.log(`deletemenumber: removed ${target} (requested by ${senderNum})`);
  } catch (err) {
    console.error('deletemenumber error:', err);
    await socket.sendMessage(sender, { text: `❌ Failed to delete session for ${target}: ${err.message || err}` }, { quoted: msg });
  }

  break;
}





case 'cfn': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const full = body.slice(config.PREFIX.length + command.length).trim();
  if (!full) {
    await socket.sendMessage(sender, { text: `❗ Provide input: .cfn <jid@newsletter> | emoji1,emoji2\nExample: .cfn 120363402094635383@newsletter | 🔥,❤️` }, { quoted: msg });
    break;
  }

  const admins = await loadAdminsFromMongo();
  const normalizedAdmins = (admins || []).map(a => (a || '').toString());
  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
  const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);
  if (!(isOwner || isAdmin)) {
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only owner or configured admins can add follow channels.' }, { quoted: msg });
    break;
  }

  let jidPart = full;
  let emojisPart = '';
  if (full.includes('|')) {
    const split = full.split('|');
    jidPart = split[0].trim();
    emojisPart = split.slice(1).join('|').trim();
  } else {
    const parts = full.split(/\s+/);
    if (parts.length > 1 && parts[0].includes('@newsletter')) {
      jidPart = parts.shift().trim();
      emojisPart = parts.join(' ').trim();
    } else {
      jidPart = full.trim();
      emojisPart = '';
    }
  }

  const jid = jidPart;
  if (!jid || !jid.endsWith('@newsletter')) {
    await socket.sendMessage(sender, { text: '❗ Invalid JID. Example: 120363402094635383@newsletter' }, { quoted: msg });
    break;
  }

  let emojis = [];
  if (emojisPart) {
    emojis = emojisPart.includes(',') ? emojisPart.split(',').map(e => e.trim()) : emojisPart.split(/\s+/).map(e => e.trim());
    if (emojis.length > 20) emojis = emojis.slice(0, 20);
  }

  try {
    if (typeof socket.newsletterFollow === 'function') {
      await socket.newsletterFollow(jid);
    }

    await addNewsletterToMongo(jid, emojis);

    const emojiText = emojis.length ? emojis.join(' ') : '(default set)';

    // Meta mention for botName
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CFN" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: `✅ Channel followed and saved!\n\nJID: ${jid}\nEmojis: ${emojiText}\nSaved by: @${senderIdSimple}`,
      footer: `📌 ${botName} FOLLOW CHANNEL`,
      mentions: [nowsender], // user mention
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 }],
      headerType: 4
    }, { quoted: metaQuote }); // <-- botName meta mention

  } catch (e) {
    console.error('cfn error', e);
    await socket.sendMessage(sender, { text: `❌ Failed to save/follow channel: ${e.message || e}` }, { quoted: msg });
  }
  break;
}

case 'chr': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');

  const q = body.split(' ').slice(1).join(' ').trim();
  if (!q.includes(',')) return await socket.sendMessage(sender, { text: "❌ Usage: chr <channelJid/messageId>,<emoji>" }, { quoted: msg });

  const parts = q.split(',');
  let channelRef = parts[0].trim();
  const reactEmoji = parts[1].trim();

  let channelJid = channelRef;
  let messageId = null;
  const maybeParts = channelRef.split('/');
  if (maybeParts.length >= 2) {
    messageId = maybeParts[maybeParts.length - 1];
    channelJid = maybeParts[maybeParts.length - 2].includes('@newsletter') ? maybeParts[maybeParts.length - 2] : channelJid;
  }

  if (!channelJid.endsWith('@newsletter')) {
    if (/^\d+$/.test(channelJid)) channelJid = `${channelJid}@newsletter`;
  }

  if (!channelJid.endsWith('@newsletter') || !messageId) {
    return await socket.sendMessage(sender, { text: '❌ Provide channelJid/messageId format.' }, { quoted: msg });
  }

  try {
    await socket.newsletterReactMessage(channelJid, messageId.toString(), reactEmoji);
    await saveNewsletterReaction(channelJid, messageId.toString(), reactEmoji, sanitized);

    // BotName meta mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHR" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: `✅ Reacted successfully!\n\nChannel: ${channelJid}\nMessage: ${messageId}\nEmoji: ${reactEmoji}\nBy: @${senderIdSimple}`,
      footer: `📌 ${botName} REACTION`,
      mentions: [nowsender], // user mention
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 }],
      headerType: 4
    }, { quoted: metaQuote }); // <-- botName meta mention

  } catch (e) {
    console.error('chr command error', e);
    await socket.sendMessage(sender, { text: `❌ Failed to react: ${e.message || e}` }, { quoted: msg });
  }
  break;
}
case 'apkdownload':
case 'apk': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const id = text.split(" ")[1]; // .apk <package_id>
        const myPhoto = "https://i.postimg.cc/gjkQy2Kd/images-(9).jpg"; 

        // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
        const lordMeta = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: `BR_APK_DL_${Date.now()}`
            },
            message: {
                contactMessage: {
                    displayName: "LORD INDUMINA 💉",
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD`
                }
            }
        };

        if (!id) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please provide an APK package ID.*\n\nExample: `.apk com.whatsapp`'
            }, { quoted: lordMeta });
        }

        // Reaction & Notify start
        await socket.sendMessage(sender, { react: { text: "📥", key: msg.key } });
        const loadMsg = await socket.sendMessage(sender, { text: '💉 *Bloody Rose is fetching your APK...*' }, { quoted: lordMeta });

        // 🔹 Call API (Fixed URL)
        const apiUrl = `https://saviya-kolla-api.koyeb.app/download/apk?id=${encodeURIComponent(id)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.success || !data.result) {
            return await socket.sendMessage(sender, { text: '*❌ Failed to fetch APK info. Please check the ID.*' }, { edit: loadMsg.key });
        }

        const result = data.result;

        // 🔹 BLOODY ROSE LUXURY CAPTION
        let caption = `✨ *B L O O D Y  R O S E  A P K* ✨\n\n`;
        caption += `📱 *APP NAME:* ${result.name}\n`;
        caption += `🆔 *PACKAGE:* ${result.package}\n`;
        caption += `📦 *SIZE:* ${result.size}\n`;
        caption += `🕒 *UPDATE:* ${result.lastUpdate}\n\n`;
        caption += `──────────────────────\n`;
        caption += `> *DOWNLOADED BY BLOODY ROSE V4 💉🩸*`;

        // Delete loading message
        await socket.sendMessage(sender, { delete: loadMsg.key });

        // 🔹 Send APK as Document with Large Thumbnail
        await socket.sendMessage(sender, {
            document: { url: result.dl_link },
            fileName: `${result.name}.apk`,
            mimetype: 'application/vnd.android.package-archive',
            caption: caption,
            contextInfo: {
                externalAdReply: {
                    title: result.name,
                    body: "Bloody Rose APK Downloader",
                    thumbnailUrl: result.image || myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ලොකු Thumbnail එක
                    sourceUrl: "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: lordMeta });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (err) {
        console.error("Error in APK download:", err);
        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: msg });
    }
    break;
}
case 'xv':
case 'xvsearch':
case 'xvdl': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const query = text.split(" ").slice(1).join(" ").trim();
        const myPhoto = "https://i.postimg.cc/gjkQy2Kd/images-(9).jpg"; 

        // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
        const lordMeta = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: `BR_XV_SEARCH_${Date.now()}`
            },
            message: {
                contactMessage: {
                    displayName: "LORD INDUMINA 💉",
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD`
                }
            }
        };

        if (!query) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please provide a search query.*\n\nExample: `.xv mia`'
            }, { quoted: lordMeta });
        }

        // Reaction & Notify
        await socket.sendMessage(sender, { react: { text: "🔍", key: msg.key } });
        const loadMsg = await socket.sendMessage(sender, { text: '💉 *Bloody Rose is searching for you...*' }, { quoted: lordMeta });

        // 🔹 Search API
        const searchUrl = `https://tharuzz-ofc-api-v2.vercel.app/api/search/xvsearch?query=${encodeURIComponent(query)}`;
        const { data } = await axios.get(searchUrl);

        if (!data.success || !data.result?.xvideos?.length) {
            return await socket.sendMessage(sender, { text: '*❌ No results found.*' }, { edit: loadMsg.key });
        }

        // 🔹 Show top 10 results
        const results = data.result.xvideos.slice(0, 10);
        let listMessage = `✨ *B L O O D Y  R O S E  X V  S E A R C H* ✨\n\n`;
        listMessage += `🔍 *Results for:* ${query.toUpperCase()}\n\n`;
        
        results.forEach((item, idx) => {
            listMessage += `*${idx + 1}.* ${item.title}\n🕒 ${item.info}\n\n`;
        });
        
        listMessage += `──────────────────────\n`;
        listMessage += `> *REPLY WITH THE NUMBER TO DOWNLOAD* 💉`;

        // Delete loading and send result list
        await socket.sendMessage(sender, { delete: loadMsg.key });

        await socket.sendMessage(sender, {
            text: listMessage,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    sourceUrl: "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: lordMeta });

        // 🔹 Store search results in cache for selection
        global.xvReplyCache = global.xvReplyCache || {};
        global.xvReplyCache[sender] = results.map(r => r.link);

    } catch (err) {
        console.error("Error in XV search:", err);
        await socket.sendMessage(sender, { text: '*❌ System Error.*' }, { quoted: msg });
    }
}
break;

case 'දාපන්':
case 'ඔන':
case 'save': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) {
      return await socket.sendMessage(sender, { text: '*❌ Please reply to a message (status/media) to save it.*' }, { quoted: msg });
    }

    try { await socket.sendMessage(sender, { react: { text: '💾', key: msg.key } }); } catch(e){}

    // 🟢 Instead of bot’s own chat, use same chat (sender)
    const saveChat = sender;

    if (quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.audioMessage || quotedMsg.documentMessage || quotedMsg.stickerMessage) {
      const media = await downloadQuotedMedia(quotedMsg);
      if (!media || !media.buffer) {
        return await socket.sendMessage(sender, { text: '❌ Failed to download media.' }, { quoted: msg });
      }

      if (quotedMsg.imageMessage) {
        await socket.sendMessage(saveChat, { image: media.buffer, caption: media.caption || '✅ Status Saved' });
      } else if (quotedMsg.videoMessage) {
        await socket.sendMessage(saveChat, { video: media.buffer, caption: media.caption || '✅ Status Saved', mimetype: media.mime || 'video/mp4' });
      } else if (quotedMsg.audioMessage) {
        await socket.sendMessage(saveChat, { audio: media.buffer, mimetype: media.mime || 'audio/mp4', ptt: media.ptt || false });
      } else if (quotedMsg.documentMessage) {
        const fname = media.fileName || `saved_document.${(await FileType.fromBuffer(media.buffer))?.ext || 'bin'}`;
        await socket.sendMessage(saveChat, { document: media.buffer, fileName: fname, mimetype: media.mime || 'application/octet-stream' });
      } else if (quotedMsg.stickerMessage) {
        await socket.sendMessage(saveChat, { image: media.buffer, caption: media.caption || '✅ Sticker Saved' });
      }

      await socket.sendMessage(sender, { text: '🔥 *Status saved successfully!*' }, { quoted: msg });

    } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage) {
      const text = quotedMsg.conversation || quotedMsg.extendedTextMessage.text;
      await socket.sendMessage(saveChat, { text: `✅ *Status Saved*\n\n${text}` });
      await socket.sendMessage(sender, { text: '🔥 *Text status saved successfully!*' }, { quoted: msg });
    } else {
      if (typeof socket.copyNForward === 'function') {
        try {
          const key = msg.message?.extendedTextMessage?.contextInfo?.stanzaId || msg.key;
          await socket.copyNForward(saveChat, msg.key, true);
          await socket.sendMessage(sender, { text: '🔥 *Saved (forwarded) successfully!*' }, { quoted: msg });
        } catch (e) {
          await socket.sendMessage(sender, { text: '❌ Could not forward the quoted message.' }, { quoted: msg });
        }
      } else {
        await socket.sendMessage(sender, { text: '❌ Unsupported quoted message type.' }, { quoted: msg });
      }
    }

  } catch (error) {
    console.error('❌ Save error:', error);
    await socket.sendMessage(sender, { text: '*❌ Failed to save status*' }, { quoted: msg });
  }
  break;
}
case 'alive': {
    try {
        const myPhoto = "https://i.postimg.cc/gjkQy2Kd/images-(9).jpg"; 
        const ownerName = "LORD INDUMINA";

        // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
        const lordMeta = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: `BR_ALIVE_${Date.now()}` 
            },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        // 1. Reaction
        await socket.sendMessage(sender, { react: { text: "💉", key: msg.key } });

        // 2. Loading Animation
        let { key } = await socket.sendMessage(sender, { text: "🌹 *Bloody Rose System Loading...*" }, { quoted: lordMeta });

        const loadingBars = [
            "🌹 [▒▒▒▒▒▒▒▒▒▒] 0%",
            "🌹 [███▒▒▒▒▒▒▒] 40%",
            "🌹 [██████▒▒▒▒] 70%",
            "🌹 [██████████] 100%",
            "⚡ *System Injected Successfully!*"
        ];

        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 400));
            await socket.sendMessage(sender, { text: bar, edit: key });
        }
        await socket.sendMessage(sender, { delete: key });

        // 3. Send Random Video Note (PTV)
        const videoFiles = ['./alive1.mp4', './alive2.mp4', './alive3.mp4'];
        const fs = require('fs');
        const availableVideos = videoFiles.filter(v => fs.existsSync(v));
        
        if (availableVideos.length > 0) {
            const randomVideo = availableVideos[Math.floor(Math.random() * availableVideos.length)];
            await socket.sendMessage(sender, { 
                video: fs.readFileSync(randomVideo), 
                mimetype: 'video/mp4', 
                ptv: true 
            });
        }

        // 4. Final Message with Buttons & Large Thumbnail
        const finalMsg = `✨ *B L O O D Y  R O S E  S U P R E M E* ✨\n\n` +
            `🌹 *Status:* Online & Active\n` +
            `👤 *Owner:* ${ownerName}\n` +
            `⚙️ *Engine:* v${require('@whiskeysockets/baileys/package.json').version}\n\n` +
            `──────────────────────\n` +
            `> "The only way to escape the maze is to destroy it." 💉🩸`;

        const buttons = [
            { buttonId: `.menu`, buttonText: { displayText: "📋 MENU" }, type: 1 },
            { buttonId: `.ping`, buttonText: { displayText: "⚡ PING" }, type: 1 }
        ];

        await socket.sendMessage(sender, { 
            image: { url: myPhoto },
            caption: finalMsg,
            footer: `🔥 BLOODY ROSE V4 🔥`,
            buttons: buttons,
            headerType: 4,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // Title/Body නැතිව ලොකු Thumbnail එක විතරයි
                    sourceUrl: "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: lordMeta });

    } catch (e) {
        console.error('Alive Error:', e);
    }
    break;
}
// ---------------------- PING ----------------------
case 'ping': {
    try {
        const from = sender;
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

        // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
        const lordMeta = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: `BR_PING_${Date.now()}` 
            },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        // 1. Reaction
        await socket.sendMessage(from, { react: { text: "⚡", key: msg.key } });

        // 2. Loading Animation
        let { key } = await socket.sendMessage(from, { text: "🌹 *B L O O D Y  R O S E  P I N G*" }, { quoted: lordMeta });
        
        const pings = [
            "🌹 *S Y S T E M  C H E C K . . .* 📶",
            "🌹 *D A T A  S C A N N I N G . . .* 🚀",
            "🌹 *P I N G  C O M P L E T E D !* ✨"
        ];

        const start = Date.now();
        for (let p of pings) {
            await new Promise(res => setTimeout(res, 400));
            await socket.sendMessage(from, { text: p, edit: key });
        }
        const end = Date.now();
        const pingTime = end - start;

        // 3. සැකසූ අවසාන මැසේජ් එක
        const pingMsg = `✨ *B L O O D Y  R O S E  P I N G* ✨\n\n` +
            `┌──────────────┈\n` +
            `│ ⚡ *LATENCY:* ${pingTime}ms\n` +
            `│ 💠 *STATUS:* Excellence\n` +
            `│ 🚀 *SPEED:* Blazing Fast\n` +
            `└──────────────┈\n\n` +
            `> *POWERED BY LORD INDUMINA 💉🩸*`;

        // 4. Loading එක මකා Buttons & Large Thumbnail සමඟ යැවීම
        await socket.sendMessage(from, { delete: key });

        // 🔹 මෙන්න මෙතන තමයි බොත්තම් දෙක තියෙන්නේ
        const buttons = [
            { buttonId: `.menu`, buttonText: { displayText: "📋 MENU" }, type: 1 },
            { buttonId: `.alive`, buttonText: { displayText: "🤖 ALIVE" }, type: 1 }
        ];

        await socket.sendMessage(from, { 
            image: { url: myPhoto }, 
            caption: pingMsg,
            footer: `🔥 BLOODY ROSE V4 🔥`,
            buttons: buttons, // Buttons Array එක මෙතනට පාස් වෙනවා
            headerType: 4,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ලොකු Thumbnail එක විතරයි (No Title/Body)
                    sourceUrl: "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: lordMeta });

    } catch (error) {
        console.error("Ping Error:", error);
    }
    break;
}
case 'activesessions':
case 'active':
case 'bots': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    // Permission check - only owner and admins can use this
    const admins = await loadAdminsFromMongo();
    const normalizedAdmins = (admins || []).map(a => (a || '').toString());
    const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
    const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);

    if (!isOwner && !isAdmin) {
      await socket.sendMessage(sender, { 
        text: '❌ Permission denied. Only bot owner or admins can check active sessions.' 
      }, { quoted: msg });
      break;
    }

    const activeCount = activeSockets.size;
    const activeNumbers = Array.from(activeSockets.keys());

    // Meta AI mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ACTIVESESSIONS" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let text = `🤖 *ACTIVE SESSIONS - ${botName}*\n\n`;
    text += `📊 *Total Active Sessions:* ${activeCount}\n\n`;

    if (activeCount > 0) {
      text += `📱 *Active Numbers:*\n`;
      activeNumbers.forEach((num, index) => {
        text += `${index + 1}. ${num}\n`;
      });
    } else {
      text += `⚠️ No active sessions found.`;
    }

    text += `\n🕒 Checked at: ${getSriLankaTimestamp()}`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `📊 ${botName} SESSION STATUS`,
      buttons: [
        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 },
        { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "⚡ PING" }, type: 1 }
      ],
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('activesessions error', e);
    await socket.sendMessage(sender, { 
      text: '❌ Failed to fetch active sessions information.' 
    }, { quoted: msg });
  }
  break;
}
case 'song': {
    const axios = require('axios');
    const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

    // Extract YT video id & normalize link
    function extractYouTubeId(url) {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }
    function convertYouTubeLink(input) {
        const videoId = extractYouTubeId(input);
        if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
        return input;
    }

    const q = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';

    // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
    const lordMeta = {
        key: { 
            remoteJid: "status@broadcast", 
            participant: "0@s.whatsapp.net", 
            fromMe: false, 
            id: `BR_SONG_${Date.now()}` 
        },
        message: { 
            contactMessage: { 
                displayName: "LORD INDUMINA 💉", 
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
            } 
        }
    };

    if (!q || q.trim() === '') {
        await socket.sendMessage(sender, { text: '💉 *Please provide a song name or YouTube link!*' }, { quoted: lordMeta });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🔎', key: msg.key } });

        let videoUrl = null;
        const maybeLink = convertYouTubeLink(q.trim());
        if (extractYouTubeId(q.trim())) {
            videoUrl = maybeLink;
        } else {
            const searchUrl = `https://movanest.zone.id/v2/ytsearch?query=${encodeURIComponent(q.trim())}`;
            const searchRes = await axios.get(searchUrl, { timeout: 15000 }).then(r => r.data).catch(e => null);
            if (!searchRes || !searchRes.status) {
                await socket.sendMessage(sender, { text: '*❌ Search API error!*' }, { quoted: lordMeta });
                break;
            }
            const videos = (searchRes.results || []).filter(r => r.type === 'video');
            const first = videos[0];
            if (!first) {
                await socket.sendMessage(sender, { text: '*❌ No results found!*' }, { quoted: lordMeta });
                break;
            }
            videoUrl = first.url;
        }

        const apiUrl = `https://movanest.zone.id/v2/ytmp3?url=${encodeURIComponent(videoUrl)}`;
        const apiRes = await axios.get(apiUrl, { timeout: 15000 }).then(r => r.data).catch(e => null);
        
        if (!apiRes || !apiRes.status || !apiRes.results?.download?.url) {
            await socket.sendMessage(sender, { text: '*❌ API Error or link not found!*' }, { quoted: lordMeta });
            break;
        }

        const { download, metadata } = apiRes.results;
        const downloadUrl = download.url;
        const title = metadata.title || 'Unknown Song';
        const thumb = metadata.thumbnail || myPhoto;

        // 🔹 BLOODY ROSE LUXURY CAPTION
        let caption = `✨ *B L O O D Y  R O S E  S O N G* ✨\n\n`;
        caption += `🎵 *TITLE:* ${title}\n`;
        caption += `⏱️ *DURATION:* ${metadata.timestamp || 'N/A'}\n`;
        caption += `🔊 *QUALITY:* ${download.quality || '128kbps'}\n\n`;
        caption += `*REPLY WITH A NUMBER:* \n`;
        caption += `1️⃣. 📄 MP3 as Document\n`;
        caption += `2️⃣. 🎧 MP3 as Audio\n`;
        caption += `3️⃣. 🎙 MP3 as Voice Note\n\n`;
        caption += `──────────────────────\n`;
        caption += `> *POWERED BY BLOODY ROSE V4 💉🩸*`;

        const resMsg = await socket.sendMessage(sender, {
            image: { url: thumb },
            caption: caption,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ලොකු Photo එක විතරයි
                    sourceUrl: videoUrl
                }
            }
        }, { quoted: lordMeta });

        // Handler for choices
        const handler = async (msgUpdate) => {
            try {
                const received = msgUpdate.messages && msgUpdate.messages[0];
                if (!received || received.key.remoteJid !== sender) return;
                
                const text = received.message?.conversation || received.message?.extendedTextMessage?.text;
                if (!text) return;

                const quotedId = received.message?.extendedTextMessage?.contextInfo?.stanzaId;
                if (quotedId !== resMsg.key.id) return;

                const choice = text.trim();
                await socket.sendMessage(sender, { react: { text: "📥", key: received.key } });

                const audioOptions = {
                    "1": { document: { url: downloadUrl }, mimetype: "audio/mpeg", fileName: `${title}.mp3` },
                    "2": { audio: { url: downloadUrl }, mimetype: "audio/mpeg" },
                    "3": { audio: { url: downloadUrl }, mimetype: "audio/mpeg", ptt: true }
                };

                if (audioOptions[choice]) {
                    await socket.sendMessage(sender, audioOptions[choice], { quoted: received });
                    socket.ev.off('messages.upsert', handler);
                }
            } catch (err) {
                console.error("Song choice error:", err);
            }
        };

        socket.ev.on('messages.upsert', handler);
        setTimeout(() => socket.ev.off('messages.upsert', handler), 60000);

    } catch (err) {
        console.error('Song case error:', err);
        await socket.sendMessage(sender, { text: "*❌ System Error!*" }, { quoted: lordMeta });
    }
    break;
}
case 'video': {
    const axios = require('axios');
    const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

    // Extract YT video id & normalize link
    function extractYouTubeId(url) {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }
    function convertYouTubeLink(input) {
        const videoId = extractYouTubeId(input);
        if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
        return input;
    }

    const q = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';

    // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
    const lordMeta = {
        key: { 
            remoteJid: "status@broadcast", 
            participant: "0@s.whatsapp.net", 
            fromMe: false, 
            id: `BR_VIDEO_${Date.now()}` 
        },
        message: { 
            contactMessage: { 
                displayName: "LORD INDUMINA 💉", 
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
            } 
        }
    };

    if (!q || q.trim() === '') {
        await socket.sendMessage(sender, { text: '💉 *Please provide a video name or YouTube link!*' }, { quoted: lordMeta });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🔎', key: msg.key } });

        let videoUrl = null;
        const maybeLink = convertYouTubeLink(q.trim());
        if (extractYouTubeId(q.trim())) {
            videoUrl = maybeLink;
        } else {
            const searchUrl = `https://movanest.zone.id/v2/ytsearch?query=${encodeURIComponent(q.trim())}`;
            const searchRes = await axios.get(searchUrl, { timeout: 30000 }).then(r => r.data).catch(e => null);
            if (!searchRes || !searchRes.status) {
                await socket.sendMessage(sender, { text: '*❌ Search API error!*' }, { quoted: lordMeta });
                break;
            }
            const videos = (searchRes.results || []).filter(r => r.type === 'video');
            const first = videos[0];
            if (!first) {
                await socket.sendMessage(sender, { text: '*❌ No results found!*' }, { quoted: lordMeta });
                break;
            }
            videoUrl = first.url;
        }

        const apiUrl = `https://movanest.zone.id/v2/ytmp4?url=${encodeURIComponent(videoUrl)}`;
        const apiRes = await axios.get(apiUrl, { timeout: 30000 }).then(r => r.data).catch(e => null);
        
        if (!apiRes || !apiRes.status || !apiRes.results?.download?.url) {
            await socket.sendMessage(sender, { text: '*❌ API Error or video not found!*' }, { quoted: lordMeta });
            break;
        }

        const { download, metadata } = apiRes.results;
        const downloadUrl = download.url;
        const title = metadata.title || 'Unknown Video';
        const thumb = metadata.thumbnail || myPhoto;

        // 🔹 BLOODY ROSE LUXURY CAPTION
        let caption = `✨ *B L O O D Y  R O S E  V I D E O* ✨\n\n`;
        caption += `▶️ *TITLE:* ${title}\n`;
        caption += `⏱️ *DURATION:* ${metadata.timestamp || 'N/A'}\n`;
        caption += `📺 *QUALITY:* ${download.quality || '360p'}\n\n`;
        caption += `*REPLY WITH A NUMBER:* \n`;
        caption += `1️⃣. 📄 MP4 as Document\n`;
        caption += `2️⃣. ▶️ MP4 as Video\n\n`;
        caption += `──────────────────────\n`;
        caption += `> *POWERED BY BLOODY ROSE V4 💉🩸*`;

        const resMsg = await socket.sendMessage(sender, {
            image: { url: thumb },
            caption: caption,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ලොකු Photo එක විතරයි
                    sourceUrl: videoUrl
                }
            }
        }, { quoted: lordMeta });

        // Handler for choices
        const handler = async (msgUpdate) => {
            try {
                const received = msgUpdate.messages && msgUpdate.messages[0];
                if (!received || received.key.remoteJid !== sender) return;
                
                const text = received.message?.conversation || received.message?.extendedTextMessage?.text;
                if (!text) return;

                const quotedId = received.message?.extendedTextMessage?.contextInfo?.stanzaId;
                if (quotedId !== resMsg.key.id) return;

                const choice = text.trim();
                await socket.sendMessage(sender, { react: { text: "📥", key: received.key } });

                if (choice === "1") {
                    await socket.sendMessage(sender, { 
                        document: { url: downloadUrl }, 
                        mimetype: "video/mp4", 
                        fileName: `${title}.mp4` 
                    }, { quoted: received });
                    socket.ev.off('messages.upsert', handler);
                } else if (choice === "2") {
                    await socket.sendMessage(sender, { 
                        video: { url: downloadUrl }, 
                        mimetype: "video/mp4" 
                    }, { quoted: received });
                    socket.ev.off('messages.upsert', handler);
                }
            } catch (err) {
                console.error("Video choice error:", err);
            }
        };

        socket.ev.on('messages.upsert', handler);
        setTimeout(() => socket.ev.off('messages.upsert', handler), 60000);

    } catch (err) {
        console.error('Video case error:', err);
        await socket.sendMessage(sender, { text: "*❌ System Error!*" }, { quoted: lordMeta });
    }
    break;
}
case 'fb':
case 'fbdl':
case 'facebook': {
    const axios = require('axios');
    const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

    // get message text
    const q = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';

    // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
    const lordMeta = {
        key: { 
            remoteJid: "status@broadcast", 
            participant: "0@s.whatsapp.net", 
            fromMe: false, 
            id: `BR_FB_${Date.now()}` 
        },
        message: { 
            contactMessage: { 
                displayName: "LORD INDUMINA 💉", 
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
            } 
        }
    };

    if (!q || q.trim() === '') {
        await socket.sendMessage(sender, { text: '💉 *Please provide a Facebook Video URL!*' }, { quoted: lordMeta });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🔎', key: msg.key } });

        // call fbdown API
        const apiUrl = `https://movanest.zone.id/v2/fbdown?url=${encodeURIComponent(q.trim())}`;
        const apiRes = await axios.get(apiUrl, { 
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        }).then(r => r.data).catch(e => null);

        if (!apiRes || !apiRes.status || !apiRes.results || !apiRes.results.length) {
            await socket.sendMessage(sender, { text: '*❌ FB API Error or link not found!*' }, { quoted: lordMeta });
            break;
        }

        const result = apiRes.results[0];
        if (!result.normalQualityLink) {
            await socket.sendMessage(sender, { text: '*❌ No download link available!*' }, { quoted: lordMeta });
            break;
        }

        // Normalize Data
        const title = result.title && result.title !== 'No video title' ? result.title : 'Facebook Video';
        const thumb = result.thumbnail || myPhoto;
        const normalUrl = result.normalQualityLink;
        const hdUrl = result.hdQualityLink;

        // 🔹 BLOODY ROSE LUXURY CAPTION
        let caption = `✨ *B L O O D Y  R O S E  F B  D L* ✨\n\n`;
        caption += `▶️ *TITLE:* ${title}\n`;
        caption += `⏱️ *DURATION:* ${result.duration || 'N/A'}\n`;
        caption += `📺 *QUALITY:* Normal / HD\n\n`;
        caption += `*REPLY WITH A NUMBER:* \n`;
        caption += `1️⃣. 📄 Normal (Document)\n`;
        caption += `2️⃣. ▶️ Normal (Video)\n`;
        caption += `3️⃣. 📄 HD Quality (Document)\n`;
        caption += `4️⃣. ▶️ HD Quality (Video)\n\n`;
        caption += `──────────────────────\n`;
        caption += `> *POWERED BY BLOODY ROSE V4 💉🩸*`;

        const resMsg = await socket.sendMessage(sender, {
            image: { url: thumb },
            caption: caption,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ලොකු Photo එක විතරයි
                    sourceUrl: q.trim()
                }
            }
        }, { quoted: lordMeta });

        // Handler for choices
        const handler = async (msgUpdate) => {
            try {
                const received = msgUpdate.messages && msgUpdate.messages[0];
                if (!received || received.key.remoteJid !== sender) return;
                
                const text = received.message?.conversation || received.message?.extendedTextMessage?.text;
                if (!text) return;

                const quotedId = received.message?.extendedTextMessage?.contextInfo?.stanzaId;
                if (quotedId !== resMsg.key.id) return;

                const choice = text.trim();
                await socket.sendMessage(sender, { react: { text: "📥", key: received.key } });

                let downloadUrl, filename;

                if (choice === "1" || choice === "2") {
                    downloadUrl = normalUrl;
                    filename = `${title}_Normal.mp4`;
                } else if (choice === "3" || choice === "4") {
                    if (!hdUrl) {
                        await socket.sendMessage(sender, { text: "⚠️ *HD not available for this video!*" }, { quoted: received });
                        return;
                    }
                    downloadUrl = hdUrl;
                    filename = `${title}_HD.mp4`;
                } else {
                    return;
                }

                if (choice === "1" || choice === "3") {
                    await socket.sendMessage(sender, { document: { url: downloadUrl }, mimetype: "video/mp4", fileName: filename }, { quoted: received });
                } else {
                    await socket.sendMessage(sender, { video: { url: downloadUrl }, mimetype: "video/mp4" }, { quoted: received });
                }

                socket.ev.off('messages.upsert', handler);
            } catch (err) {
                console.error("FB choice error:", err);
            }
        };

        socket.ev.on('messages.upsert', handler);
        setTimeout(() => socket.ev.off('messages.upsert', handler), 60000);

    } catch (err) {
        console.error('FB case error:', err);
        await socket.sendMessage(sender, { text: "*❌ System Error!*" }, { quoted: lordMeta });
    }
    break;
}
case 'instadl':
case 'insta':
case 'ig':
case 'instagram': {
    const axios = require('axios');
    const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

    // get message text
    const q = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';

    // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
    const lordMeta = {
        key: { 
            remoteJid: "status@broadcast", 
            participant: "0@s.whatsapp.net", 
            fromMe: false, 
            id: `BR_IG_${Date.now()}` 
        },
        message: { 
            contactMessage: { 
                displayName: "LORD INDUMINA 💉", 
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
            } 
        }
    };

    if (!q || q.trim() === '') {
        await socket.sendMessage(sender, { text: '💉 *Please provide an Instagram URL!*' }, { quoted: lordMeta });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🔎', key: msg.key } });

        // call instagram API
        const apiUrl = `https://movanest.zone.id/v2/instagram?url=${encodeURIComponent(q.trim())}`;
        const apiRes = await axios.get(apiUrl, { 
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        }).then(r => r.data).catch(e => null);

        if (!apiRes || !apiRes.status || !apiRes.results) {
            await socket.sendMessage(sender, { text: '*❌ IG API Error or Private Post!*' }, { quoted: lordMeta });
            break;
        }

        const result = apiRes.results;
        let isVideo = !!result.videoUrl || !!result.downloadUrl?.includes('.mp4');
        let downloadUrl = result.downloadUrl || result.videoUrl || result.imageUrl;
        let thumb = result.posterUrl || result.imageUrl || myPhoto;

        // 🔹 BLOODY ROSE LUXURY CAPTION
        let caption = `✨ *B L O O D Y  R O S E  I G  D L* ✨\n\n`;
        caption += `${isVideo ? '▶️' : '📸'} *TYPE:* ${isVideo ? 'Video/Reel' : 'Image'}\n`;
        caption += `📱 *QUALITY:* High Definition\n\n`;
        caption += `*REPLY WITH A NUMBER:* \n`;
        caption += `1️⃣. 📄 Document (File)\n`;
        caption += `2️⃣. ${isVideo ? '▶️ Video' : '🖼️ Image'} (Media)\n\n`;
        caption += `──────────────────────\n`;
        caption += `> *POWERED BY BLOODY ROSE V4 💉🩸*`;

        const resMsg = await socket.sendMessage(sender, {
            image: { url: thumb },
            caption: caption,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ලොකු Photo එක විතරයි
                    sourceUrl: q.trim()
                }
            }
        }, { quoted: lordMeta });

        // Handler for choices
        const handler = async (msgUpdate) => {
            try {
                const received = msgUpdate.messages && msgUpdate.messages[0];
                if (!received || received.key.remoteJid !== sender) return;
                
                const text = received.message?.conversation || received.message?.extendedTextMessage?.text;
                if (!text) return;

                const quotedId = received.message?.extendedTextMessage?.contextInfo?.stanzaId;
                if (quotedId !== resMsg.key.id) return;

                const choice = text.trim();
                await socket.sendMessage(sender, { react: { text: "📥", key: received.key } });

                if (choice === "1") {
                    await socket.sendMessage(sender, { 
                        document: { url: downloadUrl }, 
                        mimetype: isVideo ? "video/mp4" : "image/jpeg", 
                        fileName: isVideo ? `IG_Video.mp4` : `IG_Image.jpg` 
                    }, { quoted: received });
                    socket.ev.off('messages.upsert', handler);
                } else if (choice === "2") {
                    if (isVideo) {
                        await socket.sendMessage(sender, { video: { url: downloadUrl }, mimetype: "video/mp4" }, { quoted: received });
                    } else {
                        await socket.sendMessage(sender, { image: { url: downloadUrl }, mimetype: "image/jpeg" }, { quoted: received });
                    }
                    socket.ev.off('messages.upsert', handler);
                }
            } catch (err) {
                console.error("IG choice error:", err);
            }
        };

        socket.ev.on('messages.upsert', handler);
        setTimeout(() => socket.ev.off('messages.upsert', handler), 300000);

    } catch (err) {
        console.error('Instagram case error:', err);
        await socket.sendMessage(sender, { text: "*❌ System Error!*" }, { quoted: lordMeta });
    }
    break;
}
case 'url':
case 'img2url':
case 'tourl': {
    const fs = require('fs');
    const path = require('path');
    const FormData = require('form-data');
    const fetch = require('node-fetch');
    const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

    // get message text
    const qText = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        msg.message?.documentMessage?.caption ||
        msg.message?.audioMessage?.caption || '';

    // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
    const lordMeta = {
        key: { 
            remoteJid: "status@broadcast", 
            participant: "0@s.whatsapp.net", 
            fromMe: false, 
            id: `BR_URL_${Date.now()}` 
        },
        message: { 
            contactMessage: { 
                displayName: "LORD INDUMINA 💉", 
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
            } 
        }
    };

    try {
        const q = msg.quoted ? msg.quoted : msg;
        let mediaType = null;
        let mimetype = '';

        if (q.message) {
            const mediaKey = Object.keys(q.message).find(key => key.endsWith('Message'));
            if (mediaKey) {
                const mediaObj = q.message[mediaKey];
                if (mediaObj.mimetype) {
                    mediaType = mediaKey.replace('Message', '').toLowerCase();
                    mimetype = mediaObj.mimetype;
                }
            }
        }

        if (!mediaType || !mimetype) {
            await socket.sendMessage(sender, { text: '💉 *Please reply to an image, video, or any media file!*' }, { quoted: lordMeta });
            break;
        }

        await socket.sendMessage(sender, { react: { text: '⏳', key: msg.key } });

        // Download media buffer
        const buffer = await downloadMediaMessage(q, 'buffer', {});
        if (!buffer || buffer.length === 0) {
            await socket.sendMessage(sender, { text: '*❌ Failed to download media!*' }, { quoted: lordMeta });
            break;
        }

        // Calculate file size
        const fileSizeInBytes = buffer.length;
        const fileSizeInKB = (fileSizeInBytes / 1024).toFixed(2);
        const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
        const fileSize = fileSizeInMB >= 1 ? `${fileSizeInMB} MB` : `${fileSizeInKB} KB`;

        let ext = mimetype.split('/')[1] || 'bin';
        const form = new FormData();
        form.append('file', buffer, `file.${ext}`);

        const res = await fetch('https://movanest.zone.id/upload', {
            method: 'POST',
            body: form
        });

        if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);

        const result = await res.json();
        const downloadUrl = result.url || result.downloadUrl || result.link;

        if (!downloadUrl) throw new Error('No URL returned from upload');

        // 🔹 BLOODY ROSE LUXURY CAPTION
        let resultText = `✨ *B L O O D Y  R O S E  U P L O A D E R* ✨\n\n`;
        resultText += `📎 *FILE TYPE:* ${mediaType.toUpperCase()}\n`;
        resultText += `📦 *FILE SIZE:* ${fileSize}\n`;
        resultText += `🌐 *URL:* ${downloadUrl}\n\n`;
        resultText += `──────────────────────\n`;
        resultText += `> *POWERED BY LORD INDUMINA 💉🩸*`;

        await socket.sendMessage(sender, { 
            text: resultText,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ලොකු Photo එක විතරයි
                    sourceUrl: downloadUrl
                }
            }
        }, { quoted: lordMeta });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('ToURL error:', err);
        await socket.sendMessage(sender, { text: `*❌ Error: ${err.message}*` }, { quoted: lordMeta });
    }
    break;
}

case 'menu':
case 'help':
case 'list': {
    const from = m.key.remoteJid;
    const pushname = m.pushName || "User";
    const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';
    const prefix = config.PREFIX || '.';

    try {
        // 1. Reaction
        await socket.sendMessage(from, { react: { text: "🌹", key: m.key } });

        // 2. Loading Animation
        let { key } = await socket.sendMessage(from, { text: "🌹 *BLOODY ROSE: SYSTEM INITIALIZING...*" });
        
        const loadingBars = [
            "🌹 [▒▒▒▒▒▒▒▒▒▒] 10%",
            "🌹 [███▒▒▒▒▒▒▒] 40%",
            "🌹 [██████▒▒▒▒] 70%",
            "🌹 [██████████] 100%",
            "✨ *SUPREME MENU READY MASTER!*"
        ];

        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 300));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        // ලෝඩින් එක මකා දැමීම
        await socket.sendMessage(from, { delete: key });

        // 3. මෙනු එකේ පෙළ (Help Text)
        const helpText = `👋 *Greetings, ${pushname}*

✨ *B L O O D Y  R O S E  S U P R E M E* ✨

┌──────────────┈
│ 👑 *OWNER:* LORD INDUMINA
│ 🚀 *VERSION:* 4.0.0 (Elite)
│ 💠 *PREFIX:* ${prefix}
└──────────────┈

🌹 *S Y S T E M  F E A T U R E S*
✨ Fast • Simple • Powerful 💉
📥 Media Downloader
🎨 Creative Tools
🔧 Smart Utilities

> *Created by Lord Indumina 🩸*`;

        // 4. Buttons ටික සකස් කිරීම
        const buttons = [
            { buttonId: `${prefix}download`, buttonText: { displayText: "📥 DOWNLOAD" }, type: 1 },
            { buttonId: `${prefix}creative`, buttonText: { displayText: "🎨 CREATIVE" }, type: 1 },
            { buttonId: `${prefix}tools`, buttonText: { displayText: "🔧 TOOLS" }, type: 1 },
            { buttonId: `${prefix}settings`, buttonText: { displayText: "⚙️ SETTINGS" }, type: 1 },
            { buttonId: `${prefix}owner`, buttonText: { displayText: "👑 OWNER" }, type: 1 }
        ];

        // 5. මෙනු එක යැවීම
        await socket.sendMessage(from, { 
            image: { url: myPhoto }, 
            caption: helpText,
            footer: "🔥 BLOODY ROSE ELITE EDITION 🔥",
            buttons: buttons,
            headerType: 4,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    sourceUrl: "https://github.com/Indumina-Lord",
                    title: "", 
                    body: ""
                }
            }
        }, { quoted: m });

    } catch (e) {
        console.error("Menu Error: ", e);
        await socket.sendMessage(from, { text: "❌ මෙනු එක සකස් කිරීමේදී දෝෂයක් සිදුවිය!" }, { quoted: m });
    }
}
break;
// ==================== DOWNLOAD MENU ====================
case 'download': {
    try { 
        await socket.sendMessage(sender, { react: { text: "📥", key: msg.key } }); 
    } catch(e){}

    try {
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';
        const botTitle = 'BLOODY ROSE DOWNLOADS 📥';

        // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
        const lordMeta = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: `BR_DL_MENU_${Date.now()}` 
            },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        const dlText = `✨ *B L O O D Y  R O S E  D O W N L O A D S* ✨

🎵 *AUDIO DOWNLOADS*
🌹 ${config.PREFIX}song [query]
🌹 ${config.PREFIX}csong [jid] [query]
🌹 ${config.PREFIX}ringtone [name]

🎬 *VIDEO DOWNLOADS*
🌹 ${config.PREFIX}tiktok [url]
🌹 ${config.PREFIX}video [query]
🌹 ${config.PREFIX}fb [url]
🌹 ${config.PREFIX}ig [url]
🌹 ${config.PREFIX}xvideo [query]
🌹 ${config.PREFIX}xnxx [query]

📱 *APP & FILE DOWNLOADS*
🌹 ${config.PREFIX}apk [app name]
🌹 ${config.PREFIX}mediafire [url]
🌹 ${config.PREFIX}gdrive [url]

> *POWERED BY LORD INDUMINA 💉🩸*`;

        const buttons = [
            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "🔙 MAIN MENU" }, type: 1 },
            { buttonId: `${config.PREFIX}creative`, buttonText: { displayText: "🎨 CREATIVE" }, type: 1 }
        ];

        await socket.sendMessage(sender, {
            image: { url: myPhoto }, // පින්තූරය සමඟ යැවීම
            caption: dlText,
            footer: "📥 BLOODY ROSE DOWNLOAD CENTER",
            buttons: buttons,
            headerType: 4,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ලොකු Thumbnail එක විතරයි
                    sourceUrl: "https://github.com/Indumina-Lord",
                    title: "", // හිස්ව තැබීමෙන් පිරිසිදු පෙනුමක් ලැබේ
                    body: ""
                }
            }
        }, { quoted: lordMeta });

    } catch (err) {
        console.error('Download menu error:', err);
        try { await socket.sendMessage(sender, { text: '❌ Failed to show download menu.' }, { quoted: msg }); } catch(e){}
    }
    break;
}

// ==================== CREATIVE MENU ====================
case 'creative': {
    try { 
        await socket.sendMessage(sender, { react: { text: "🎨", key: msg.key } }); 
    } catch(e){}

    try {
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';
        const botTitle = 'BLOODY ROSE CREATIVE 🎨';

        // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
        const lordMeta = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: `BR_CREATIVE_MENU_${Date.now()}` 
            },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        const creativeText = `✨ *B L O O D Y  R O S E  C R E A T I V E* ✨

🤖 *AI INTELLIGENCE*
🌹 ${config.PREFIX}ai [message]
🌹 ${config.PREFIX}aiimg [prompt]
🌹 ${config.PREFIX}aiimg2 [prompt]

✍️ *TEXT & STYLING*
🌹 ${config.PREFIX}font [text]
🌹 ${config.PREFIX}sticker (reply img)

🖼️ *IMAGE & UTILS*
🌹 ${config.PREFIX}getdp [number]
🌹 ${config.PREFIX}url (reply media)

💾 *MEDIA SAVER*
🌹 ${config.PREFIX}save (reply status)

> *POWERED BY LORD INDUMINA 💉🩸*`;

        const buttons = [
            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "🔙 MAIN MENU" }, type: 1 },
            { buttonId: `${config.PREFIX}download`, buttonText: { displayText: "📥 DOWNLOAD" }, type: 1 }
        ];

        await socket.sendMessage(sender, {
            image: { url: myPhoto }, // පින්තූරය සමඟ යැවීම
            caption: creativeText,
            footer: "🎨 BLOODY ROSE CREATIVE HUB",
            buttons: buttons,
            headerType: 4,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ලොකු Thumbnail එක විතරයි
                    sourceUrl: "https://github.com/Indumina-Lord",
                    title: "", 
                    body: ""
                }
            }
        }, { quoted: lordMeta });

    } catch (err) {
        console.error('Creative menu error:', err);
        try { await socket.sendMessage(sender, { text: '❌ Failed to show creative menu.' }, { quoted: msg }); } catch(e){}
    }
    break;
}
// ==================== TOOLS MENU ====================
case 'tools': {
    try { 
        await socket.sendMessage(sender, { react: { text: "🔧", key: msg.key } }); 
    } catch(e){}

    try {
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';
        
        // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
        const lordMeta = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: `BR_TOOLS_MENU_${Date.now()}` 
            },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        const toolsText = `✨ *B L O O D Y  R O S E  T O O L S* ✨

⚙️ *SYSTEM & INFO*
🌹 ${config.PREFIX}ping (Speed)
🌹 ${config.PREFIX}alive (Status)
🌹 ${config.PREFIX}system (Details)
🌹 ${config.PREFIX}jid (User ID)

📰 *NEWS UPDATES*
🌹 ${config.PREFIX}adanews
🌹 ${config.PREFIX}sirasanews
🌹 ${config.PREFIX}gagananews
🌹 ${config.PREFIX}lankadeepanews

👥 *GROUP & ADMIN*
🌹 ${config.PREFIX}tagall (Mention)
🌹 ${config.PREFIX}online (Check)
🌹 ${config.PREFIX}block (Restrict)
🌹 ${config.PREFIX}unblock (Allow)

🔍 *SEARCH ENGINE*
🌹 ${config.PREFIX}img [query]
🌹 ${config.PREFIX}google [query]

> *POWERED BY LORD INDUMINA 💉🩸*`;

        const buttons = [
            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "🔙 MAIN MENU" }, type: 1 },
            { buttonId: `${config.PREFIX}settings`, buttonText: { displayText: "⚙️ SETTINGS" }, type: 1 }
        ];

        await socket.sendMessage(sender, {
            image: { url: myPhoto }, // පින්තූරය සමඟ යැවීම
            caption: toolsText,
            footer: "🔧 BLOODY ROSE UTILITY CENTER",
            buttons: buttons,
            headerType: 4,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ලොකු Thumbnail එක විතරයි
                    sourceUrl: "https://github.com/Indumina-Lord",
                    title: "", 
                    body: ""
                }
            }
        }, { quoted: lordMeta });

    } catch (err) {
        console.error('Tools menu error:', err);
        try { await socket.sendMessage(sender, { text: '❌ Failed to show tools menu.' }, { quoted: msg }); } catch(e){}
    }
    break;
}
case 'settings': {
    try { 
        await socket.sendMessage(sender, { react: { text: "⚙️", key: msg.key } }); 
    } catch(e){}

    try {
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';
        
        // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
        const lordMeta = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: `BR_SETTINGS_MENU_${Date.now()}` 
            },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        const settingsText = `✨ *B L O O D Y  R O S E  S E T T I N G S* ✨

🤖 *BOT CUSTOMIZATION*
🌹 ${config.PREFIX}setbotname [name]
🌹 ${config.PREFIX}setlogo [reply img]

📊 *CONFIG MANAGEMENT*
🌹 ${config.PREFIX}showconfig
🌹 ${config.PREFIX}resetconfig

🗑️ *SESSION MANAGEMENT*
🌹 ${config.PREFIX}deleteme

> *POWERED BY LORD INDUMINA 💉🩸*`;

        const buttons = [
            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "🔙 MAIN MENU" }, type: 1 },
            { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "👑 OWNER" }, type: 1 }
        ];

        await socket.sendMessage(sender, {
            image: { url: myPhoto }, // පින්තූරය සමඟ යැවීම
            caption: settingsText,
            footer: "⚙️ BLOODY ROSE SETTINGS PANEL",
            buttons: buttons,
            headerType: 4,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ලොකු Thumbnail එක විතරයි
                    sourceUrl: "https://github.com/Indumina-Lord",
                    title: "", 
                    body: ""
                }
            }
        }, { quoted: lordMeta });

    } catch (err) {
        console.error('Settings menu error:', err);
        try { await socket.sendMessage(sender, { text: '❌ Failed to show settings menu.' }, { quoted: msg }); } catch(e){}
    }
    break;
}
// ==================== OWNER MENU ====================
case 'owner': {
    try { 
        await socket.sendMessage(sender, { react: { text: "👑", key: msg.key } }); 
    } catch(e){}

    try {
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';
        const ownerNumber = '94763003966'; // ඔයාගේ නම්බර් එක

        // 🔹 LORD INDUMINA META CARD (FAKE CONTACT)
        const lordMeta = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: `BR_OWNER_ID_${Date.now()}` 
            },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=${ownerNumber}:+94 76 300 3966\nEND:VCARD` 
                } 
            }
        };

        const ownerText = `✨ *B L O O D Y  R O S E  O W N E R* ✨

┌──────────────┈
│ 👑 *NAME:* LORD INDUMINA
│ 📱 *CONTACT:* +94 76 300 3966
│ 🚀 *DEV:* BLOODY ROSE TECH
│ 🛠️ *STATUS:* Online
└──────────────┈

💬 *For support, private bots, or queries,*
*feel free to contact the owner directly.*

> *POWERED BY LORD INDUMINA 💉🩸*`;

        const buttons = [
            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "🔙 MAIN MENU" }, type: 1 },
            { buttonId: `${config.PREFIX}settings`, buttonText: { displayText: "⚙️ SETTINGS" }, type: 1 }
        ];

        // 1. Send Contact Card First (Vcard එක වෙනම යැවීම)
        await socket.sendMessage(sender, {
            contacts: {
                displayName: "LORD INDUMINA 💉",
                contacts: [{ vcard: lordMeta.message.contactMessage.vcard }]
            }
        }, { quoted: msg });

        // 2. Send Image Menu with Buttons (පින්තූරය සහ බොත්තම්)
        await socket.sendMessage(sender, {
            image: { url: myPhoto },
            caption: ownerText,
            footer: "👑 OWNER INFORMATION CENTER",
            buttons: buttons,
            headerType: 4,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    sourceUrl: `https://wa.me/${ownerNumber}`,
                    title: "",
                    body: ""
                }
            }
        }, { quoted: lordMeta });

    } catch (err) {
        console.error('Owner command error:', err);
        try { await socket.sendMessage(sender, { text: '❌ Failed to show owner info.' }, { quoted: msg }); } catch(e){}
    }
    break;
}
case 'google':
case 'gsearch':
case 'search': {
    const axios = require('axios');
    const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';
    const ownerNumber = '94763003966';

    try {
        if (!args || args.length === 0) {
            await socket.sendMessage(sender, {
                text: '💉 *Master, please provide a search query!*\n\n*Example:*\n.google Bloody Rose WhatsApp Bot'
            });
            break;
        }

        await socket.sendMessage(sender, { react: { text: "🔍", key: msg.key } });

        // 🔹 LORD INDUMINA META CARD
        const lordMeta = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: `BR_GSEARCH_${Date.now()}` 
            },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=${ownerNumber}:+94 76 300 3966\nEND:VCARD` 
                } 
            }
        };

        const query = args.join(" ");
        const apiKey = "AIzaSyDMbI3nvmQUrfjoCJYLS69Lej1hSXQjnWI";
        const cx = "baf9bdb0c631236e5";
        const apiUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cx}`;

        const response = await axios.get(apiUrl);

        if (response.status !== 200 || !response.data.items || response.data.items.length === 0) {
            await socket.sendMessage(sender, { text: `❌ *No results found for:* ${query}` }, { quoted: lordMeta });
            break;
        }

        // 🔹 BLOODY ROSE LUXURY CAPTION
        let results = `✨ *B L O O D Y  R O S E  S E A R C H* ✨\n\n🔍 *Results for:* "${query}"\n\n`;
        
        response.data.items.slice(0, 5).forEach((item, index) => {
            results += `*${index + 1}. ${item.title}*\n🔗 ${item.link}\n\n`;
        });
        
        results += `──────────────────────\n> *POWERED BY LORD INDUMINA 💉🩸*`;

        const firstResult = response.data.items[0];
        const searchThumb = firstResult.pagemap?.cse_image?.[0]?.src || firstResult.pagemap?.cse_thumbnail?.[0]?.src || myPhoto;

        await socket.sendMessage(sender, {
            image: { url: searchThumb },
            caption: results.trim(),
            contextInfo: { 
                mentionedJid: [sender],
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: true, // ලොකු Thumbnail එක
                    sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                    title: "", // Title/Body අයින් කළා පිරිසිදු පෙනුමට
                    body: ""
                }
            }
        }, { quoted: lordMeta });

    } catch (error) {
        console.error(`Google search error:`, error);
        await socket.sendMessage(sender, { text: `*❌ Error:* ${error.message}` });
    }
    break;
}
case 'img': {
    const q = body.replace(/^[.\/!]img\s*/i, '').trim();
    const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

    if (!q) return await socket.sendMessage(sender, {
        text: '💉 *Master, please provide a search query!*\n\n*Example:* `.img dark aesthetic`'
    }, { quoted: msg });

    try {
        await socket.sendMessage(sender, { react: { text: "🖼️", key: msg.key } });

        // 🔹 FAKE META CARD (Privacy Protected)
        const fakeMeta = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_IMG_L_${Date.now()}` },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        // 1. LOADING ANIMATION
        let { key } = await socket.sendMessage(from, { text: "🌹 *BLOODY ROSE: FETCHING IMAGES...*" }, { quoted: fakeMeta });
        
        const loadingBars = [
            "🌹 [▒▒▒▒▒▒▒▒▒▒] 10%",
            "🌹 [███▒▒▒▒▒▒▒] 40%",
            "🌹 [██████▒▒▒▒] 70%",
            "🌹 [██████████] 100%",
            "✨ *SUPREME IMAGES READY!*"
        ];

        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 400));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        // ලෝඩින් මැසේජ් එක මකා දැමීම
        await new Promise(res => setTimeout(res, 500));
        await socket.sendMessage(from, { delete: key });

        // 2. FETCH DATA
        const res = await axios.get(`https://allstars-apis.vercel.app/pinterest?search=${encodeURIComponent(q)}`);
        const data = res.data.data;

        if (!data || data.length === 0) {
            return await socket.sendMessage(sender, { text: '❌ *No images found for your query!* science' }, { quoted: fakeMeta });
        }

        const imagesToSend = data.slice(0, 10);

        // 3. SEND IMAGES WITH 1s DELAY
        for (let i = 0; i < imagesToSend.length; i++) {
            await socket.sendMessage(from, { 
                image: { url: imagesToSend[i] },
                caption: `✨ *Image [${i + 1}/10]*\n🔍 *Search:* ${q}\n\n> *Created by Lord Indumina 🩸*`,
                contextInfo: {
                    externalAdReply: {
                        thumbnailUrl: myPhoto,
                        mediaType: 1,
                        renderLargerThumbnail: false,
                        title: "B L O O D Y  R O S E  I M G",
                        body: "Elite Image Downloader",
                        sourceUrl: "https://github.com/Indumina-Lord"
                    }
                }
            });

            // තත්පරයක පරතරය
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (err) {
        console.error("Image search error:", err);
        await socket.sendMessage(sender, { text: '❌ *Failed to fetch images!*' });
    }
    break;
}
case 'gdrive': {
    const text = args.join(' ').trim();
    const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

    if (!text) return await socket.sendMessage(sender, { 
        text: '💉 *Master, please provide a Google Drive link.*\n\n*Example:* `.gdrive https://drive.google.com/file/d/xxxx`' 
    }, { quoted: msg });

    try {
        await socket.sendMessage(sender, { react: { text: "📂", key: msg.key } });

        // 🔹 FAKE META CARD (Privacy Protected)
        const fakeMeta = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_GDRIVE_${Date.now()}` },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        // 1. LOADING ANIMATION
        let { key } = await socket.sendMessage(from, { text: "🌹 *BLOODY ROSE: CONNECTING TO DRIVE...*" }, { quoted: fakeMeta });
        
        const loadingBars = [
            "🌹 [▒▒▒▒▒▒▒▒▒▒] 10%",
            "🌹 [███▒▒▒▒▒▒▒] 40%",
            "🌹 [██████▒▒▒▒] 70%",
            "🌹 [██████████] 100%",
            "✨ *FILE LOCATED! STARTING DOWNLOAD...*"
        ];

        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 300));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        // 2. FETCH DATA
        const res = await axios.get(`https://saviya-kolla-api.koyeb.app/download/gdrive?url=${encodeURIComponent(text)}`);
        if (!res.data?.status || !res.data.result) {
            return await socket.sendMessage(sender, { text: '❌ *Failed to fetch file info. Link might be private!*' }, { quoted: fakeMeta });
        }

        const file = res.data.result;

        // ලෝඩින් මැසේජ් එක මකා දැමීම
        await socket.sendMessage(from, { delete: key });

        // 3. SEND AS DOCUMENT
        await socket.sendMessage(sender, {
            document: { 
                url: file.downloadLink, 
                mimetype: file.mimeType || 'application/octet-stream', 
                fileName: file.name 
            },
            caption: `✨ *B L O O D Y  R O S E  D R I V E* ✨\n\n📂 *File:* ${file.name}\n💾 *Size:* ${file.size}\n\n> *Created by Lord Indumina 🩸*`,
            contextInfo: { 
                mentionedJid: [sender],
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: false,
                    title: "G-DRIVE DOWNLOADER",
                    body: `File: ${file.name}`,
                    sourceUrl: "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: fakeMeta });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (err) {
        console.error('GDrive command error:', err);
        await socket.sendMessage(sender, { text: '❌ *Error fetching Google Drive file!*' }, { quoted: msg });
    }
    break;
}
case 'adanews': {
    try {
        await socket.sendMessage(sender, { react: { text: "📰", key: msg.key } });
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

        // 🔹 FAKE META CARD (Privacy Protected)
        const fakeMeta = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_ADA_NEWS_${Date.now()}` },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        // 1. LOADING ANIMATION
        let { key } = await socket.sendMessage(from, { text: "🌹 *BLOODY ROSE: FETCHING ADA NEWS...*" }, { quoted: fakeMeta });
        const loadingBars = ["🌹 [▒▒▒] 10%", "🌹 [██▒] 50%", "🌹 [███] 100%", "✨ *NEWS READY!*"];
        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 300));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/ada');
        if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Ada News.' }, { quoted: fakeMeta });

        const n = res.data.result;
        await socket.sendMessage(from, { delete: key }); // Delete loading message

        const caption = `✨ *B L O O D Y  R O S E  N E W S* ✨\n\n📰 *${n.title}*\n\n📅 *DATE:* ${n.date}\n⏰ *TIME:* ${n.time}\n\n📝 ${n.desc}\n\n🔗 *Full Story:* ${n.url}\n\n> *Created by Lord Indumina 🩸*`;

        await socket.sendMessage(sender, { 
            image: { url: n.image }, 
            caption, 
            contextInfo: { 
                mentionedJid: [sender],
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: false,
                    title: "ADA DERANA NEWS UPDATE",
                    body: "Elite News Reporter",
                    sourceUrl: n.url
                }
            } 
        }, { quoted: fakeMeta });

    } catch (err) {
        console.error('adanews error:', err);
        await socket.sendMessage(sender, { text: '❌ Error fetching Ada News.' });
    }
    break;
}

case 'sirasanews': {
    try {
        await socket.sendMessage(sender, { react: { text: "📻", key: msg.key } });
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

        // 🔹 FAKE META CARD
        const fakeMeta = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_SIRASA_NEWS_${Date.now()}` },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        // 1. LOADING ANIMATION
        let { key } = await socket.sendMessage(from, { text: "🌹 *BLOODY ROSE: FETCHING SIRASA NEWS...*" }, { quoted: fakeMeta });
        const loadingBars = ["🌹 [▒▒▒] 10%", "🌹 [██▒] 50%", "🌹 [███] 100%", "✨ *NEWS READY!*"];
        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 300));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/sirasa');
        if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Sirasa News.' }, { quoted: fakeMeta });

        const n = res.data.result;
        await socket.sendMessage(from, { delete: key });

        const caption = `✨ *B L O O D Y  R O S E  N E W S* ✨\n\n📰 *${n.title}*\n\n📅 *DATE:* ${n.date}\n⏰ *TIME:* ${n.time}\n\n📝 ${n.desc}\n\n🔗 *Full Story:* ${n.url}\n\n> *Created by Lord Indumina 🩸*`;

        await socket.sendMessage(sender, { 
            image: { url: n.image }, 
            caption, 
            contextInfo: { 
                mentionedJid: [sender],
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: false,
                    title: "SIRASA NEWS UPDATE",
                    body: "Elite News Reporter",
                    sourceUrl: n.url
                }
            } 
        }, { quoted: fakeMeta });

    } catch (err) {
        console.error('sirasanews error:', err);
        await socket.sendMessage(sender, { text: '❌ Error fetching Sirasa News.' });
    }
    break;
}
case 'lankadeepanews': {
    try {
        await socket.sendMessage(sender, { react: { text: "🗞️", key: msg.key } });
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

        const fakeMeta = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_LANKADEEPA_${Date.now()}` },
            message: { contactMessage: { displayName: "LORD INDUMINA 💉", vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
        };

        // 1. LOADING ANIMATION
        let { key } = await socket.sendMessage(from, { text: "🌹 *BLOODY ROSE: FETCHING LANKADEEPA NEWS...*" }, { quoted: fakeMeta });
        const loadingBars = ["🌹 [▒▒▒] 10%", "🌹 [██▒] 50%", "🌹 [███] 100%", "✨ *NEWS READY!*"];
        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 300));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/lankadeepa');
        if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Lankadeepa News.' }, { quoted: fakeMeta });

        const n = res.data.result;
        await socket.sendMessage(from, { delete: key });

        const caption = `✨ *B L O O D Y  R O S E  N E W S* ✨\n\n📰 *${n.title}*\n\n📅 *DATE:* ${n.date}\n⏰ *TIME:* ${n.time}\n\n📝 ${n.desc}\n\n🔗 *Full Story:* ${n.url}\n\n> *Created by Lord Indumina 🩸*`;

        await socket.sendMessage(sender, { 
            image: { url: n.image }, 
            caption, 
            contextInfo: { 
                mentionedJid: [sender],
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: false,
                    title: "LANKADEEPA NEWS UPDATE",
                    body: "Elite News Reporter",
                    sourceUrl: n.url
                }
            } 
        }, { quoted: fakeMeta });

    } catch (err) {
        console.error('lankadeepanews error:', err);
        await socket.sendMessage(sender, { text: '❌ Error fetching Lankadeepa News.' });
    }
    break;
}

case 'gagananews': {
    try {
        await socket.sendMessage(sender, { react: { text: "📡", key: msg.key } });
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

        const fakeMeta = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_GAGANA_${Date.now()}` },
            message: { contactMessage: { displayName: "LORD INDUMINA 💉", vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
        };

        // 1. LOADING ANIMATION
        let { key } = await socket.sendMessage(from, { text: "🌹 *BLOODY ROSE: FETCHING GAGANA NEWS...*" }, { quoted: fakeMeta });
        const loadingBars = ["🌹 [▒▒▒] 10%", "🌹 [██▒] 50%", "🌹 [███] 100%", "✨ *NEWS READY!*"];
        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 300));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/gagana');
        if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Gagana News.' }, { quoted: fakeMeta });

        const n = res.data.result;
        await socket.sendMessage(from, { delete: key });

        const caption = `✨ *B L O O D Y  R O S E  N E W S* ✨\n\n📰 *${n.title}*\n\n📅 *DATE:* ${n.date}\n⏰ *TIME:* ${n.time}\n\n📝 ${n.desc}\n\n🔗 *Full Story:* ${n.url}\n\n> *Created by Lord Indumina 🩸*`;

        await socket.sendMessage(sender, { 
            image: { url: n.image }, 
            caption, 
            contextInfo: { 
                mentionedJid: [sender],
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: false,
                    title: "GAGANA NEWS UPDATE",
                    body: "Elite News Reporter",
                    sourceUrl: n.url
                }
            } 
        }, { quoted: fakeMeta });

    } catch (err) {
        console.error('gagananews error:', err);
        await socket.sendMessage(sender, { text: '❌ Error fetching Gagana News.' });
    }
    break;
}
//💐💐💐💐💐💐






  case 'unfollow': {
    const jid = args[0] ? args[0].trim() : null;
    const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

    // 🔹 FAKE META CARD (Privacy Protected)
    const fakeMeta = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_UNFOLLOW_${Date.now()}` },
        message: { 
            contactMessage: { 
                displayName: "LORD INDUMINA 💉", 
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
            } 
        }
    };

    if (!jid) {
        return await socket.sendMessage(sender, { 
            text: '❗ *Master, please provide the channel JID to unfollow.*\n\n*Example:* `.unfollow 120363396379901844@newsletter`' 
        }, { quoted: fakeMeta });
    }

    // Admin/Owner Check
    const admins = await loadAdminsFromMongo();
    const normalizedAdmins = admins.map(a => (a || '').toString());
    const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
    const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);

    if (!(isOwner || isAdmin)) {
        return await socket.sendMessage(sender, { 
            text: '❌ *Permission denied!* Only my *Owner* or *Admins* can remove channels.' 
        }, { quoted: fakeMeta });
    }

    if (!jid.endsWith('@newsletter')) {
        return await socket.sendMessage(sender, { 
            text: '❗ *Invalid JID!* It must end with *@newsletter*' 
        }, { quoted: fakeMeta });
    }

    try {
        await socket.sendMessage(sender, { react: { text: "💔", key: msg.key } });

        if (typeof socket.newsletterUnfollow === 'function') {
            await socket.newsletterUnfollow(jid);
        }
        await removeNewsletterFromMongo(jid);

        const successText = `✨ *B L O O D Y  R O S E  U P D A T E* ✨\n\n✅ *Successfully Unfollowed:*\n📂 JID: ${jid}\n\n> *Action performed by Lord Indumina 🩸*`;

        await socket.sendMessage(sender, { 
            text: successText,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: false,
                    title: "CHANNEL REMOVED",
                    body: "Newsletter Unfollowed Successfully",
                    sourceUrl: "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: fakeMeta });

    } catch (e) {
        console.error('unfollow error', e);
        await socket.sendMessage(sender, { 
            text: `❌ *Failed to unfollow:* ${e.message || e}` 
        }, { quoted: fakeMeta });
    }
    break;
}
case 'tiktok':
case 'ttdl':
case 'tt':
case 'tiktokdl': {
    const q = args.join(" ").trim();
    const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

    // 🔹 FAKE META CARD (Privacy Protected)
    const fakeMeta = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_TT_DL_${Date.now()}` },
        message: { 
            contactMessage: { 
                displayName: "LORD INDUMINA 💉", 
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
            } 
        }
    };

    if (!q) {
        return await socket.sendMessage(sender, {
            text: '💉 *Master, please provide a TikTok video link!*\n\n*Example:* `.tiktok https://vt.tiktok.com/xxxx/`'
        }, { quoted: fakeMeta });
    }

    if (!q.includes("tiktok.com")) {
        return await socket.sendMessage(sender, {
            text: '❌ *Invalid TikTok link! Please check the URL again.*'
        }, { quoted: fakeMeta });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });

        // 1. LOADING ANIMATION
        let { key } = await socket.sendMessage(from, { text: "🌹 *BLOODY ROSE: ACCESSING TIKTOK SERVERS...*" }, { quoted: fakeMeta });
        const loadingBars = [
            "🌹 [▒▒▒▒▒▒▒▒▒▒] 10%",
            "🌹 [███▒▒▒▒▒▒▒] 40%",
            "🌹 [██████▒▒▒▒] 70%",
            "🌹 [██████████] 100%",
            "✨ *VIDEO LOCATED! PROCESSING...*"
        ];

        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 300));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        // 2. FETCH DATA
        const apiUrl = `https://movanest.zone.id/v2/tiktok?url=${encodeURIComponent(q)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.status || !data.results) {
            await socket.sendMessage(from, { text: '🚩 *Failed to fetch video! The link might be broken.*', edit: key });
            return;
        }

        // ලෝඩින් මැසේජ් එක මකා දැමීම
        await socket.sendMessage(from, { delete: key });

        const { title, no_watermark, music_info } = data.results;
        const usernameMatch = q.match(/@([^\/]+)/);
        const username = usernameMatch ? usernameMatch[1] : 'TikTok User';

        // 3. SEND VIDEO
        const caption = `✨ *B L O O D Y  R O S E  T I K T O K* ✨\n\n👤 *USER:* @${username}\n📝 *TITLE:* ${title || 'No Title'}\n🎵 *MUSIC:* ${music_info?.title || 'Original Sound'}\n\n> *Created by Lord Indumina 🩸*`;

        const buttons = [
            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '🔙 MAIN MENU' }, type: 1 },
            { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: '👑 OWNER' }, type: 1 }
        ];

        await socket.sendMessage(sender, {
            video: { url: no_watermark },
            caption: caption,
            footer: "🔥 BLOODY ROSE TIKTOK DOWNLODER",
            buttons: buttons,
            headerType: 4,
            contextInfo: { 
                mentionedJid: [sender],
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: false,
                    title: "TIKTOK VIDEO DOWNLOADER",
                    body: `@${username}`,
                    sourceUrl: q
                }
            }
        }, { quoted: fakeMeta });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (err) {
        console.error("TikTok downloader error:", err);
        await socket.sendMessage(sender, { text: '❌ *Internal Error. Please try again later!*' });
    }
    break;
}
case 'xvideo': {
    try {
        const q = args.join(' ').trim();
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

        const fakeMeta = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_XVID_${Date.now()}` },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        if (!q) return await socket.sendMessage(sender, { 
            text: '💉 *Master, please provide a URL or search query!*\n\n*Example:* `.xvideo teacher`' 
        }, { quoted: fakeMeta });

        await socket.sendMessage(sender, { react: { text: '🔞', key: msg.key } });

        // 🚀 LONG LOADING BAR ANIMATION
        let { key } = await socket.sendMessage(from, { text: "🌹 *B L O O D Y  R O S E  S E A R C H I N G . . .*" }, { quoted: fakeMeta });
        
        const loadingBars = [
            "🌹 📥 [▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 05%",
            "🌹 📥 [██▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 20%",
            "🌹 📥 [██████▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 45%",
            "🌹 📥 [████████████▒▒▒▒▒▒▒▒] 75%",
            "🌹 📥 [██████████████████▒▒] 95%",
            "🌹 📥 [████████████████████] 100%",
            "✨ *SUPREME CONTENT READY!*"
        ];

        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 350));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        // 2. FETCH DATA
        let video, isURL = false;
        if (q.startsWith('http')) { 
            video = q; 
            isURL = true; 
        } else {
            const s = await axios.get(`https://saviya-kolla-api.koyeb.app/search/xvideos?query=${encodeURIComponent(q)}`);
            if (!s.data?.status || !s.data.result?.length) {
                await socket.sendMessage(from, { text: '❌ *No results found for your query!*' }, { edit: key });
                return;
            }
            video = s.data.result[0];
        }

        const dlRes = await axios.get(`https://saviya-kolla-api.koyeb.app/download/xvideos?url=${encodeURIComponent(isURL ? video : video.url)}`);
        if (!dlRes.data?.status) throw new Error('Download API failed');

        const dl = dlRes.data.result;

        // Cleanup loading message
        await socket.sendMessage(from, { delete: key });

        // 3. SEND VIDEO
        const caption = `✨ *B L O O D Y  R O S E  X V I D* ✨\n\n🔞 *TITLE:* ${dl.title}\n⏱️ *DURATION:* ${isURL ? 'N/A' : video.duration}\n👁️ *VIEWS:* ${dl.views}\n\n> *Created by Lord Indumina 🩸*`;

        await socket.sendMessage(sender, {
            video: { url: dl.url },
            caption: caption,
            mimetype: 'video/mp4',
            contextInfo: { 
                mentionedJid: [sender],
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: false,
                    title: "X-VIDEO DOWNLOADER",
                    body: "Supreme Content Delivery",
                    sourceUrl: "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: fakeMeta });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (err) {
        console.error('xvideo error:', err);
        await socket.sendMessage(sender, { text: '*❌ Failed to fetch video!*' });
    }
    break;
}
case 'xvideo2': {
    try {
        const q = args.join(' ').trim();
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

        const fakeMeta = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_XVID2_${Date.now()}` },
            message: { contactMessage: { displayName: "LORD INDUMINA 💉", vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
        };

        if (!q) return await socket.sendMessage(sender, { text: '💉 *Master, please provide a URL or query!*\n\n*Example:* `.xvideo2 teacher`' }, { quoted: fakeMeta });

        await socket.sendMessage(sender, { react: { text: '🔞', key: msg.key } });

        // 🚀 LONG LOADING BAR
        let { key } = await socket.sendMessage(from, { text: "🌹 *B L O O D Y  R O S E  S E A R C H I N G . . .*" }, { quoted: fakeMeta });
        const loadingBars = [
            "🌹 📥 [▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 05%",
            "🌹 📥 [████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 25%",
            "🌹 📥 [████████▒▒▒▒▒▒▒▒▒▒▒▒] 45%",
            "🌹 📥 [████████████▒▒▒▒▒▒▒▒] 65%",
            "🌹 📥 [████████████████▒▒▒▒] 85%",
            "🌹 📥 [████████████████████] 100%",
            "✨ *CONTENT READY!*"
        ];
        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 300));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        let video = null, isURL = false;
        if (q.startsWith('http')) { video = q; isURL = true; } 
        else {
            const s = await axios.get(`https://saviya-kolla-api.koyeb.app/search/xvideos?query=${encodeURIComponent(q)}`);
            if (!s.data?.status || !s.data.result?.length) {
                await socket.sendMessage(from, { text: '❌ *No results found!*' }, { edit: key });
                return;
            }
            video = s.data.result[0];
        }

        const dlRes = await axios.get(`https://saviya-kolla-api.koyeb.app/download/xvideos?url=${encodeURIComponent(isURL ? video : video.url)}`);
        const dl = dlRes.data.result;
        await socket.sendMessage(from, { delete: key });

        await socket.sendMessage(sender, {
            video: { url: dl.url },
            caption: `✨ *B L O O D Y  R O S E  X V I D  2* ✨\n\n🔞 *TITLE:* ${dl.title}\n⏱️ *DURATION:* ${isURL ? 'N/A' : video.duration}\n👁️ *VIEWS:* ${dl.views}\n\n> *Created by Lord Indumina 🩸*`,
            contextInfo: { 
                externalAdReply: { thumbnailUrl: myPhoto, mediaType: 1, title: "X-VIDEO DOWNLOADER 2", sourceUrl: "https://github.com/Indumina-Lord" }
            }
        }, { quoted: fakeMeta });

    } catch (err) {
        await socket.sendMessage(sender, { text: '*❌ Failed to fetch video!*' });
    }
    break;
}

case 'xnxx':
case 'xnxxvideo': {
    try {
        const q = args.join(' ').trim();
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

        const fakeMeta = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_XNXX_${Date.now()}` },
            message: { contactMessage: { displayName: "LORD INDUMINA 💉", vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
        };

        if (!Array.isArray(config.PREMIUM) || !config.PREMIUM.includes(senderNumber)) 
            return await socket.sendMessage(sender, { text: '❗ *This command is for Premium users only.*' }, { quoted: fakeMeta });

        if (!q) return await socket.sendMessage(sender, { text: '❌ *Provide a search name. Example: .xnxx blue*' }, { quoted: fakeMeta });

        await socket.sendMessage(from, { react: { text: "🔞", key: msg.key } });

        // 🚀 LONG LOADING BAR
        let { key } = await socket.sendMessage(from, { text: "🌹 *B L O O D Y  R O S E  X N X X  S E A R C H . . .*" }, { quoted: fakeMeta });
        const loadingBars = [
            "🌹 📥 [▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 10%",
            "🌹 📥 [██████▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 40%",
            "🌹 📥 [████████████▒▒▒▒▒▒▒▒] 70%",
            "🌹 📥 [████████████████████] 100%",
            "✨ *PREMIUM CONTENT LOCATED!*"
        ];
        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 300));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        const res = await axios.get(`https://api.genux.me/api/download/xnxx-download?query=${encodeURIComponent(q)}&apikey=GENUX-SANDARUX`);
        const d = res.data?.result;
        if (!d || !d.files) {
            await socket.sendMessage(from, { text: '❌ *No results found!*' }, { edit: key });
            return;
        }

        await socket.sendMessage(from, { delete: key });

        // Send Preview Image
        await socket.sendMessage(from, { 
            image: { url: d.image }, 
            caption: `✨ *B L O O D Y  R O S E  X N X X* ✨\n\n💬 *TITLE*: ${d.title}\n👀 *DURATION*: ${d.duration}\n💦 *TAGS*: ${d.tags || 'N/A'}\n\n> *Uploading Supreme Quality Video...*` 
        }, { quoted: fakeMeta });

        // Send Video
        await socket.sendMessage(from, { 
            video: { url: d.files.high }, 
            fileName: d.title + ".mp4", 
            mimetype: "video/mp4", 
            caption: `✅ *DONE - SUPREME QUALITY*\n\n> *Created by Lord Indumina 🩸*` 
        }, { quoted: fakeMeta });

    } catch (err) {
        await socket.sendMessage(sender, { text: "❌ *Error fetching video! API might be down.*" });
    }
    break;
}
case 'gjid':
case 'groupjid':
case 'grouplist': {
    try {
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

        // 🔹 FAKE META CARD (Privacy Protected)
        const fakeMeta = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_GJID_${Date.now()}` },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        await socket.sendMessage(sender, { react: { text: "📝", key: msg.key } });

        // 🚀 LONG LOADING BAR
        let { key } = await socket.sendMessage(from, { text: "🌹 *B L O O D Y  R O S E  G R O U P  F E T C H . . .*" }, { quoted: fakeMeta });
        const loadingBars = [
            "🌹 📥 [▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 10%",
            "🌹 📥 [██████▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 40%",
            "🌹 📥 [████████████▒▒▒▒▒▒▒▒] 70%",
            "🌹 📥 [████████████████████] 100%",
            "✨ *FETCHING COMPLETE!*"
        ];
        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 300));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        const groups = await socket.groupFetchAllParticipating();
        const groupArray = Object.values(groups);
        groupArray.sort((a, b) => a.creation - b.creation);

        if (groupArray.length === 0) {
            await socket.sendMessage(from, { text: "❌ *No groups found!*" }, { edit: key });
            return;
        }

        await socket.sendMessage(from, { delete: key }); // Delete loading message

        const groupsPerPage = 10;
        const totalPages = Math.ceil(groupArray.length / groupsPerPage);

        for (let page = 0; page < totalPages; page++) {
            const start = page * groupsPerPage;
            const end = start + groupsPerPage;
            const pageGroups = groupArray.slice(start, end);

            const groupList = pageGroups.map((group, index) => {
                const globalIndex = start + index + 1;
                const memberCount = group.participants ? group.participants.length : 'N/A';
                const subject = group.subject || 'Unnamed Group';
                const jid = group.id;
                return `📍 *${globalIndex}. ${subject}*\n👥 *Members:* ${memberCount}\n🆔 \`${jid}\``;
            }).join('\n\n');

            const textMsg = `✨ *B L O O D Y  R O S E  G R O U P S* ✨\n\n📄 *PAGE:* ${page + 1} / ${totalPages}\n👥 *TOTAL GROUPS:* ${groupArray.length}\n\n${groupList}\n\n> *Created by Lord Indumina 🩸*`;

            await socket.sendMessage(sender, {
                text: textMsg,
                contextInfo: {
                    externalAdReply: {
                        thumbnailUrl: myPhoto,
                        mediaType: 1,
                        renderLargerThumbnail: false,
                        title: "GROUP JID LISTER",
                        body: `Page ${page + 1} of ${totalPages}`,
                        sourceUrl: "https://github.com/Indumina-Lord"
                    }
                }
            }, { quoted: fakeMeta });

            if (page < totalPages - 1) {
                await new Promise(res => setTimeout(res, 1000)); // 1s Delay
            }
        }

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (err) {
        console.error('GJID command error:', err);
        await socket.sendMessage(sender, { text: "❌ *Failed to fetch group list!*" });
    }
    break;
}
case 'nanobanana': {
    const fs = require('fs');
    const path = require('path');
    const { GoogleGenAI } = require("@google/genai");

    // 🧩 Helper: Download quoted image
    async function downloadQuotedImage(socket, msg) {
        try {
            const ctx = msg.message?.extendedTextMessage?.contextInfo;
            if (!ctx || !ctx.quotedMessage) return null;
            const quoted = ctx.quotedMessage;
            const imageMsg = quoted.imageMessage || quoted[Object.keys(quoted).find(k => k.endsWith('Message'))];
            if (!imageMsg) return null;

            if (typeof socket.downloadMediaMessage === 'function') {
                const quotedKey = { remoteJid: msg.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant || undefined };
                const fakeMsg = { key: quotedKey, message: ctx.quotedMessage };
                const stream = await socket.downloadMediaMessage(fakeMsg, 'image');
                const bufs = [];
                for await (const chunk of stream) bufs.push(chunk);
                return Buffer.concat(bufs);
            }
            return null;
        } catch (e) { return null; }
    }

    try {
        const promptRaw = args.join(' ').trim();
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

        // 🔹 FAKE META CARD
        const fakeMeta = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_NANO_${Date.now()}` },
            message: { contactMessage: { displayName: "LORD INDUMINA 💉", vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
        };

        if (!promptRaw && !msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            return await socket.sendMessage(sender, {
                text: "🎨 *Master, please provide a prompt!*\n\n*Usage:* `.nanobanana <prompt>`\n💬 *Or reply to an image with a prompt.*"
            }, { quoted: fakeMeta });
        }

        await socket.sendMessage(sender, { react: { text: "🎨", key: msg.key } });

        // 🚀 LONG LOADING BAR
        let { key } = await socket.sendMessage(from, { text: "🌹 *B L O O D Y  R O S E  I M A G I N I N G . . .*" }, { quoted: fakeMeta });
        const loadingBars = [
            "🌹 🎨 [▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 10%",
            "🌹 🎨 [██████▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 35%",
            "🌹 🎨 [████████████▒▒▒▒▒▒▒▒] 65%",
            "🌹 🎨 [████████████████████] 100%",
            "✨ *AI MODEL IS RENDERING...*"
        ];
        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 400));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        const imageBuf = await downloadQuotedImage(socket, msg);
        
        // 🧠 Setup Gemini SDK
        const ai = new GoogleGenAI(process.env.GEMINI_API_KEY || "AIzaSyB6ZQwLHZFHxDCbBFJtc0GIN2ypdlga4vw");
        const model = ai.getGenerativeModel({ model: "gemini-2.0-flash-exp" }); // Using stable flash model

        const contents = imageBuf
            ? [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: imageBuf.toString("base64") } }, { text: promptRaw }] }]
            : [{ role: "user", parts: [{ text: promptRaw }] }];

        const result = await model.generateContent({ contents });
        const response = await result.response;
        
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!part) throw new Error('⚠️ AI failed to generate image data.');

        const buffer = Buffer.from(part.inlineData.data, "base64");
        await socket.sendMessage(from, { delete: key }); // Delete loading

        // 🖼️ SEND GENERATED IMAGE
        await socket.sendMessage(sender, {
            image: buffer,
            caption: `✨ *B L O O D Y  R O S E  A I  A R T* ✨\n\n🎨 *PROMPT:* ${promptRaw || 'Image Edit'}\n🧩 *MODEL:* Nano-Banana (Gemini)\n\n> *Created by Lord Indumina 🩸*`,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: false,
                    title: "AI IMAGE GENERATOR",
                    body: "Powered by Gemini 2.0 Flash",
                    sourceUrl: "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: fakeMeta });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (err) {
        console.error('nanobanana error:', err);
        await socket.sendMessage(sender, { text: `❌ *AI Error:* ${err.message}` });
    }
    break;
}
case 'savecontact':
case 'gvcf2':
case 'scontact':
case 'savecontacts': {
    try {
        const text = args.join(" ").trim();
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';
        const fs = require('fs-extra');
        const os = require('os');
        const path = require('path');

        // 🔹 FAKE META CARD (Privacy Protected)
        const fakeMeta = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_VCF_${Date.now()}` },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        if (!text) {
            return await socket.sendMessage(sender, { 
                text: "📌 *Master, please provide a Group JID!*\n\n*Usage:* `.savecontact <group JID>`\n📥 *Example:* `.savecontact 123456789@g.us`" 
            }, { quoted: fakeMeta });
        }

        const groupJid = text.trim();
        if (!groupJid.endsWith('@g.us')) {
            return await socket.sendMessage(sender, { text: "❌ *Invalid Group JID!* Must end with @g.us" }, { quoted: fakeMeta });
        }

        await socket.sendMessage(sender, { react: { text: "📇", key: msg.key } });

        // 🚀 LONG LOADING BAR
        let { key } = await socket.sendMessage(from, { text: "🌹 *B L O O D Y  R O S E  V C F  E X P O R T I N G . . .*" }, { quoted: fakeMeta });
        const loadingBars = [
            "🌹 📥 [▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 15%",
            "🌹 📥 [██████▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 40%",
            "🌹 📥 [████████████▒▒▒▒▒▒▒▒] 75%",
            "🌹 📥 [████████████████████] 100%",
            "✨ *CONTACTS EXTRACTED SUCCESSFULLY!*"
        ];
        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 350));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        let groupMetadata;
        try {
            groupMetadata = await socket.groupMetadata(groupJid);
        } catch {
            await socket.sendMessage(from, { text: "❌ *Failed to fetch group info!* Bot must be in the group." }, { edit: key });
            return;
        }

        const { participants, subject } = groupMetadata;
        let vcard = '';
        let index = 1;

        for (const participant of participants) {
            const num = participant.id.split('@')[0];
            let name = num;
            try {
                const contact = socket.contacts?.[participant.id] || {};
                name = contact.notify || contact.vname || contact.name || participant.name || `Member-${index}`;
            } catch { name = `Contact-${index}`; }

            vcard += `BEGIN:VCARD\nVERSION:3.0\nFN:BR - ${index}. ${name}\nTEL;type=CELL;type=VOICE;waid=${num}:+${num}\nEND:VCARD\n`;
            index++;
        }

        const safeSubject = subject.replace(/[^\w\s]/gi, "_");
        const tmpPath = path.join(os.tmpdir(), `BR_Contacts_${Date.now()}.vcf`);
        fs.writeFileSync(tmpPath, vcard.trim());

        await socket.sendMessage(from, { delete: key }); // Delete loading

        // 📁 SEND VCF FILE
        await socket.sendMessage(sender, {
            document: fs.readFileSync(tmpPath),
            mimetype: 'text/vcard',
            fileName: `Contacts-${safeSubject}.vcf`,
            caption: `✨ *B L O O D Y  R O S E  V C F  E X P O R T* ✨\n\n👥 *GROUP:* ${subject}\n📇 *TOTAL:* ${participants.length} Contacts\n\n> *Created by Lord Indumina 🩸*`,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: false,
                    title: "CONTACT EXPORTER PRO",
                    body: `Group: ${subject}`,
                    sourceUrl: "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: fakeMeta });

        try { fs.unlinkSync(tmpPath); } catch {}
        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (err) {
        console.error('Save contact error:', err);
        await socket.sendMessage(sender, { text: `❌ *Error:* ${err.message}` });
    }
    break;
}
case 'style':
case 'font':
case 'fancy': {
    const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';
    const randomPhotos = [
        "https://i.ibb.co/TDxsJ8gQ/5a6c2a86ca7c.jpg",
        "https://i.ibb.co/8DK0TWG9/29637fadf4fb.jpg",
        "https://i.ibb.co/5hrVJBy6/9bd89c44ea51.jpg",
        "https://i.ibb.co/hFGtd2Gk/02c5c5c5aa37.jpg"
    ];
    const selectedPhoto = randomPhotos[Math.floor(Math.random() * randomPhotos.length)];

    // 🎨 Fancy Styles Object (0-80)
    const fancyStyles = {
        0:{"a":"ค","b":"๖","c":"¢","d":"໓","e":"ē","f":"f","g":"ງ","h":"h","i":"i","j":"ว","k":"k","l":"l","m":"๓","n":"ຖ","o":"໐","p":"p","q":"๑","r":"r","s":"Ş","t":"t","u":"น","v":"ງ","w":"ຟ","x":"x","y":"ฯ","z":"ຊ"},
        1:{"a":"ą","b":"ც","c":"ƈ","d":"ɖ","e":"ɛ","f":"ʄ","g":"ɠ","h":"ɧ","i":"ı","j":"ʝ","k":"ƙ","l":"Ɩ","m":"ɱ","n":"ŋ","o":"ơ","p":"℘","q":"զ","r":"ཞ","s":"ʂ","t":"ɬ","u":"ų","v":"۷","w":"ῳ","x":"ҳ","y":"ყ","z":"ʑ"},
        2:{"a":"ﾑ","b":"乃","c":"ᄃ","d":"り","e":"乇","f":"ｷ","g":"ム","h":"ん","i":"ﾉ","j":"ﾌ","k":"ズ","l":"ﾚ","m":"ﾶ","n":"刀","o":"の","p":"ｱ","q":"ゐ","r":"尺","s":"丂","t":"ｲ","u":"ひ","v":"√","w":"W","x":"ﾒ","y":"ﾘ","z":"乙"},
        3:{"a":"卂","b":"乃","c":"匚","d":"ᗪ","e":"乇","f":"千","g":"Ꮆ","h":"卄","i":"丨","j":"ﾌ","k":"Ҝ","l":"ㄥ","m":"爪","n":"几","o":"ㄖ","p":"卩","q":"Ɋ","r":"尺","s":"丂","t":"ㄒ","u":"ㄩ","v":"ᐯ","w":"山","x":"乂","y":"ㄚ","z":"乙"},
           4:{"a":"🄰","b":"🄱","c":"🄲","d":"🄳","e":"🄴","f":"🄵","g":"🄶","h":"🄷","i":"🄸","j":"🄹","k":"🄺","l":"🄻","m":"🄼","n":"🄽","o":"🄾","p":"🄿","q":"🅀","r":"🅁","s":"🅂","t":"🅃","u":"🅄","v":"🅅","w":"🅆","x":"🅇","y":"🅈","z":"🅉"},
    5:{"a":"Ꮧ","b":"Ᏸ","c":"ፈ","d":"Ꮄ","e":"Ꮛ","f":"Ꭶ","g":"Ꮆ","h":"Ꮒ","i":"Ꭵ","j":"Ꮰ","k":"Ꮶ","l":"Ꮭ","m":"Ꮇ","n":"Ꮑ","o":"Ꭷ","p":"Ꭾ","q":"Ꭴ","r":"Ꮢ","s":"Ꮥ","t":"Ꮦ","u":"Ꮼ","v":"Ꮙ","w":"Ꮗ","x":"ጀ","y":"Ꭹ","z":"ፚ"},
    6:{"a":"ᗩ","b":"ᗷ","c":"ᑕ","d":"ᗪ","e":"E","f":"ᖴ","g":"G","h":"ᕼ","i":"I","j":"ᒍ","k":"K","l":"ᒪ","m":"ᗰ","n":"ᑎ","o":"O","p":"ᑭ","q":"ᑫ","r":"ᖇ","s":"ᔕ","t":"T","u":"ᑌ","v":"ᐯ","w":"ᗯ","x":"᙭","y":"Y","z":"ᘔ"},
    7:{"a":"ǟ","b":"ɮ","c":"ƈ","d":"ɖ","e":"ɛ","f":"ʄ","g":"ɢ","h":"ɦ","i":"ɨ","j":"ʝ","k":"ӄ","l":"ʟ","m":"ʍ","n":"ռ","o":"օ","p":"ք","q":"զ","r":"ʀ","s":"ֆ","t":"ȶ","u":"ʊ","v":"ʋ","w":"ա","x":"Ӽ","y":"ʏ","z":"ʐ"},
    8:{"a":"𝚊","b":"𝚋","c":"𝚌","d":"𝚍","e":"𝚎","f":"𝚏","g":"𝚐","h":"𝚑","i":"𝚒","j":"𝚓","k":"𝚔","l":"𝚕","m":"𝚖","n":"𝚗","o":"𝚘","p":"𝚙","q":"𝚚","r":"𝚛","s":"𝚜","t":"𝚝","u":"𝚞","v":"𝚟","w":"𝚠","x":"𝚡","y":"𝚢","z":"𝚣"},
    9:{"a":"𝙖","b":"𝙗","c":"𝙘","d":"𝙙","e":"𝙚","f":"𝙛","g":"𝗴","h":"𝙝","i":"𝙞","j":"𝙟","k":"𝙠","l":"𝙡","m":"𝙢","n":"𝙣","o":"𝙤","p":"𝙥","q":"𝙦","r":"𝙧","s":"𝙨","t":"𝙩","u":"𝙪","v":"𝙫","w":"𝙬","x":"𝙭","y":"𝙮","z":"𝙯"},
    10:{"a":"𝐚","b":"𝐛","c":"𝐜","d":"𝐝","e":"𝐞","f":"𝐟","g":"𝐠","h":"𝐡","i":"𝐢","j":"𝐣","k":"𝐤","l":"𝐥","m":"𝐦","n":"𝐧","o":"𝐨","p":"𝐩","q":"𝐪","r":"𝐫","s":"𝐬","t":"𝐭","u":"𝐮","v":"𝐯","w":"𝐰","x":"𝐱","y":"𝐲","z":"𝐳"},
    11:{"a":"𝗮","b":"𝗯","c":"𝗰","d":"𝗱","e":"𝗲","f":"𝗳","g":"𝗴","h":"𝗵","i":"𝗶","j":"𝗷","k":"𝗸","l":"𝗹","m":"𝗺","n":"𝗻","o":"𝗼","p":"𝗽","q":"𝗾","r":"𝗿","s":"𝘀","t":"𝘁","u":"𝘂","v":"𝘃","w":"𝘄","x":"𝘅","y":"𝘆","z":"𝘇"},
    12:{"a":"𝘢","b":"𝘣","c":"𝘤","d":"𝘥","e":"𝘦","f":"𝘧","g":"𝘨","h":"𝘩","i":"𝘪","j":"𝘫","k":"𝘬","l":"𝘭","m":"𝘮","n":"𝘯","o":"𝘰","p":"𝘱","q":"𝘲","r":"𝘳","s":"𝘴","t":"𝘵","u":"𝘶","v":"𝘷","w":"𝘸","x":"𝘹","y":"𝘺","z":"𝘻"},
    13:{"a":"α","b":"Ⴆ","c":"ƈ","d":"ԃ","e":"ҽ","f":"ϝ","g":"ɠ","h":"ԋ","i":"ι","j":"ʝ","k":"ƙ","l":"ʅ","m":"ɱ","n":"ɳ","o":"σ","p":"ρ","q":"ϙ","r":"ɾ","s":"ʂ","t":"ƚ","u":"υ","v":"ʋ","w":"ɯ","x":"x","y":"ყ","z":"ȥ"},
    14:{"a":"₳","b":"฿","c":"₵","d":"Đ","e":"Ɇ","f":"₣","g":"₲","h":"Ⱨ","i":"ł","j":"J","k":"₭","l":"Ⱡ","m":"₥","n":"₦","o":"Ø","p":"₱","q":"Q","r":"Ɽ","s":"₴","t":"₮","u":"Ʉ","v":"V","w":"₩","x":"Ӿ","y":"Ɏ","z":"Ⱬ"},
    15:{"a":"å","b":"ß","c":"¢","d":"Ð","e":"ê","f":"£","g":"g","h":"h","i":"ï","j":"j","k":"k","l":"l","m":"m","n":"ñ","o":"ð","p":"þ","q":"q","r":"r","s":"§","t":"†","u":"µ","v":"v","w":"w","x":"x","y":"¥","z":"z"},
    16:{"a":"α","b":"в","c":"¢","d":"∂","e":"є","f":"ƒ","g":"g","h":"н","i":"ι","j":"נ","k":"к","l":"ℓ","m":"м","n":"η","o":"σ","p":"ρ","q":"q","r":"я","s":"ѕ","t":"т","u":"υ","v":"ν","w":"ω","x":"χ","y":"у","z":"z"},
    17:{"a":"ą","b":"ҍ","c":"ç","d":"ժ","e":"ҽ","f":"ƒ","g":"ց","h":"հ","i":"ì","j":"ʝ","k":"ҟ","l":"Ӏ","m":"ʍ","n":"ղ","o":"օ","p":"ք","q":"զ","r":"ɾ","s":"ʂ","t":"է","u":"մ","v":"ѵ","w":"ա","x":"×","y":"վ","z":"Հ"},
    18:{"a":"Λ","b":"B","c":"ᄃ","d":"D","e":"Σ","f":"F","g":"G","h":"Ή","i":"I","j":"J","k":"K","l":"ᄂ","m":"M","n":"П","o":"Ө","p":"P","q":"Q","r":"Я","s":"Ƨ","t":"Ƭ","u":"Ц","v":"V","w":"Щ","x":"X","y":"Y","z":"Z"},
    19:{"a":"ₐ","b":"b","c":"c","d":"d","e":"ₑ","f":"f","g":"g","h":"ₕ","i":"ᵢ","j":"ⱼ","k":"ₖ","l":"ₗ","m":"ₘ","n":"ₙ","o":"ₒ","p":"ₚ","q":"q","r":"ᵣ","s":"ₛ","t":"ₜ","u":"ᵤ","v":"ᵥ","w":"w","x":"ₓ","y":"y","z":"z"},
    20:{"a":"ᵃ","b":"ᵇ","c":"ᶜ","d":"ᵈ","e":"ᵉ","f":"ᶠ","g":"ᵍ","h":"ʰ","i":"ⁱ","j":"ʲ","k":"ᵏ","l":"ˡ","m":"ᵐ","n":"ⁿ","o":"ᵒ","p":"ᵖ","q":"q","r":"ʳ","s":"ˢ","t":"ᵗ","u":"ᵘ","v":"ᵛ","w":"ʷ","x":"ˣ","y":"ʸ","z":"ᶻ"},
    21:{"a":"ⓐ","b":"ⓑ","c":"ⓒ","d":"ⓓ","e":"ⓔ","f":"ⓕ","g":"ⓖ","h":"ⓗ","i":"ⓘ","j":"ⓙ","k":"ⓚ","l":"ⓛ","m":"ⓜ","n":"ⓝ","o":"ⓞ","p":"ⓟ","q":"ⓠ","r":"ⓡ","s":"ⓢ","t":"ⓣ","u":"ⓤ","v":"ⓥ","w":"ⓦ","x":"ⓧ","y":"ⓨ","z":"ⓩ"},
    22:{"a":"🅰","b":"🅱","c":"🅲","d":"🅳","e":"🅴","f":"🅵","g":"🅶","h":"🅷","i":"🅸","j":"🅹","k":"🅺","l":"🅻","m":"🅼","n":"🅽","o":"🅾","p":"🅿","q":"🆀","r":"🆁","s":"🆂","t":"🆃","u":"🆄","v":"🆅","w":"🆆","x":"🆇","y":"🆈","z":"🆉"},
    23:{"a":"🄱","b":"🄻","c":"🄾","d":"🄾","e":"🄳","f":"🅈","g":"🅁","h":"🄾","i":"🅂","j":"🄴","k":"🄰","l":"🄳","m":"🅅","n":"🄰","o":"🄽","p":"🄲","q":"🄴","r":"🄳","s":"🄻","t":"🄾","u":"🄶","v":"🄾","w":"🅂","x":"🅃","y":"🅈","z":"🄻"},
    24:{"a":"ᗩ","b":"ᗷ","c":"ᑕ","d":"ᗪ","e":"E","f":"ᖴ","g":"G","h":"ᕼ","i":"I","j":"ᒍ","k":"K","l":"ᒪ","m":"ᗰ","n":"ᑎ","o":"O","p":"ᑭ","q":"ᑫ","r":"ᖇ","s":"ᔕ","t":"T","u":"ᑌ","v":"ᐯ","w":"ᗯ","x":"᙭","y":"Y","z":"ᘔ"},
    25:{"a":"Ａ","b":"Ｂ","c":"Ｃ","d":"Ｄ","e":"Ｅ","f":"Ｆ","g":"Ｇ","h":"Ｈ","i":"Ｉ","j":"Ｊ","k":"Ｋ","l":"Ｌ","m":"Ｍ","n":"Ｎ","o":"Ｏ","p":"Ｐ","q":"Ｑ","r":"Ｒ","s":"Ｓ","t":"Ｔ","u":"Ｕ","v":"Ｖ","w":"Ｗ","x":"Ｘ","y":"Ｙ","z":"Ｚ"},
    26:{"a":"ɐ","b":"q","c":"ɔ","d":"p","e":"ǝ","f":"ɟ","g":"ƃ","h":"ɥ","i":"ᴉ","j":"ɾ","k":"ʞ","l":"l","m":"ɯ","n":"u","o":"o","p":"d","q":"b","r":"ɹ","s":"s","t":"ʇ","u":"n","v":"ʌ","w":"ʍ","x":"x","y":"ʎ","z":"z"},
    27:{"a":"[̲̅a̲̅]","b":"[̲̅b̲̅]","c":"[̲̅c̲̅]","d":"[̲̅d̲̅]","e":"[̲̅e̲̅]","f":"[̲̅f̲̅]","g":"[̲̅g̲̅]","h":"[̲̅h̲̅]","i":"[̲̅i̲̅]","j":"[̲̅j̲̅]","k":"[̲̅k̲̅]","l":"[̲̅l̲̅]","m":"[̲̅m̲̅]","n":"[̲̅n̲̅]","o":"[̲̅o̲̅]","p":"[̲̅p̲̅]","q":"[̲̅q̲̅]","r":"[̲̅r̲̅]","s":"[̲̅s̲̅]","t":"[̲̅t̲̅]","u":"[̲̅u̲̅]","v":"[̲̅v̲̅]","w":"[̲̅w̲̅]","x":"[̲̅x̲̅]","y":"[̲̅y̲̅]","z":"[̲̅z̲̅]"},
    28:{"a":"a̶","b":"b̶","c":"c̶","d":"d̶","e":"e̶","f":"f̶","g":"g̶","h":"h̶","i":"i̶","j":"j̶","k":"k̶","l":"l̶","m":"m̶","n":"n̶","o":"o̶","p":"p̶","q":"q̶","r":"r̶","s":"s̶","t":"t̶","u":"u̶","v":"v̶","w":"w̶","x":"x̶","y":"y̶","z":"z̶"},
    29:{"a":"a̴","b":"b̴","c":"c̴","d":"d̴","e":"e̴","f":"f̴","g":"g̴","h":"h̴","i":"i̴","j":"j̴","k":"k̴","l":"l̴","m":"m̴","n":"n̴","o":"o̴","p":"p̴","q":"q̴","r":"r̴","s":"s̴","t":"t̴","u":"u̴","v":"v̴","w":"w̴","x":"x̴","y":"y̴","z":"z̴"},
    30:{"a":"a̷","b":"b̷","c":"c̷","d":"d̷","e":"e̷","f":"f̷","g":"g̷","h":"h̷","i":"i̷","j":"j̷","k":"k̷","l":"l̷","m":"m̷","n":"n̷","o":"o̷","p":"p̷","q":"q̷","r":"r̷","s":"s̷","t":"t̷","u":"u̷","v":"v̷","w":"w̷","x":"x̷","y":"y̷","z":"z̷"},
    31:{"a":"𝔞","b":"𝔟","c":"𝔠","d":"𝔡","e":"𝔢","f":"𝔣","g":"𝔤","h":"𝔥","i":"𝔦","j":"𝔧","k":"𝔨","l":"𝔩","m":"𝔪","n":"𝔫","o":"𝔬","p":"𝔭","q":"𝔮","r":"𝔯","s":"𝔰","t":"𝔱","u":"𝔲","v":"𝔳","w":"𝔴","x":"𝔵","y":"𝔶","z":"𝔷"},
    32:{"a":"𝖇","b":"𝖑","c":"𝖔","d":"𝖔","e":"𝖉","f":"𝖞","g":"𝖗","h":"𝖔","i":"𝖘","j":"𝖊","k":"𝖆","l":"𝖉","m":"𝖛","n":"𝖆","o":"𝖓","p":"𝖈","q":"𝖊","r":"𝖉","s":"𝖑","t":"𝖔","u":"𝖌","v":"𝖔","w":"𝖘","x":"𝖙","y":"𝖞","z":"𝖑"},
    33:{"a":"𝓪","b":"𝓫","c":"𝓬","d":"𝓭","e":"𝓮","f":"𝓯","g":"𝓰","h":"𝓱","i":"𝓲","j":"𝓳","k":"𝓴","l":"𝓵","m":"𝓶","n":"𝓷","o":"𝓸","p":"𝓹","q":"𝓺","r":"𝓻","s":"𝓼","t":"𝓽","u":"𝓾","v":"𝓿","w":"𝔀","x":"𝔁","y":"𝔂","z":"𝔃"},
    34:{"a":"𝕒","b":"𝕓","c":"𝕔","d":"𝕕","e":"𝕖","f":"𝕗","g":"𝕘","h":"𝕙","i":"𝕚","j":"𝕛","k":"𝕜","l":"𝕝","m":"𝕞","n":"𝕟","o":"𝕠","p":"𝕡","q":"𝕢","r":"𝕣","s":"𝕤","t":"𝕥","u":"𝕦","v":"𝕧","w":"𝕨","x":"𝕩","y":"𝕪","z":"𝕫"},
    35:{"a":"ᴀ","b":"ʙ","c":"ᴄ","d":"ᴅ","e":"ᴇ","f":"ғ","g":"ɢ","h":"ʜ","i":"ɪ","j":"ᴊ","k":"ᴋ","l":"ʟ","m":"ᴍ","n":"ɴ","o":"ᴏ","p":"ᴘ","q":"ǫ","r":"ʀ","s":"s","t":"ᴛ","u":"ᴜ","v":"ᴠ","w":"ᴡ","x":"x","y":"ʏ","z":"ᴢ"},
    36:{"a":"𝒂","b":"𝒃","c":"𝒄","d":"𝒅","e":"𝒆","f":"𝒇","g":"𝒈","h":"𝒉","i":"𝒊","j":"𝒋","k":"𝒌","l":"𝒍","m":"𝒎","n":"𝒏","o":"𝒐","p":"𝒑","q":"𝒒","r":"𝒓","s":"𝒔","t":"𝒕","u":"𝒖","v":"𝒗","w":"𝒘","x":"𝒙","y":"𝒚","z":"𝒛"},
    37:{"a":"ꪖ","b":"᥇","c":"ᥴ","d":"ᦔ","e":"ꫀ","f":"ᠻ","g":"ᧁ","h":"ꫝ","i":"ﺃ","j":"꠹","k":"ᛕ","l":"ꪶ","m":"ꪑ","n":"ꪀ","o":"ꪮ","p":"ᜣ","q":"ꪇ","r":"᥅","s":"ᦓ","t":"ꪻ","u":"ꪊ","v":"ꪜ","w":"᭙","x":"᥊","y":"ꪗ","z":"ɀ"},
    38:{"a":"Ⱥ","b":"Ƀ","c":"Ȼ","d":"Đ","e":"Ɇ","f":"Ꞙ","g":"Ǥ","h":"Ħ","i":"Ɨ","j":"Ɉ","k":"Ꝁ","l":"Ł","m":"M","n":"N","o":"Ø","p":"Ᵽ","q":"Q","r":"Ɍ","s":"S","t":"Ŧ","u":"U","v":"V","w":"W","x":"X","y":"Y","z":"Ƶ"},
    39:{"a":"ᗩ","b":"ᗷ","c":"ᑕ","d":"ᗪ","e":"E","f":"ᖴ","g":"G","h":"ᕼ","i":"I","j":"ᒍ","k":"K","l":"ᒪ","m":"ᗰ","n":"ᑎ","o":"O","p":"ᑭ","q":"ᑫ","r":"ᖇ","s":"ᔕ","t":"T","u":"ᑌ","v":"ᐯ","w":"ᗯ","x":"᙭","y":"Y","z":"ᘔ"},
    40:{"a":"ค","b":"ც","c":"ς","d":"๔","e":"є","f":"Ŧ","g":"ﻮ","h":"ђ","i":"เ","j":"ן","k":"к","l":"ɭ","m":"๓","n":"ภ","o":"๏","p":"ק","q":"ợ","r":"г","s":"ร","t":"Շ","u":"ย","v":"ש","w":"ฬ","x":"א","y":"ץ","z":"չ"},
    41:{"a":"🅐","b":"🅑","c":"🅒","d":"🅓","e":"🅔","f":"🅕","g":"🅖","h":"🅗","i":"🅘","j":"🅙","k":"🅚","l":"🅛","m":"🅜","n":"🅝","o":"🅞","p":"🅟","q":"🅠","r":"🅡","s":"🅂","t":"🅣","u":"🅤","v":"🅥","w":"🅦","x":"🅧","y":"🅨","z":"🅩"},
    42:{"a":"🅰","b":"🅱","c":"🅲","d":"🅳","e":"🅴","f":"🅵","g":"🅶","h":"🅷","i":"🅸","j":"🅹","k":"🅺","l":"🅻","m":"🅼","n":"🅽","o":"🅾","p":"🅿","q":"🆀","r":"🆁","s":"🆂","t":"🆃","u":"🆄","v":"🆅","w":"🆆","x":"🆇","y":"🆈","z":"🆉"},
    43:{"a":"ₐ","b":"ᵦ","c":"꜀","d":"d","e":"ₑ","f":"f","g":"₉","h":"ₕ","i":"ᵢ","j":"ⱼ","k":"ₖ","l":"ₗ","m":"ₘ","n":"ₙ","o":"ₒ","p":"ₚ","q":"q","r":"ᵣ","s":"ₛ","t":"ₜ","u":"ᵤ","v":"ᵥ","w":"w","x":"ₓ","y":"y","z":"₂"},
    44:{"a":"ᵃ","b":"ᵇ","c":"ᶜ","d":"ᵈ","e":"ᵉ","f":"ᶠ","g":"ᵍ","h":"ʰ","i":"ⁱ","j":"ʲ","k":"ᵏ","l":"ˡ","m":"ᵐ","n":"ⁿ","o":"ᵒ","p":"ᵖ","q":"q","r":"ʳ","s":"ˢ","t":"ᵗ","u":"ᵘ","v":"ᵛ","w":"ʷ","x":"ˣ","y":"ʸ","z":"ᶻ"},
    45:{"a":"🇦","b":"🇧","c":"🇨","d":"🇩","e":"🇪","f":"🇫","g":"🇬","h":"🇭","i":"🇮","j":"🇯","k":"🇰","l":"🇱","m":"🇲","n":"🇳","o":"🇴","p":"🇵","q":"🇶","r":"🇷","s":"🇸","t":"🇹","u":"🇺","v":"🇻","w":"🇼","x":"🇽","y":"🇾","z":"🇿"},
    46:{"a":"λ","b":"β","c":"ς","d":"δ","e":"ε","f":"φ","g":"γ","h":"η","i":"ι","j":"ξ","k":"κ","l":"λ","m":"μ","n":"ν","o":"ο","p":"π","q":"ψ","r":"ρ","s":"σ","t":"τ","u":"υ","v":"ν","w":"ω","x":"χ","y":"ψ","z":"ζ"},
    47:{"a":"ค","b":"乃","c":"⊂","d":"Ð","e":"モ","f":"ち","g":"ム","h":"れ","i":"工","j":"Ｊ","k":"Ｋ","l":"し","m":"爪","n":"れ","o":"口","p":"ㄗ","q":"Ｑ","r":"尺","s":"ち","t":"匕","u":"∪","v":"∨","w":"山","x":"メ","y":"ㄚ","z":"乙"},
    48:{"a":"ᗩ","b":"ᗷ","c":"ᑕ","d":"ᗪ","e":"E","f":"ᖴ","g":"G","h":"ᕼ","i":"I","j":"ᒍ","k":"K","l":"ᒪ","m":"ᗰ","n":"ᑎ","o":"O","p":"ᑭ","q":"ᑫ","r":"ᖇ","s":"ᔕ","t":"T","u":"ᑌ","v":"ᐯ","w":"ᗯ","x":"᙭","y":"Y","z":"ᘔ"},
    49:{"a":"α","b":"в","c":"¢","d":"∂","e":"є","f":"ƒ","g":"g","h":"н","i":"ι","j":"נ","k":"к","l":"ℓ","m":"м","n":"η","o":"σ","p":"ρ","q":"q","r":"я","s":"ѕ","t":"т","u":"υ","v":"ν","w":"ω","x":"χ","y":"у","z":"z"},
    50:{"a":"𝕒","b":"𝕓","c":"𝕔","d":"𝕕","e":"𝕖","f":"𝕗","g":"𝕘","h":"𝕙","i":"𝕚","j":"𝕛","k":"𝕜","l":"𝕝","m":"𝕞","n":"𝕟","o":"𝕠","p":"𝕡","q":"𝕢","r":"𝕣","s":"𝕤","t":"𝕥","u":"𝕦","v":"𝕧","w":"𝕨","x":"𝕩","y":"𝕪","z":"𝕫"},
    51:{"a":"₳","b":"฿","c":"₵","d":"Đ","e":"Ɇ","f":"₣","g":"₲","h":"Ⱨ","i":"ł","j":"J","k":"₭","l":"Ⱡ","m":"₥","n":"₦","o":"Ø","p":"₱","q":"Q","r":"Ɽ","s":"₴","t":"₮","u":"Ʉ","v":"V","w":"₩","x":"Ӿ","y":"Ɏ","z":"Ⱬ"},
    52:{"a":"ᗩ","b":"ᗷ","c":"ᑕ","d":"ᗪ","e":"E","f":"ᖴ","g":"G","h":"ᕼ","i":"I","j":"ᒍ","k":"K","l":"ᒪ","m":"ᗰ","n":"ᑎ","o":"O","p":"ᑭ","q":"ᑫ","r":"ᖇ","s":"ᔕ","t":"T","u":"ᑌ","v":"ᐯ","w":"ᗯ","x":"᙭","y":"Y","z":"ᘔ"},
    53:{"a":"ą","b":"ҍ","c":"ç","d":"ժ","e":"ҽ","f":"ƒ","g":"ց","h":"հ","i":"ì","j":"ʝ","k":"ҟ","l":"Ӏ","m":"ʍ","n":"ղ","o":"օ","p":"ք","q":"զ","r":"ɾ","s":"ʂ","t":"է","u":"մ","v":"ѵ","w":"ա","x":"×","y":"վ","z":"Հ"},
    54:{"a":"卂","b":"乃","c":"匚","d":"刀","e":"乇","f":"下","g":"厶","h":"卄","i":"工","j":"丁","k":"长","l":"乚","m":"爪","n":"𠂉","o":"口","p":"尸","q":" tenterhook","r":"尺","s":"丂","t":"丁","u":"凵","v":"レ","w":"山","x":"乂","y":"丫","z":"乙"},
    55:{"a":"ค","b":"๒","c":"ς","d":"๔","e":"є","f":"Ŧ","g":"ﻮ","h":"ђ","i":"เ","j":"ן","k":"к","l":"ɭ","m":"๓","n":"ภ","o":"๏","p":"ק","q":"ợ","r":"г","s":"ร","t":"Շ","u":"ย","v":"ש","w":"ฬ","x":"א","y":"ץ","z":"չ"},
    56:{"a":"Ⱥ","b":"Ƀ","c":"Ȼ","d":"Đ","e":"Ɇ","f":"Ꞙ","g":"Ǥ","h":"Ħ","i":"Ɨ","j":"Ɉ","k":"Ꝁ","l":"Ł","m":"M","n":"N","o":"Ø","p":"Ᵽ","q":"Q","r":"Ɍ","s":"S","t":"Ŧ","u":"U","v":"V","w":"W","x":"X","y":"Y","z":"Ƶ"},
    57:{"a":"🅰","b":"🅱","c":"🅲","d":"🅳","e":"🅴","f":"🅵","g":"🅶","h":"🅷","i":"🅸","j":"🅹","k":"🅺","l":"🅻","m":"🅼","n":"🅽","o":"🅾","p":"🅿","q":"🆀","r":"🆁","s":"🆂","t":"🆃","u":"🆄","v":"🆅","w":"🆆","x":"🆇","y":"🆈","z":"🆉"},
    58:{"a":"a","b":"b","c":"c","d":"d","e":"e","f":"f","g":"g","h":"h","i":"i","j":"j","k":"k","l":"l","m":"m","n":"n","o":"o","p":"p","q":"q","r":"r","s":"s","t":"t","u":"u","v":"v","w":"w","x":"x","y":"y","z":"z"},
    59:{"a":"🅐","b":"🅑","c":"🅒","d":"🅓","e":"🅔","f":"🅕","g":"🅖","h":"🅗","i":"🅘","j":"🅙","k":"🅚","l":"🅛","m":"🅜","n":"🅝","o":"🅞","p":"🅟","q":"🅠","r":"🅡","s":"🅂","t":"🅣","u":"🅤","v":"🅥","w":"🅦","x":"🅧","y":"🅨","z":"🅩"},
    60:{"a":"ᗩ","b":"ᗷ","c":"ᑕ","d":"ᗪ","e":"E","f":"ᖴ","g":"G","h":"ᕼ","i":"I","j":"ᒍ","k":"K","l":"ᒪ","m":"ᗰ","n":"ᑎ","o":"O","p":"ᑭ","q":"ᑫ","r":"ᖇ","s":"ᔕ","t":"T","u":"ᑌ","v":"ᐯ","w":"ᗯ","x":"᙭","y":"Y","z":"ᘔ"},
    61:{"a":"ค","b":"ც","c":"ς","d":"๔","e":"є","f":"Ŧ","g":"ﻮ","h":"ђ","i":"เ","j":"ן","k":"к","l":"ɭ","m":"๓","n":"ภ","o":"๏","p":"ק","q":"ợ","r":"г","s":"ร","t":"Շ","u":"ย","v":"ש","w":"ฬ","x":"א","y":"ץ","z":"չ"},
    62:{"a":"[̲̅a̲̅]","b":"[̲̅b̲̅]","c":"[̲̅c̲̅]","d":"[̲̅d̲̅]","e":"[̲̅e̲̅]","f":"[̲̅f̲̅]","g":"[̲̅g̲̅]","h":"[̲̅h̲̅]","i":"[̲̅i̲̅]","j":"[̲̅j̲̅]","k":"[̲̅k̲̅]","l":"[̲̅l̲̅]","m":"[̲̅m̲̅]","n":"[̲̅n̲̅]","o":"[̲̅o̲̅]","p":"[̲̅p̲̅]","q":"[̲̅q̲̅]","r":"[̲̅r̲̅]","s":"[̲̅s̲̅]","t":"[̲̅t̲̅]","u":"[̲̅u̲̅]","v":"[̲̅v̲̅]","w":"[̲̅w̲̅]","x":"[̲̅x̲̅]","y":"[̲̅y̲̅]","z":"[̲̅z̲̅]"},
    63:{"a":"a̶","b":"b̶","c":"c̶","d":"d̶","e":"e̶","f":"f̶","g":"g̶","h":"h̶","i":"i̶","j":"j̶","k":"k̶","l":"l̶","m":"m̶","n":"n̶","o":"o̶","p":"p̶","q":"q̶","r":"r̶","s":"s̶","t":"t̶","u":"u̶","v":"v̶","w":"w̶","x":"x̶","y":"y̶","z":"z̶"},
    64:{"a":"a̴","b":"b̴","c":"c̴","d":"d̴","e":"e̴","f":"f̴","g":"g̴","h":"h̴","i":"i̴","j":"j̴","k":"k̴","l":"l̴","m":"m̴","n":"n̴","o":"o̴","p":"p̴","q":"q̴","r":"r̴","s":"s̴","t":"t̴","u":"u̴","v":"v̴","w":"w̴","x":"x̴","y":"y̴","z":"z̴"},
    65:{"a":"a̷","b":"b̷","c":"c̷","d":"d̷","e":"e̷","f":"f̷","g":"g̷","h":"h̷","i":"i̷","j":"j̷","k":"k̷","l":"l̷","m":"m̷","n":"n̷","o":"o̷","p":"p̷","q":"q̷","r":"r̷","s":"s̷","t":"t̷","u":"u̷","v":"v̷","w":"w̷","x":"x̷","y":"y̷","z":"z̷"},
    66:{"a":"ⓐ","b":"ⓑ","c":"ⓒ","d":"ⓓ","e":"ⓔ","f":"ⓕ","g":"ⓖ","h":"ⓗ","i":"ⓘ","j":"ⓙ","k":"ⓚ","l":"ⓛ","m":"ⓜ","n":"ⓝ","o":"ⓞ","p":"ⓟ","q":"ⓠ","r":"ⓡ","s":"ⓢ","t":"ⓣ","u":"ⓤ","v":"ⓥ","w":"ⓦ","x":"ⓧ","y":"ⓨ","z":"ⓩ"},
    67:{"a":"🅐","b":"🅑","c":"🅒","d":"🅓","e":"🅔","f":"🅕","g":"🅖","h":"🅗","i":"🅘","j":"🅙","k":"🅚","l":"🅛","m":"🅜","n":"🅝","o":"🅞","p":"🅟","q":"🅠","r":"🅡","s":"🅂","t":"🅣","u":"🅤","v":"🅥","w":"🅦","x":"🅧","y":"🅨","z":"🅩"},
    68:{"a":"🄰","b":"🄱","c":"🄲","d":"🄳","e":"🄴","f":"🄵","g":"🄶","h":"🄷","i":"🄸","j":"🄹","k":"🄺","l":"🄻","m":"🄼","n":"🄽","o":"🄾","p":"🄿","q":"🅀","r":"🅁","s":"🅂","t":"🅃","u":"🅄","v":"🅅","w":"🅆","x":"🅇","y":"🅈","z":"🅉"},
    69:{"a":"🅰","b":"🅱","c":"🅲","d":"🅳","e":"🅴","f":"🅵","g":"🅶","h":"🅷","i":"🅸","j":"🅹","k":"🅺","l":"🅻","m":"🅼","n":"🅽","o":"🅾","p":"🅿","q":"🆀","r":"🆁","s":"🆂","t":"🆃","u":"🆄","v":"🆅","w":"🆆","x":"🆇","y":"🆈","z":"🆉"},
    70:{"a":"₳","b":"฿","c":"₵","d":"Đ","e":"Ɇ","f":"₣","g":"₲","h":"Ⱨ","i":"ł","j":"J","k":"₭","l":"Ⱡ","m":"₥","n":"₦","o":"Ø","p":"₱","q":"Q","r":"Ɽ","s":"₴","t":"₮","u":"Ʉ","v":"V","w":"₩","x":"Ӿ","y":"Ɏ","z":"Ⱬ"},
    71:{"a":"ǟ","b":"ɮ","c":"ƈ","d":"ɖ","e":"ɛ","f":"ʄ","g":"ɢ","h":"ɦ","i":"ɨ","j":"ʝ","k":"ӄ","l":"ʟ","m":"ʍ","n":"ռ","o":"օ","p":"ք","q":"զ","r":"ʀ","s":"ֆ","t":"ȶ","u":"ʊ","v":"ʋ","w":"ա","x":"Ӽ","y":"ʏ","z":"ʐ"},
    72:{"a":"Ꮧ","b":"Ᏸ","c":"ፈ","d":"Ꮄ","e":"Ꮛ","f":"Ꭶ","g":"Ꮆ","h":"Ꮒ","i":"Ꭵ","j":"Ꮰ","k":"Ꮶ","l":"Ꮭ","m":"Ꮇ","n":"Ꮑ","o":"Ꭷ","p":"Ꭾ","q":"Ꭴ","r":"Ꮢ","s":"Ꮥ","t":"Ꮦ","u":"Ꮼ","v":"Ꮙ","w":"Ꮗ","x":"ጀ","y":"Ꭹ","z":"ፚ"},
    73:{"a":"ą","b":"ҍ","c":"ç","d":"ժ","e":"ҽ","f":"ƒ","g":"ց","h":"հ","i":"ì","j":"ʝ","k":"ҟ","l":"Ӏ","m":"ʍ","n":"ղ","o":"օ","p":"ք","q":"զ","r":"ɾ","s":"ʂ","t":"է","u":"մ","v":"ѵ","w":"ա","x":"×","y":"վ","z":"Հ"},
    74:{"a":"ค","b":"๒","c":"ς","d":"๔","e":"є","f":"Ŧ","g":"ﻮ","h":"ђ","i":"เ","j":"ן","k":"к","l":"ɭ","m":"๓","n":"ภ","o":"๏","p":"ק","q":"ợ","r":"г","s":"ร","t":"Շ","u":"ย","v":"ש","w":"ฬ","x":"א","y":"ץ","z":"չ"},
    75:{"a":"ᗩ","b":"ᗷ","c":"ᑕ","d":"ᗪ","e":"E","f":"ᖴ","g":"G","h":"ᕼ","i":"I","j":"ᒍ","k":"K","l":"ᒪ","m":"ᗰ","n":"ᑎ","o":"O","p":"ᑭ","q":"ᑫ","r":"ᖇ","s":"ᔕ","t":"T","u":"ᑌ","v":"ᐯ","w":"ᗯ","x":"᙭","y":"Y","z":"ᘔ"},
    76:{"a":"α","b":"в","c":"¢","d":"∂","e":"є","f":"ƒ","g":"g","h":"н","i":"ι","j":"נ","k":"к","l":"ℓ","m":"м","n":"η","o":"σ","p":"ρ","q":"q","r":"я","s":"ѕ","t":"т","u":"υ","v":"ν","w":"ω","x":"χ","y":"у","z":"z"},
    77:{"a":"𝕒","b":"𝕓","c":"𝕔","d":"𝕕","e":"𝕖","f":"𝕗","g":"𝕘","h":"𝕙","i":"𝕚","j":"𝕛","k":"𝕜","l":"𝕝","m":"𝕞","n":"𝕟","o":"𝕠","p":"𝕡","q":"𝕢","r":"𝕣","s":"𝕤","t":"𝕥","u":"𝕦","v":"𝕧","w":"𝕨","x":"𝕩","y":"𝕪","z":"𝕫"},
    78:{"a":"𝖆","b":"𝖇","c":"𝖈","d":"𝖉","e":"𝖊","f":"𝖋","g":"𝖌","h":"𝖍","i":"𝖎","j":"𝖏","k":"𝖐","l":"𝖑","m":"𝖒","n":"𝖓","o":"𝖔","p":"𝖕","q":"𝖖","r":"𝖗","s":"𝖘","t":"𝖙","u":"𝖚","v":"𝖛","w":"𝖜","x":"𝖝","y":"𝖞","z":"𝖟"},
    79:{"a":"𝓪","b":"𝓫","c":"𝓬","d":"𝓭","e":"𝓮","f":"𝓯","g":"𝓰","h":"𝓱","i":"𝓲","j":"𝓳","k":"𝓴","l":"𝓵","m":"𝓶","n":"𝓷","o":"𝓸","p":"𝓹","q":"𝓺","r":"𝓻","s":"𝓼","t":"𝓽","u":"𝓾","v":"𝓿","w":"𝔀","x":"𝔁","y":"𝔂","z":"𝔃"},
    80:{"a":"𝔞","b":"𝔟","c":"𝔠","d":"𝔡","e":"𝔢","f":"𝔣","g":"𝔤","h":"𝔥","i":"𝔦","j":"𝔧","k":"𝔨","l":"𝔩","m":"𝔪","n":"𝔫","o":"𝔬","p":"𝔭","q":"𝔮","r":"𝔯","s":"𝔰","t":"𝔱","u":"𝔲","v":"𝔳","w":"𝔴","x":"𝔵","y":"𝔶","z":"𝔷"}
    };

    const applyStyle = (text, styleId) => {
        const style = fancyStyles[styleId];
        if (!style) return null;
        return [...text.toLowerCase()].map(char => style[char] || char).join('');
    };

    // 🔹 FAKE META CARD
    const fakeMeta = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_STYLE_${Date.now()}` },
        message: { contactMessage: { displayName: "LORD INDUMINA 💉", vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    try {
        // 🚀 SCENARIO 1: OPEN MENU (No args)
        if (args.length === 0) {
            let { key } = await socket.sendMessage(from, { text: "🌹 *B L O O D Y  R O S E  F O N T S . . .*" }, { quoted: fakeMeta });
            const loadingBars = ["🌹 🎨 [▒▒▒▒▒▒] 10%", "🌹 🎨 [██▒▒▒▒] 40%", "🌹 🎨 [████▒▒] 70%", "🌹 🎨 [██████] 100%"];
            for (let bar of loadingBars) {
                await new Promise(r => setTimeout(r, 300));
                await socket.sendMessage(from, { text: bar, edit: key });
            }

            let menu = `✨ *B L O O D Y  R O S E  F O N T S* ✨\n\n`;
            Object.keys(fancyStyles).slice(0, 15).forEach(id => {
                menu += `*${id}* ➜ ${applyStyle('Indumina', id)}\n`;
            });
            menu += `\n──────────────────────\n`;
            menu += `📝 *Usage:* \`.style <num> <text>\`\n💡 *Tip:* \`.style all <text>\` to see all!\n\n> *Created by Lord Indumina 🩸*`;

            await socket.sendMessage(from, { delete: key });
            return await socket.sendMessage(from, { 
                image: { url: selectedPhoto }, 
                caption: menu,
                contextInfo: { externalAdReply: { title: "FANCY FONT MENU", body: "Lord Indumina 💉", thumbnailUrl: myPhoto, mediaType: 1, renderLargerThumbnail: false }}
            }, { quoted: fakeMeta });
        }

        // 🚀 SCENARIO 2: SHOW ALL STYLES
        if (args[0].toLowerCase() === 'all') {
            const inputText = args.slice(1).join(' ');
            if (!inputText) return socket.sendMessage(from, { text: "⚠️ *Master, please provide text!*" });

            let allMsg = `✨ *B L O O D Y  R O S E  A L L  S T Y L E S* ✨\n\n`;
            Object.keys(fancyStyles).forEach(id => {
                allMsg += `*${id}* ➜ \`${applyStyle(inputText, id)}\`\n\n`;
            });

            return await socket.sendMessage(from, { 
                image: { url: selectedPhoto }, 
                caption: allMsg + `\n> *Created by Lord Indumina 🩸*`,
                contextInfo: { externalAdReply: { title: "80 STYLES GENERATED", body: inputText, thumbnailUrl: myPhoto, mediaType: 1, renderLargerThumbnail: false }}
            }, { quoted: fakeMeta });
        }

        // 🚀 SCENARIO 3: APPLY SPECIFIC STYLE
        const styleNumber = parseInt(args[0]);
        const inputText = args.slice(1).join(' ');
        const styledText = applyStyle(inputText, styleNumber);

        if (!styledText) return socket.sendMessage(from, { text: `❌ *Style number එක වැරදියි මචං!*` });

        await socket.sendMessage(from, { react: { text: "✍️", key: msg.key } });
        await socket.sendMessage(from, { text: styledText }, { quoted: msg });

    } catch (e) {
        console.log(e);
        await socket.sendMessage(from, { text: "❌ *Error!*" });
    }
    break;
}
case 'mediafire':
case 'mf':
case 'mfdl': {
    try {
        const text = args.join(" ").trim();
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

        // 🔹 FAKE META CARD (Privacy Protected)
        const fakeMeta = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_MF_${Date.now()}` },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        if (!text) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Master, please provide a MediaFire link!*\n\n*Usage:* `.mediafire <url>`'
            }, { quoted: fakeMeta });
        }

        await socket.sendMessage(sender, { react: { text: '📥', key: msg.key } });

        // 🚀 LONG LOADING BAR ANIMATION
        let { key } = await socket.sendMessage(from, { text: "🌹 *B L O O D Y  R O S E  M E D I A F I R E  F E T C H I N G . . .*" }, { quoted: fakeMeta });
        const loadingBars = [
            "🌹 📥 [▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 15%",
            "🌹 📥 [██████▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 40%",
            "🌹 📥 [████████████▒▒▒▒▒▒▒▒] 75%",
            "🌹 📥 [████████████████████] 100%",
            "✨ *FILE INFO RETRIEVED!*"
        ];
        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 350));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        // 🔹 Call API
        let api = `https://tharuzz-ofc-apis.vercel.app/api/download/mediafire?url=${encodeURIComponent(text)}`;
        let { data } = await axios.get(api);

        if (!data.success || !data.result) {
            await socket.sendMessage(from, { text: '❌ *Failed to fetch MediaFire file. Link might be dead!*' }, { edit: key });
            return;
        }

        const result = data.result;
        const filename = result.filename;
        const fileSize = result.size;
        const downloadUrl = result.url;

        const caption = `✨ *B L O O D Y  R O S E  D O W N L O A D E R* ✨\n\n` +
                        `📦 *File:* ${filename}\n` +
                        `📏 *Size:* ${fileSize}\n` +
                        `🌐 *From:* MediaFire\n\n` +
                        `> *Created by Lord Indumina 🩸*`;

        await socket.sendMessage(from, { delete: key }); // Delete loading message

        // 🔹 Send File
        await socket.sendMessage(sender, {
            document: { url: downloadUrl },
            fileName: filename,
            mimetype: 'application/octet-stream',
            caption: caption,
            contextInfo: {
                externalAdReply: {
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: false,
                    title: "MEDIAFIRE DOWNLOADER",
                    body: `File: ${filename}`,
                    sourceUrl: "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: fakeMeta });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error("MediaFire Error:", err);
        await socket.sendMessage(sender, { text: '❌ *Internal Error. Please try again later.*' });
    }
    break;
}
case 'apksearch':
case 'apks':
case 'apkfind': {
    try {
        const query = args.join(" ").trim();
        const myPhoto = 'https://i.postimg.cc/gjkQy2Kd/images-(9).jpg';

        // 🔹 FAKE META CARD (Lord Indumina Signature)
        const fakeMeta = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `BR_APK_${Date.now()}` },
            message: { 
                contactMessage: { 
                    displayName: "LORD INDUMINA 💉", 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:LORD INDUMINA;;;;\nFN:LORD INDUMINA 💉\nORG:Bloody Rose Tech\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };

        if (!query) {
            return await socket.sendMessage(from, {
                text: '🚫 *Master, please provide an app name!*\n\n*Usage:* `.apksearch whatsapp`'
            }, { quoted: fakeMeta });
        }

        await socket.sendMessage(from, { react: { text: '🔍', key: msg.key } });

        // 🚀 BLOODY ROSE LOADING ANIMATION
        let { key } = await socket.sendMessage(from, { text: "🌹 *B L O O D Y  R O S E  A P K  S E A R C H I N G . . .*" }, { quoted: fakeMeta });
        const loadingBars = [
            "🌹 🔍 [▒▒▒▒▒▒▒▒▒▒▒▒] 20%",
            "🌹 🔍 [████▒▒▒▒▒▒▒▒] 50%",
            "🌹 🔍 [████████▒▒▒▒] 80%",
            "🌹 🔍 [████████████] 100%",
            "✨ *RESULTS FOUND!*"
        ];
        for (let bar of loadingBars) {
            await new Promise(res => setTimeout(res, 300));
            await socket.sendMessage(from, { text: bar, edit: key });
        }

        // 🔹 Call API
        const apiUrl = `https://tharuzz-ofc-apis.vercel.app/api/search/apksearch?query=${encodeURIComponent(query)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.success || !data.result || !data.result.length) {
            await socket.sendMessage(from, { text: '❌ *No APKs found for your query. Try another name!*' }, { edit: key });
            return;
        }

        // 🔹 Format results with Elite look
        let resultMsg = `✨ *B L O O D Y  R O S E  A P K  S E A R C H* ✨\n\n`;
        resultMsg += `🔍 *Query:* ${query.toUpperCase()}\n`;
        resultMsg += `──────────────────────\n\n`;

        data.result.slice(0, 15).forEach((item, idx) => {
            resultMsg += `*${idx + 1}* ➜ *${item.name}*\n`;
            resultMsg += `🆔 *ID:* \`${item.id}\`\n\n`;
        });

        resultMsg += `──────────────────────\n`;
        resultMsg += `💡 *Tip:* Use \`.apkdl <ID>\` to download.\n\n`;
        resultMsg += `> *Created by Lord Indumina 🩸*`;

        await socket.sendMessage(from, { delete: key }); // Delete loading msg

        // 🔹 Send final result with AdReply
        await socket.sendMessage(from, {
            image: { url: 'https://i.ibb.co/TDxsJ8gQ/5a6c2a86ca7c.jpg' }, // APK Search wallpaper
            caption: resultMsg,
            contextInfo: {
                externalAdReply: {
                    title: "APK SEARCH ENGINE",
                    body: `Results for: ${query}`,
                    thumbnailUrl: myPhoto,
                    mediaType: 1,
                    renderLargerThumbnail: false,
                    sourceUrl: "https://github.com/Indumina-Lord"
                }
            }
        }, { quoted: fakeMeta });

    } catch (err) {
        console.error("APK Search Error:", err);
        await socket.sendMessage(from, { text: '❌ *Internal Error occurred!*' });
    }
    break;
}case 'xvdl2':
case 'xvnew': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const query = text.split(" ").slice(1).join(" ").trim();

        if (!query) return await socket.sendMessage(sender, { text: '🚫 Please provide a search query.\nExample: .xv mia' }, { quoted: msg });

        // 1️⃣ Send searching message
        await socket.sendMessage(sender, { text: '*⏳ Searching XVideos...*' }, { quoted: msg });

        // 2️⃣ Call search API
        const searchRes = await axios.get(`https://tharuzz-ofc-api-v2.vercel.app/api/search/xvsearch?query=${encodeURIComponent(query)}`);
        const videos = searchRes.data.result?.xvideos?.slice(0, 10);
        if (!videos || videos.length === 0) return await socket.sendMessage(sender, { text: '*❌ No results found.*' }, { quoted: msg });

        // 3️⃣ Prepare list message
        let listMsg = `🔍 *XVideos Results for:* ${query}\n\n`;
        videos.forEach((vid, idx) => {
            listMsg += `*${idx + 1}.* ${vid.title}\n${vid.info}\n➡️ ${vid.link}\n\n`;
        });
        listMsg += '_Reply with the number to download the video._';

        await socket.sendMessage(sender, { text: listMsg }, { quoted: msg });

        // 4️⃣ Cache results for reply handling
        global.xvCache = global.xvCache || {};
        global.xvCache[sender] = videos.map(v => v.link);

    } catch (err) {
        console.error(err);
        await socket.sendMessage(sender, { text: '*❌ Error occurred.*' }, { quoted: msg });
    }
}
break;


// Handle reply to download selected video
case 'xvselect': {
    try {
        const replyText = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const selection = parseInt(replyText);

        const links = global.xvCache?.[sender];
        if (!links || isNaN(selection) || selection < 1 || selection > links.length) {
            return await socket.sendMessage(sender, { text: '🚫 Invalid selection number.' }, { quoted: msg });
        }

        const videoUrl = links[selection - 1];

        await socket.sendMessage(sender, { text: '*⏳ Downloading video...*' }, { quoted: msg });

        // Call download API
        const dlRes = await axios.get(`https://tharuzz-ofc-api-v2.vercel.app/api/download/xvdl?url=${encodeURIComponent(videoUrl)}`);
        const result = dlRes.data.result;

        if (!result) return await socket.sendMessage(sender, { text: '*❌ Failed to fetch video.*' }, { quoted: msg });

        // Send video
        await socket.sendMessage(sender, {
            video: { url: result.dl_Links.highquality },
            caption: `🎥 *${result.title}*\n⏱ Duration: ${result.duration}s`,
            jpegThumbnail: result.thumbnail ? await axios.get(result.thumbnail, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data)) : undefined
        }, { quoted: msg });

        // Clear cache
        delete global.xvCache[sender];

    } catch (err) {
        console.error(err);
        await socket.sendMessage(sender, { text: '*❌ Error downloading video.*' }, { quoted: msg });
    }
}
break;

// ---------------- list saved newsletters (show emojis) ----------------
case 'newslist': {
  try {
    const docs = await listNewslettersFromMongo();
    if (!docs || docs.length === 0) {
      let userCfg = {};
      try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
      const title = userCfg.botName || 'NIKKA MINI BOT AI';
      const shonux = {
          key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_NEWSLIST" },
          message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '📭 No channels saved in DB.' }, { quoted: shonux });
    }

    let txt = '*📚 Saved Newsletter Channels:*\n\n';
    for (const d of docs) {
      txt += `• ${d.jid}\n  Emojis: ${Array.isArray(d.emojis) && d.emojis.length ? d.emojis.join(' ') : '(default)'}\n\n`;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'NIKKA MINI BOT AI';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_NEWSLIST2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('newslist error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'NIKKA MINI BOT AI';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_NEWSLIST3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Failed to list channels.' }, { quoted: shonux });
  }
  break;
}
case 'cid': {
    // Extract query from message
    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    // ✅ Dynamic botName load
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || 'NIKKA MINI BOT AI';

    // ✅ Fake Meta AI vCard (for quoted msg)
    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_CID"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };

    // Clean command prefix (.cid, /cid, !cid, etc.)
    const channelLink = q.replace(/^[.\/!]cid\s*/i, '').trim();

    // Check if link is provided
    if (!channelLink) {
        return await socket.sendMessage(sender, {
            text: '❎ Please provide a WhatsApp Channel link.\n\n📌 *Example:* .cid https://whatsapp.com/channel/123456789'
        }, { quoted: shonux });
    }

    // Validate link
    const match = channelLink.match(/whatsapp\.com\/channel\/([\w-]+)/);
    if (!match) {
        return await socket.sendMessage(sender, {
            text: '⚠️ *Invalid channel link format.*\n\nMake sure it looks like:\nhttps://whatsapp.com/channel/xxxxxxxxx'
        }, { quoted: shonux });
    }

    const inviteId = match[1];

    try {
        // Send fetching message
        await socket.sendMessage(sender, {
            text: `🔎 Fetching channel info for: *${inviteId}*`
        }, { quoted: shonux });

        // Get channel metadata
        const metadata = await socket.newsletterMetadata("invite", inviteId);

        if (!metadata || !metadata.id) {
            return await socket.sendMessage(sender, {
                text: '❌ Channel not found or inaccessible.'
            }, { quoted: shonux });
        }

        // Format details
        const infoText = `
📡 *WhatsApp Channel Info*

🆔 *ID:* ${metadata.id}
📌 *Name:* ${metadata.name}
👥 *Followers:* ${metadata.subscribers?.toLocaleString() || 'N/A'}
📅 *Created on:* ${metadata.creation_time ? new Date(metadata.creation_time * 1000).toLocaleString("si-LK") : 'Unknown'}

_© Powered by ${botName}_
`;

        // Send preview if available
        if (metadata.preview) {
            await socket.sendMessage(sender, {
                image: { url: `https://pps.whatsapp.net${metadata.preview}` },
                caption: infoText
            }, { quoted: shonux });
        } else {
            await socket.sendMessage(sender, {
                text: infoText
            }, { quoted: shonux });
        }

    } catch (err) {
        console.error("CID command error:", err);
        await socket.sendMessage(sender, {
            text: '⚠️ An unexpected error occurred while fetching channel info.'
        }, { quoted: shonux });
    }

    break;
}



case 'addadmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'NIKKA MINI BOT AI';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide a jid or number to add as admin\nExample: .addadmin 9477xxxxxxx' }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'NIKKA MINI BOT AI';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❌ Only owner can add admins.' }, { quoted: shonux });
  }

  try {
    await addAdminToMongo(jidOr);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'NIKKA MINI BOT AI';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Added admin: ${jidOr}` }, { quoted: shonux });
  } catch (e) {
    console.error('addadmin error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'NIKKA MINI BOT AI';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN4" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `❌ Failed to add admin: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'tagall': {
  try {
    if (!from || !from.endsWith('@g.us')) return await socket.sendMessage(sender, { text: '❌ This command can only be used in groups.' }, { quoted: msg });

    let gm = null;
    try { gm = await socket.groupMetadata(from); } catch(e) { gm = null; }
    if (!gm) return await socket.sendMessage(sender, { text: '❌ Failed to fetch group info.' }, { quoted: msg });

    const participants = gm.participants || [];
    if (!participants.length) return await socket.sendMessage(sender, { text: '❌ No members found in the group.' }, { quoted: msg });

    const text = args && args.length ? args.join(' ') : '📢 Announcement';

    let groupPP = 'https://i.ibb.co/9q2mG0Q/default-group.jpg';
    try { groupPP = await socket.profilePictureUrl(from, 'image'); } catch(e){}

    const mentions = participants.map(p => p.id || p.jid);
    const groupName = gm.subject || 'Group';
    const totalMembers = participants.length;

    const emojis = ['📢','🔊','🌐','🛡️','🚀','🎯','🧿','🪩','🌀','💠','🎊','🎧','📣','🗣️'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    // BotName meta mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TAGALL" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let caption = `╭───❰ *📛 Group Announcement* ❱───╮\n`;
    caption += `│ 📌 *Group:* ${groupName}\n`;
    caption += `│ 👥 *Members:* ${totalMembers}\n`;
    caption += `│ 💬 *Message:* ${text}\n`;
    caption += `╰────────────────────────────╯\n\n`;
    caption += `📍 *Mentioning all members below:*\n\n`;
    for (const m of participants) {
      const id = (m.id || m.jid);
      if (!id) continue;
      caption += `${randomEmoji} @${id.split('@')[0]}\n`;
    }
    caption += `\n━━━━━━⊱ *${botName}* ⊰━━━━━━`;

    await socket.sendMessage(from, {
      image: { url: groupPP },
      caption,
      mentions,
    }, { quoted: metaQuote }); // <-- botName meta mention

  } catch (err) {
    console.error('tagall error', err);
    await socket.sendMessage(sender, { text: '❌ Error running tagall.' }, { quoted: msg });
  }
  break;
}

case 'online': {
  try {
    if (!(from || '').endsWith('@g.us')) {
      await socket.sendMessage(sender, { text: '❌ This command works only in group chats.' }, { quoted: msg });
      break;
    }

    let groupMeta;
    try { groupMeta = await socket.groupMetadata(from); } catch (err) { console.error(err); break; }

    const callerJid = (nowsender || '').replace(/:.*$/, '');
    const callerId = callerJid.includes('@') ? callerJid : `${callerJid}@s.whatsapp.net`;
    const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const isOwnerCaller = callerJid.startsWith(ownerNumberClean);
    const groupAdmins = (groupMeta.participants || []).filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);
    const isGroupAdminCaller = groupAdmins.includes(callerId);

    if (!isOwnerCaller && !isGroupAdminCaller) {
      await socket.sendMessage(sender, { text: '❌ Only group admins or the bot owner can use this command.' }, { quoted: msg });
      break;
    }

    try { await socket.sendMessage(sender, { text: '🔄 Scanning for online members... please wait ~15 seconds' }, { quoted: msg }); } catch(e){}

    const participants = (groupMeta.participants || []).map(p => p.id);
    const onlineSet = new Set();
    const presenceListener = (update) => {
      try {
        if (update?.presences) {
          for (const id of Object.keys(update.presences)) {
            const pres = update.presences[id];
            if (pres?.lastKnownPresence && pres.lastKnownPresence !== 'unavailable') onlineSet.add(id);
            if (pres?.available === true) onlineSet.add(id);
          }
        }
      } catch (e) { console.warn('presenceListener error', e); }
    };

    for (const p of participants) {
      try { if (typeof socket.presenceSubscribe === 'function') await socket.presenceSubscribe(p); } catch(e){}
    }
    socket.ev.on('presence.update', presenceListener);

    const checks = 3; const intervalMs = 5000;
    await new Promise((resolve) => { let attempts=0; const iv=setInterval(()=>{ attempts++; if(attempts>=checks){ clearInterval(iv); resolve(); } }, intervalMs); });
    try { socket.ev.off('presence.update', presenceListener); } catch(e){}

    if (onlineSet.size === 0) {
      await socket.sendMessage(sender, { text: '⚠️ No online members detected (they may be hiding presence or offline).' }, { quoted: msg });
      break;
    }

    const onlineArray = Array.from(onlineSet).filter(j => participants.includes(j));
    const mentionList = onlineArray.map(j => j);

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    // BotName meta mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ONLINE" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let txt = `🟢 *Online Members* — ${onlineArray.length}/${participants.length}\n\n`;
    onlineArray.forEach((jid, i) => {
      txt += `${i+1}. @${jid.split('@')[0]}\n`;
    });

    await socket.sendMessage(sender, {
      text: txt.trim(),
      mentions: mentionList
    }, { quoted: metaQuote }); // <-- botName meta mention

  } catch (err) {
    console.error('Error in online command:', err);
    try { await socket.sendMessage(sender, { text: '❌ An error occurred while checking online members.' }, { quoted: msg }); } catch(e){}
  }
  break;
}



case 'deladmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🌹 *B L O O D Y  R O S E * 🌹';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide a jid/number to remove\nExample: .deladmin 9477xxxxxxx' }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🌹 *B L O O D Y  R O S E * 🌹';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❌ Only owner can remove admins.' }, { quoted: shonux });
  }

  try {
    await removeAdminFromMongo(jidOr);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🌹 *B L O O D Y  R O S E * 🌹';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN3" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Removed admin: ${jidOr}` }, { quoted: shonux });
  } catch (e) {
    console.error('deladmin error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🌹 *B L O O D Y  R O S E * 🌹';
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN4" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `❌ Failed to remove admin: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}

case 'admins': {
  try {
    const list = await loadAdminsFromMongo();
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🌹 *B L O O D Y  R O S E * 🌹';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADMINS" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!list || list.length === 0) {
      return await socket.sendMessage(sender, { text: 'No admins configured.' }, { quoted: shonux });
    }

    let txt = '*👑 Admins:*\n\n';
    for (const a of list) txt += `• ${a}\n`;

    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('admins error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🌹 *B L O O D Y  R O S E * 🌹';
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADMINS2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: '❌ Failed to list admins.' }, { quoted: shonux });
  }
  break;
}
case 'setlogo': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change this session logo.' }, { quoted: shonux });
    break;
  }

  const ctxInfo = (msg.message.extendedTextMessage || {}).contextInfo || {};
  const quotedMsg = ctxInfo.quotedMessage;
  const media = await downloadQuotedMedia(quotedMsg).catch(()=>null);
  let logoSetTo = null;

  try {
    if (media && media.buffer) {
      const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
      fs.ensureDirSync(sessionPath);
      const mimeExt = (media.mime && media.mime.split('/').pop()) || 'jpg';
      const logoPath = path.join(sessionPath, `logo.${mimeExt}`);
      fs.writeFileSync(logoPath, media.buffer);
      let cfg = await loadUserConfigFromMongo(sanitized) || {};
      cfg.logo = logoPath;
      await setUserConfigInMongo(sanitized, cfg);
      logoSetTo = logoPath;
    } else if (args && args[0] && (args[0].startsWith('http') || args[0].startsWith('https'))) {
      let cfg = await loadUserConfigFromMongo(sanitized) || {};
      cfg.logo = args[0];
      await setUserConfigInMongo(sanitized, cfg);
      logoSetTo = args[0];
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: '❗ Usage: Reply to an image with `.setlogo` OR provide an image URL: `.setlogo https://example.com/logo.jpg`' }, { quoted: shonux });
      break;
    }

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Logo set for this session: ${logoSetTo}` }, { quoted: shonux });
  } catch (e) {
    console.error('setlogo error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to set logo: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'jid': {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '🌹 *B L O O D Y  R O S E * 🌹'; // dynamic bot name

    const userNumber = sender.split('@')[0]; 

    // Reaction
    await socket.sendMessage(sender, { 
        react: { text: "🆔", key: msg.key } 
    });

    // Fake contact quoting for meta style
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_FAKE_ID" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, {
        text: `*🆔 Chat JID:* ${sender}\n*📞 Your Number:* +${userNumber}`,
    }, { quoted: shonux });
    break;
}

// use inside your switch(command) { ... } block

case 'block': {
  try {
    // caller number (who sent the command)
    const callerNumberClean = (senderNumber || '').replace(/[^0-9]/g, '');
    const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const sessionOwner = (number || '').replace(/[^0-9]/g, '');

    // allow if caller is global owner OR this session's owner
    if (callerNumberClean !== ownerNumberClean && callerNumberClean !== sessionOwner) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ ඔබට මෙය භාවිත කිරීමට අවසර නැත. (Owner හෝ මෙහි session owner විය යුතුයි)' }, { quoted: msg });
      break;
    }

    // determine target JID: reply / mention / arg
    let targetJid = null;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;

    if (ctx?.participant) targetJid = ctx.participant; // replied user
    else if (ctx?.mentionedJid && ctx.mentionedJid.length) targetJid = ctx.mentionedJid[0]; // mentioned
    else if (args && args.length > 0) {
      const possible = args[0].trim();
      if (possible.includes('@')) targetJid = possible;
      else {
        const digits = possible.replace(/[^0-9]/g,'');
        if (digits) targetJid = `${digits}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❗ කරුණාකර reply කරන හෝ mention කරන හෝ number එක යොදන්න. උදාහරණය: .block 9477xxxxxxx' }, { quoted: msg });
      break;
    }

    // normalize
    if (!targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;
    if (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;

    // perform block
    try {
      if (typeof socket.updateBlockStatus === 'function') {
        await socket.updateBlockStatus(targetJid, 'block');
      } else {
        // some bailey builds use same method name; try anyway
        await socket.updateBlockStatus(targetJid, 'block');
      }
      try { await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: `✅ @${targetJid.split('@')[0]} blocked successfully.`, mentions: [targetJid] }, { quoted: msg });
    } catch (err) {
      console.error('Block error:', err);
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ Failed to block the user. (Maybe invalid JID or API failure)' }, { quoted: msg });
    }

  } catch (err) {
    console.error('block command general error:', err);
    try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
    await socket.sendMessage(sender, { text: '❌ Error occurred while processing block command.' }, { quoted: msg });
  }
  break;
}

case 'unblock': {
  try {
    // caller number (who sent the command)
    const callerNumberClean = (senderNumber || '').replace(/[^0-9]/g, '');
    const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const sessionOwner = (number || '').replace(/[^0-9]/g, '');

    // allow if caller is global owner OR this session's owner
    if (callerNumberClean !== ownerNumberClean && callerNumberClean !== sessionOwner) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ ඔබට මෙය භාවිත කිරීමට අවසර නැත. (Owner හෝ මෙහි session owner විය යුතුයි)' }, { quoted: msg });
      break;
    }

    // determine target JID: reply / mention / arg
    let targetJid = null;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;

    if (ctx?.participant) targetJid = ctx.participant;
    else if (ctx?.mentionedJid && ctx.mentionedJid.length) targetJid = ctx.mentionedJid[0];
    else if (args && args.length > 0) {
      const possible = args[0].trim();
      if (possible.includes('@')) targetJid = possible;
      else {
        const digits = possible.replace(/[^0-9]/g,'');
        if (digits) targetJid = `${digits}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❗ කරුණාකර reply කරන හෝ mention කරන හෝ number එක යොදන්න. උදාහරණය: .unblock 9477xxxxxxx' }, { quoted: msg });
      break;
    }

    // normalize
    if (!targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;
    if (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;

    // perform unblock
    try {
      if (typeof socket.updateBlockStatus === 'function') {
        await socket.updateBlockStatus(targetJid, 'unblock');
      } else {
        await socket.updateBlockStatus(targetJid, 'unblock');
      }
      try { await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: `🔓 @${targetJid.split('@')[0]} unblocked successfully.`, mentions: [targetJid] }, { quoted: msg });
    } catch (err) {
      console.error('Unblock error:', err);
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ Failed to unblock the user.' }, { quoted: msg });
    }

  } catch (err) {
    console.error('unblock command general error:', err);
    try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
    await socket.sendMessage(sender, { text: '❌ Error occurred while processing unblock command.' }, { quoted: msg });
  }
  break;
}

case 'setbotname': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change this session bot name.' }, { quoted: shonux });
    break;
  }

  const name = args.join(' ').trim();
  if (!name) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Provide bot name. Example: `.setbotname NIKKA MINI - 01`' }, { quoted: shonux });
  }

  try {
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    cfg.botName = name;
    await setUserConfigInMongo(sanitized, cfg);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Bot display name set for this session: ${name}` }, { quoted: shonux });
  } catch (e) {
    console.error('setbotname error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to set bot name: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}

case 'showconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  try {
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SHOWCONFIG" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let txt = `*Session config for ${sanitized}:*\n`;
    txt += `• Bot name: ${botName}\n`;
    txt += `• Logo: ${cfg.logo || config.RCD_IMAGE_PATH}\n`;
    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('showconfig error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SHOWCONFIG2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Failed to load config.' }, { quoted: shonux });
  }
  break;
}

case 'resetconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RESETCONFIG1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can reset configs.' }, { quoted: shonux });
    break;
  }

  try {
    await setUserConfigInMongo(sanitized, {});

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RESETCONFIG2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: '✅ Session config reset to defaults.' }, { quoted: shonux });
  } catch (e) {
    console.error('resetconfig error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RESETCONFIG3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: '❌ Failed to reset config.' }, { quoted: shonux });
  }
  break;
}


        // default
        default:
          break;
      }
    } catch (err) {
      console.error('Command handler error:', err);
      try { await socket.sendMessage(sender, { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('❌ ERROR', 'An error occurred while processing your command. Please try again.', BOT_NAME_FANCY) }); } catch(e){}
    }

  });
}

// ---------------- message handlers ----------------

function setupMessageHandlers(socket) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
    if (config.AUTO_RECORDING === 'true') {
      try { await socket.sendPresenceUpdate('recording', msg.key.remoteJid); } catch (e) {}
    }
  });
}

// ---------------- cleanup helper ----------------

async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    try {
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption = formatMessage('👑 OWNER NOTICE — SESSION REMOVED', `Number: ${sanitized}\nSession removed due to logout.\n\nActive sessions now: ${activeSockets.size}`, BOT_NAME_FANCY);
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: config.RCD_IMAGE_PATH }, caption });
    } catch(e){}
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ---------------- auto-restart ----------------

function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
                         || lastDisconnect?.error?.statusCode
                         || (lastDisconnect?.error && lastDisconnect.error.toString().includes('401') ? 401 : undefined);
      const isLoggedOut = statusCode === 401
                          || (lastDisconnect?.error && lastDisconnect.error.code === 'AUTHENTICATION')
                          || (lastDisconnect?.error && String(lastDisconnect.error).toLowerCase().includes('logged out'))
                          || (lastDisconnect?.reason === DisconnectReason?.loggedOut);
      if (isLoggedOut) {
        console.log(`User ${number} logged out. Cleaning up...`);
        try { await deleteSessionAndCleanup(number, socket); } catch(e){ console.error(e); }
      } else {
        console.log(`Connection closed for ${number} (not logout). Attempt reconnect...`);
        try { await delay(10000); activeSockets.delete(number.replace(/[^0-9]/g,'')); socketCreationTime.delete(number.replace(/[^0-9]/g,'')); const mockRes = { headersSent:false, send:() => {}, status: () => mockRes }; await EmpirePair(number, mockRes); } catch(e){ console.error('Reconnect attempt failed', e); }
      }

    }

  });
}

// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------

async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(()=>{});
  // Prefill from Mongo if available
  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
      if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
      console.log('Prefilled creds from Mongo');
    }
  } catch (e) { console.warn('Prefill from Mongo failed', e); }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

 try {
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);
    handleMessageRevocation(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;
      while (retries > 0) {
        try { await delay(1500); code = await socket.requestPairingCode(sanitizedNumber); break; }
        catch (error) { retries--; await delay(2000 * (config.MAX_RETRIES - retries)); }
      }
      if (!res.headersSent) res.send({ code });
    }

    // Save creds to Mongo when updated
    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
        const credsObj = JSON.parse(fileContent);
        const keysObj = state.keys || null;
        await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
      } catch (err) { console.error('Failed saving creds on creds.update:', err); }
    });


    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        try {
          await delay(3000);
          const userJid = jidNormalizedUser(socket.user.id);
          const groupResult = await joinGroup(socket).catch(()=>({ status: 'failed', error: 'joinGroup not configured' }));

          // try follow newsletters if configured
          try {
            const newsletterListDocs = await listNewslettersFromMongo();
            for (const doc of newsletterListDocs) {
              const jid = doc.jid;
              try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch(e){}
            }
          } catch(e){}

          activeSockets.set(sanitizedNumber, socket);
          const groupStatus = groupResult.status === 'success' ? 'Joined successfully' : `Failed to join group: ${groupResult.error}`;

          // Load per-session config (botName, logo)
          const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};
          const useBotName = userConfig.botName || BOT_NAME_FANCY;
          const useLogo = userConfig.logo || config.RCD_IMAGE_PATH;

          const initialCaption = formatMessage(useBotName,
            `✅ සාර්ථකව සම්බන්ධ වෙනු ලැබිය!\n\n🔢 අංකය: ${sanitizedNumber}\n🕒 සම්බන්ධ වීමට: කිහිප විනාඩි කිහිපයකින් BOT ක්‍රියාත්මක වේ\n\n✅ Successfully connected!\n\n🔢 Number: ${sanitizedNumber}\n🕒 Connecting: Bot will become active in a few seconds`,
            useBotName
          );

          // send initial message
          let sentMsg = null;
          try {
            if (String(useLogo).startsWith('http')) {
              sentMsg = await socket.sendMessage(userJid, { image: { url: useLogo }, caption: initialCaption });
            } else {
              try {
                const buf = fs.readFileSync(useLogo);
                sentMsg = await socket.sendMessage(userJid, { image: buf, caption: initialCaption });
              } catch (e) {
                sentMsg = await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: initialCaption });
              }
            }
          } catch (e) {
            console.warn('Failed to send initial connect message (image). Falling back to text.', e?.message || e);
            try { sentMsg = await socket.sendMessage(userJid, { text: initialCaption }); } catch(e){}
          }

          await delay(4000);

          const updatedCaption = formatMessage(useBotName,
            `✅ සාර්ථකව සම්බන්ධ වී, දැන් ක්‍රියාත්මකයි!\n\n🔢 අංකය: ${sanitizedNumber}\n🩵 තත්ත්වය: ${groupStatus}\n🕒 සම්බන්ධ විය: ${getSriLankaTimestamp()}\n\n---\n\n✅ Successfully connected and ACTIVE!\n\n🔢 Number: ${sanitizedNumber}\n🩵 Status: ${groupStatus}\n🕒 Connected at: ${getSriLankaTimestamp()}`,
            useBotName
          );

          try {
            if (sentMsg && sentMsg.key) {
              try {
                await socket.sendMessage(userJid, { delete: sentMsg.key });
              } catch (delErr) {
                console.warn('Could not delete original connect message (not fatal):', delErr?.message || delErr);
              }
            }

            try {
              if (String(useLogo).startsWith('http')) {
                await socket.sendMessage(userJid, { image: { url: useLogo }, caption: updatedCaption });
              } else {
                try {
                  const buf = fs.readFileSync(useLogo);
                  await socket.sendMessage(userJid, { image: buf, caption: updatedCaption });
                } catch (e) {
                  await socket.sendMessage(userJid, { text: updatedCaption });
                }
              }
            } catch (imgErr) {
              await socket.sendMessage(userJid, { text: updatedCaption });
            }
          } catch (e) {
            console.error('Failed during connect-message edit sequence:', e);
          }

          // send admin + owner notifications as before, with session overrides
          await sendAdminConnectMessage(socket, sanitizedNumber, groupResult, userConfig);
          await sendOwnerConnectMessage(socket, sanitizedNumber, groupResult, userConfig);
          await addNumberToMongo(sanitizedNumber);

        } catch (e) { 
          console.error('Connection open error:', e); 
          try { exec(`pm2.restart ${process.env.PM2_NAME || 'NIKKA-MINI-main'}`); } catch(e) { console.error('pm2 restart failed', e); }
        }
      }
      if (connection === 'close') {
        try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
      }

    });


    activeSockets.set(sanitizedNumber, socket);

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }

}


// ---------------- endpoints (admin/newsletter management + others) ----------------

router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try {
    await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeNewsletterFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/newsletter/list', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.status(200).send({ status: 'ok', channels: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// admin endpoints

router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await addAdminToMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeAdminFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/admin/list', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.status(200).send({ status: 'ok', admins: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// existing endpoints (connect, reconnect, active, etc.)

router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  if (activeSockets.has(number.replace(/[^0-9]/g, ''))) return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  await EmpirePair(number, res);
});


router.get('/active', (req, res) => {
  res.status(200).send({ botName: BOT_NAME_FANCY, count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getSriLankaTimestamp() });
});


router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FANCY, message: '🇱🇰NIKKA  FREE BOT', activesession: activeSockets.size });
});


router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).send({ error: 'Failed to connect all bots' }); }
});


router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).send({ error: 'Failed to reconnect bots' }); }
});


router.get('/update-config', async (req, res) => {
  const { number, config: configString } = req.query;
  if (!number || !configString) return res.status(400).send({ error: 'Number and config are required' });
  let newConfig;
  try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).send({ error: 'Invalid config format' }); }
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const otp = generateOTP();
  otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
  try { await sendOTP(socket, sanitizedNumber, otp); res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' }); }
  catch (error) { otpStore.delete(sanitizedNumber); res.status(500).send({ error: 'Failed to send OTP' }); }
});


router.get('/verify-otp', async (req, res) => {
  const { number, otp } = req.query;
  if (!number || !otp) return res.status(400).send({ error: 'Number and OTP are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const storedData = otpStore.get(sanitizedNumber);
  if (!storedData) return res.status(400).send({ error: 'No OTP request found for this number' });
  if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).send({ error: 'OTP has expired' }); }
  if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });
  try {
    await setUserConfigInMongo(sanitizedNumber, storedData.newConfig);
    otpStore.delete(sanitizedNumber);
    const sock = activeSockets.get(sanitizedNumber);
    if (sock) await sock.sendMessage(jidNormalizedUser(sock.user.id), { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('📌 CONFIG UPDATED', 'Your configuration has been successfully updated!', BOT_NAME_FANCY) });
    res.status(200).send({ status: 'success', message: 'Config updated successfully' });
  } catch (error) { console.error('Failed to update config:', error); res.status(500).send({ error: 'Failed to update config' }); }
});


router.get('/getabout', async (req, res) => {
  const { number, target } = req.query;
  if (!number || !target) return res.status(400).send({ error: 'Number and target number are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  try {
    const statusData = await socket.fetchStatus(targetJid);
    const aboutStatus = statusData.status || 'No status available';
    const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
    res.status(200).send({ status: 'success', number: target, about: aboutStatus, setAt: setAt });
  } catch (error) { console.error(`Failed to fetch status for ${target}:`, error); res.status(500).send({ status: 'error', message: `Failed to fetch About status for ${target}.` }); }
});


// ---------------- Dashboard endpoints & static ----------------

const dashboardStaticDir = path.join(__dirname, 'dashboard_static');
if (!fs.existsSync(dashboardStaticDir)) fs.ensureDirSync(dashboardStaticDir);
router.use('/dashboard/static', express.static(dashboardStaticDir));
router.get('/dashboard', async (req, res) => {
  res.sendFile(path.join(dashboardStaticDir, 'index.html'));
});


// API: sessions & active & delete

router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) {
    console.error('API /api/sessions error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/active', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    if (running) {
      try { if (typeof running.logout === 'function') await running.logout().catch(()=>{}); } catch(e){}
      try { running.ws?.close(); } catch(e){}
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); } catch(e){}
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/newsletters', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});
router.get('/api/admins', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


// ---------------- cleanup + process events ----------------

process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws.close(); } catch (e) {}
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
  });
});


process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  try { exec(`pm2.restart ${process.env.PM2_NAME || 'NIKKA-MINI-main'}`); } catch(e) { console.error('Failed to restart pm2:', e); }
});


// initialize mongo & auto-reconnect attempt

initMongo().catch(err => console.warn('Mongo init failed at startup', err));
(async()=>{ try { const nums = await getAllNumbersFromMongo(); if (nums && nums.length) { for (const n of nums) { if (!activeSockets.has(n)) { const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes }; await EmpirePair(n, mockRes); await delay(500); } } } } catch(e){} })();

module.exports = router;

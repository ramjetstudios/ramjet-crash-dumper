import Router from '@koa/router';
import * as xml2js from 'xml2js';
import Database from './db';
import * as crypto from 'crypto';
import rawBody from 'raw-body';
import * as zlib from 'zlib';
import chalk from 'chalk';
import { Send as SendToDiscord } from './discord';

const ReadString = (ptr: number, dump: Buffer): [number, string] => {
  let read = 0;
  const len = dump.readUint32LE(ptr);
  ptr += 4;
  read += 4;

  let data = '';
  for (let i = 0; i < len; i++) {
    const code = dump.readUintLE(ptr, 1);
    if (code > 0) {
      data += String.fromCharCode(code);
    }
    ptr += 1;
    read += 1;
  }

  return [read, data];
};

export interface IUnrealDump {
  dumpID: string;
  dumpFilename: string;
  fileLen: number;
  files: { [key: string]: string };
}

export default function ReadUnrealDump(dump: Buffer): IUnrealDump {
  const files: { [key: string]: string } = {};

  let ptr = 0;
  const first =
    String.fromCharCode(dump.readUintLE(ptr, 1)) +
    String.fromCharCode(dump.readUintLE(ptr + 1, 1)) +
    String.fromCharCode(dump.readUintLE(ptr + 2, 1));

  if (first !== 'CR1') {
    throw new Error('bad file');
  }

  ptr += 3;

  const [n1, id] = ReadString(ptr, dump);
  ptr += n1;

  const [n2, dumpFilename] = ReadString(ptr, dump);
  ptr += n2;

  const fileLen = dump.readUInt32LE(ptr);
  ptr += 4;

  const fileCount = dump.readUint32LE(ptr);
  ptr += 8;

  for (let i = 0; i < fileCount; i++) {
    const [fnLen, fn] = ReadString(ptr, dump);
    ptr += fnLen;

    const [dataLen, data] = ReadString(ptr, dump);
    ptr += dataLen;

    if (i < fileCount - 1) {
      const idk = dump.readUint32LE(ptr);
      ptr += 4;
    }

    files[fn] = data;
  }

  return { files, fileLen, dumpFilename, dumpID: id };
}

export const CrashRouter = new Router();

CrashRouter.post('/', async (ctx) => {
  const body = await rawBody(ctx.req);

  let decompressed: Buffer;
  try {
    decompressed = await new Promise<Buffer>((res, rej) => {
      zlib.inflate(body, (err, ret) => {
        if (err) {
          rej(err);
        } else {
          res(ret);
        }
      });
    });
  } catch (err) {
    console.error(chalk.red(err));
    ctx.status = 400;
    ctx.body = { error: 'bad_body_compression' };
    return;
  }

  let data: IUnrealDump;
  try {
    data = ReadUnrealDump(decompressed);
  } catch (err) {
    console.error(chalk.red(err));
    ctx.status = 400;
    ctx.body = { error: 'bad_body' };
    return;
  }

  let stack: string = '';

  const propertiesForDiscord: { [key: string]: string } = {};

  if (data.files['CrashContext.runtime-xml']) {
    try {
      const xml = await xml2js.parseStringPromise(data.files['CrashContext.runtime-xml']);
      stack = xml.FGenericCrashContext.RuntimeProperties[0].CallStack[0];
      propertiesForDiscord['GPU'] = xml.FGenericCrashContext.RuntimeProperties[0]['Misc.PrimaryGPUBrand'][0];
      propertiesForDiscord['GPU Driver'] = xml.FGenericCrashContext.EngineData[0]['RHI.UserDriverVersion'][0];
      propertiesForDiscord['GPU Driver Date'] = xml.FGenericCrashContext.EngineData[0]['RHI.DriverDate'][0];
      propertiesForDiscord['CPU'] = xml.FGenericCrashContext.RuntimeProperties[0]['Misc.CPUBrand'][0];
      propertiesForDiscord['OS'] = xml.FGenericCrashContext.RuntimeProperties[0]['Misc.OSVersionMajor'][0];
      propertiesForDiscord['Page Size (MB)'] = xml.FGenericCrashContext.RuntimeProperties[0]['MemoryStats.PageSize'][0];
      propertiesForDiscord['Memory (GB)'] =
        xml.FGenericCrashContext.RuntimeProperties[0]['MemoryStats.TotalPhysicalGB'][0];
      propertiesForDiscord['Seconds Since Start'] =
        xml.FGenericCrashContext.RuntimeProperties[0]['SecondsSinceStart'][0];
    } catch (err) {
      console.error(chalk.red(err));
      ctx.status = 400;
      ctx.body = { error: 'bad_crash_context' };
      return;
    }
  }

  const stackCropped = stack.substring(0, 1023);
  let bFound = false;
  let dbID = '';
  try {
    await Database.transaction(async (db) => {
      const existing = await db<{ id: string; count: number }>('crashes')
        .select('id', 'count')
        .where('stack', stackCropped)
        .first();
      if (existing) {
        dbID = existing.id;
        bFound = true;
        await db('crashes')
          .update({
            count: existing.count + 1,
            last_seen: new Date(),
          })
          .where('id', existing.id);
      } else {
        dbID = crypto.randomUUID();
        await db('crashes').insert({
          id: dbID,
          stack: stackCropped,
        });
      }
    });
  } catch (err) {
    console.error(chalk.red(err));
  }

  if (bFound) {
    ctx.status = 204;
    return;
  }

  let messageId: string;
  try {
    messageId = await SendToDiscord(data.dumpID, propertiesForDiscord, data.files['Vein.log'], stack);
  } catch (err) {
    console.error(chalk.red(err));
    ctx.status = 500;
    return;
  }

  if (messageId && dbID) {
    await Database('crashes')
      .update({
        discord_message_id: messageId,
      })
      .where('id', dbID);
  }

  ctx.status = 201;
});

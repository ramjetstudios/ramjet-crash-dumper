import chalk from 'chalk';
import Koa from 'koa';
import Cors from '@koa/cors';
import Router from '@koa/router';
import rawBody from 'raw-body';
import * as zlib from 'zlib';
import DiscordInit, { Send as SendToDiscord, SendText } from './discord';
import ReadUnrealDump, { IUnrealDump } from './unreal';
import * as xml2js from 'xml2js';
import Database from './db';
import * as crypto from 'crypto';

const App = new Koa();
App.use(Cors());

const R = new Router();
R.post('/', async (ctx) => {
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
  try {
    await Database.transaction(async (db) => {
      const existing = await db('crashes').select('*').where('stack', stackCropped).first();
      if (existing) {
        await db('crashes')
          .update({
            count: existing.count + 1,
            last_seen: new Date(),
          })
          .where('id', existing.id);
      } else {
        const id = crypto.randomUUID();
        await db('crashes').insert({
          id,
          stack: stackCropped,
        });
      }
    });
  } catch (err) {
    console.error(chalk.red(err));
  }

  const filters = (process.env.CRASH_FILTERS || '').split(',').map((v) => v.trim());
  for (const filter of filters) {
    if (filter && stack.includes(filter)) {
      try {
        await SendText(`\`${filter} crash - ignoring.\``);
        ctx.status = 201;
      } catch (err) {
        console.error(chalk.red(err));
        ctx.status = 500;
      }
      return;
    }
  }

  try {
    await SendToDiscord(data.dumpID, propertiesForDiscord, data.files['Vein.log'], stack);
  } catch (err) {
    console.error(chalk.red(err));
    ctx.status = 500;
    return;
  }

  ctx.status = 201;
});
App.use(R.allowedMethods()).use(R.routes());

DiscordInit().then(() => {
  App.listen(process.env.PORT, async () => {
    console.log(chalk.gray(`Listening on ${chalk.red(process.env.PORT)}.`));
  });
});

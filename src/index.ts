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
import bodyParser from 'koa-bodyparser';
import Joi from 'joi';

const App = new Koa();
App.use(Cors());

const R = new Router();

interface IFeedback {
  body: string;
}

const JFeedback = Joi.object<IFeedback>({
  body: Joi.string().required().max(8192),
});

R.post('/feedback', bodyParser(), async (ctx) => {
  const steamID = ctx.request.headers.authorization;
  if (!steamID) {
    ctx.status = 401;
    return;
  }

  let body: IFeedback;
  try {
    body = await JFeedback.validateAsync(ctx.request.body);
  } catch (err) {
    console.error(chalk.red(err));
    ctx.status = 400;
    return;
  }

  await Database.transaction(async (t) => {
    const id = crypto.randomUUID();
    const f = await t('feedback').insert({
      id,
      author: steamID,
      description: body.body,
    });

    const vid = crypto.randomUUID();
    await t('feedback_votes').insert({
      id: vid,
      feedback_id: id,
      author: steamID,
      vote: 1,
    });
  });

  ctx.status = 201;
});

interface IFeedbackVote {
  vote: -1 | 0 | 1;
}

const JFeedbackVote = Joi.object<IFeedbackVote>({
  vote: Joi.number().integer().only().allow(-1, 0, 1),
});

R.post('/feedback/:id/vote', bodyParser(), async (ctx) => {
  const steamID = ctx.request.headers.authorization;
  if (!steamID) {
    ctx.status = 401;
    return;
  }

  const feedbackItem = await Database('feedback').select('id').where('id', ctx.params.id).first();
  if (!feedbackItem) {
    ctx.status = 400;
    return;
  }

  let body: IFeedbackVote;
  try {
    body = await JFeedbackVote.validateAsync(ctx.request.body);
  } catch (err) {
    console.error(chalk.red(err));
    ctx.status = 400;
    return;
  }

  const existing = await Database('feedback_votes')
    .select('*')
    .where({ author: steamID, feedback_id: ctx.params.id })
    .first();

  if (existing) {
    await Database('feedback_votes')
      .update({
        vote: body.vote,
      })
      .where({ id: existing.id });
  } else {
    const id = crypto.randomUUID();
    await Database('feedback_votes').insert({
      id,
      feedback_id: ctx.params.id,
      author: steamID,
      vote: body.vote,
    });
  }

  ctx.status = 204;
});

interface IFeedbackResponse {
  id: string;
  created_at: string;
  description: string;
  my_vote: -1 | 0 | 1;
  upvotes: number;
  downvotes: number;
}

R.get('/feedback', async (ctx) => {
  const steamID = ctx.request.headers.authorization;

  const allFeedback = await Database('feedback').select({
    id: 'feedback.id',
    created_at: 'feedback.created_at',
    description: 'description',
  });

  const ret: IFeedbackResponse[] = [];

  for (const f of allFeedback) {
    let myVoteVal: -1 | 0 | 1 = 0;
    if (steamID) {
      const myVote = await Database('feedback_votes')
        .select('vote')
        .where({
          feedback_id: f.id,
          author: steamID,
        })
        .first();
      myVoteVal = myVote ? myVote.vote : 0;
    }

    const upvotes = await Database('feedback_votes').count({ c: '*' }).where({ feedback_id: f.id, vote: 1 });
    const downvotes = await Database('feedback_votes').count({ c: '*' }).where({ feedback_id: f.id, vote: -1 });

    ret.push({
      ...f,
      my_vote: myVoteVal,
      upvotes: parseInt(upvotes[0].c, 10),
      downvotes: parseInt(downvotes[0].c, 10),
    });
  }

  ctx.status = 200;
  ctx.body = ret;
});

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
  let bFound = false;
  try {
    await Database.transaction(async (db) => {
      const existing = await db('crashes').select('*').where('stack', stackCropped).first();
      if (existing) {
        bFound = true;
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

  if (bFound) {
    ctx.status = 204;
    return;
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

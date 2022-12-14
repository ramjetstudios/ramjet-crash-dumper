import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import Joi from 'joi';
import Database from './db';
import chalk from 'chalk';
import * as crypto from 'crypto';
import * as filter from 'leo-profanity';

const R = new Router();

interface IFeedback {
  name: string;
  body: string;
  game_version: string;
}

const JFeedback = Joi.object<IFeedback>({
  name: Joi.string().optional().allow('').default('').max(200),
  body: Joi.string().required().max(8192).trim(),
  game_version: Joi.string().optional().allow('').default('').max(32),
});

R.post('/', bodyParser(), async (ctx) => {
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
      user_name: filter.clean(body.name),
      author: steamID,
      description: filter.clean(body.body),
      game_version: filter.clean(body.game_version),
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

R.post('/:id/vote', bodyParser(), async (ctx) => {
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
    .select('id')
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

R.get('/known-bugs', async (ctx) => {
  ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  ctx.set('Pragma', 'no-cache');
  ctx.set('Expires', '0');

  const row = await Database<{ text: string }>('known_bugs').select({ text: 'text' }).first();
  if (!row) {
    ctx.body = 'Todo.';
    return;
  }

  ctx.body = row.text;
});

interface IFeedbackResponse {
  id: string;
  created_at: string;
  description: string;
  my_vote: -1 | 0 | 1;
  upvotes: number;
  downvotes: number;
  developer_response_type: string;
  developer_response: string;
}

R.get('/', async (ctx) => {
  ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  ctx.set('Pragma', 'no-cache');
  ctx.set('Expires', '0');

  const steamID = ctx.request.headers.authorization;

  const gameVersion = ctx.request.headers['x-gameversion'] || 'unknown';

  let allFeedbackPromise = Database('feedback').select({
    id: 'feedback.id',
    created_at: 'feedback.created_at',
    description: 'description',
    developer_response_type: 'developer_response_type',
    developer_response: 'developer_response',
    game_version: 'game_version',
  });

  if (gameVersion !== 'unknown') {
    allFeedbackPromise = allFeedbackPromise.where('game_version', gameVersion);
  }

  const allFeedback = await allFeedbackPromise;

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
      developer_response_type: f.developer_response_type || '',
      developer_response: f.developer_response || '',
      upvotes: parseInt(upvotes[0].c, 10),
      downvotes: parseInt(downvotes[0].c, 10),
    });
  }

  ctx.status = 200;
  ctx.body = ret;
});

export default R;

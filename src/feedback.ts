import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import Joi from 'joi';
import Database from './db';
import chalk from 'chalk';

const R = new Router();

interface IFeedback {
  body: string;
}

const JFeedback = Joi.object<IFeedback>({
  body: Joi.string().required().max(8192),
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

R.get('/', async (ctx) => {
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

export default R;
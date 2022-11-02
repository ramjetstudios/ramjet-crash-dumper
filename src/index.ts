import chalk from 'chalk';
import Koa from 'koa';
import Cors from '@koa/cors';
import Router from '@koa/router';
import DiscordInit from './discord';
import FeedbackRouter from './feedback';
import { CrashRouter } from './crashes';

const App = new Koa();
App.use(Cors());

const R = new Router();

R.use('/feedback', FeedbackRouter.allowedMethods(), FeedbackRouter.routes());
R.use('/', CrashRouter.allowedMethods(), CrashRouter.routes());

App.use(R.allowedMethods()).use(R.routes());

DiscordInit().then(() => {
  App.listen(process.env.PORT, async () => {
    console.log(chalk.gray(`Listening on ${chalk.red(process.env.PORT)}.`));
  });
});

import fetch from 'node-fetch';
import { parse } from 'node-html-parser';

export const GetWishlists = async (): Promise<number> => {
  const resp = await fetch(`https://partner.steampowered.com/app/details/1857950/`, {
    method: 'GET',
    headers: {
      cookie: `steamLoginSecure=76561197994984598...todo`,
    },
  });
  const text = await resp.text();
  const page = parse(text);

  const td = page.querySelector(
    `td[title="Outstanding wishes - does not include owners of the game. Click the '+' for stats on owners who had previously wished for this game."]`
  );
  const val = td.textContent;
  const numVal = parseInt(val.trim().split(',').join(''));
  return numVal;
};

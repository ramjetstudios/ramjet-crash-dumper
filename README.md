# ramjet-crash-dumper

Throws stacktraces from crashes from Unreal Engine's reporter into a Discord channel.

# Setup

Fill out the env vars below. The package uses `dotenv` so during testing you can put these in a `.env` file.

Update `DataRouterUrl` in `UnrealEngine/Engine/Programs/CrashReportClient/Config/DefaultEngine.ini` to point to wherever this is hosted.

# Env vars

## `PORT=8080`

The port to run the server on.

## `DISCORD_BOT_TOKEN=...`

Your Discord bot's token, from the Discord developer portal.

## `DISCORD_CHANNEL_ID=1021137012004225044`

The Discord channel for your bot to post dumps to.

## `CRASH_FILTERS=a,b,c,...`

Comma-separated list of filters. If a stack passes this filter, the dump is ignored and a smaller message is sent. Useful for engine crashes that you can't fix.

import pino from 'pino'

const level = process.env.LOG_LEVEL ?? 'info'
const pretty = process.env.LOG_FORMAT !== 'json' && process.stdout.isTTY

export const log = pino(
  pretty
    ? {
        level,
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' }
        }
      }
    : { level }
)

export type Logger = typeof log

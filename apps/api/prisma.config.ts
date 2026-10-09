import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // validate/generate do not connect; runtime/migration must receive an explicit server URL.
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@127.0.0.1:5434/finntech_tracker_f14_test' },
})

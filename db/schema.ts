import {sqliteTable,text,integer,primaryKey,index} from 'drizzle-orm/sqlite-core';

export const players=sqliteTable('players',{
  owner:text('owner').primaryKey(),
  revision:integer('revision').notNull().default(0),
  state:text('state').notNull(),
  updatedAt:integer('updated_at').notNull()
});
export const flights=sqliteTable('flights',{
  owner:text('owner').notNull(),id:text('id').notNull(),
  status:text('status').notNull(),startedAt:integer('started_at').notNull(),
  updatedAt:integer('updated_at').notNull(),completedAt:integer('completed_at'),sequence:integer('sequence').notNull(),
  selectedLevel:integer('selected_level').notNull(),actualLevel:integer('actual_level').notNull(),
  outcome:text('outcome'),record:text('record').notNull()
},t=>[primaryKey({columns:[t.owner,t.id]}),index('flights_owner_started').on(t.owner,t.startedAt,t.id)]);

export const supportChoices=sqliteTable('support_choices',{
 owner:text('owner').notNull(),id:text('id').notNull(),offerId:text('offer_id').notNull(),
 selectedLevel:integer('selected_level').notNull(),epoch:integer('epoch').notNull(),
 accept:integer('accept').notNull(),at:integer('at').notNull()
},t=>[primaryKey({columns:[t.owner,t.id]}),index('support_choices_owner_time').on(t.owner,t.at)]);
